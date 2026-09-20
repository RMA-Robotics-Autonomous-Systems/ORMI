import type { Feature, LineString, Point, Polygon } from "geojson";

import { C2Feature } from "../types/c2-types";
import { generateMissionId } from "./mission-list";

/**
 * Pure terra-draw-snapshot ↔ `C2Feature` (MapDB) mapping.
 *
 * No map, no React, no fetch — just the geometry/property translation so it can
 * be unit-tested directly.
 *
 * ⚠ COORDINATE RULE — `[lng, lat]` order is preserved end-to-end; there is NO
 * swap in this module (the only swap in the whole system is the
 * `mission_feedback` waypoints, handled by the parser in `mission-feedback.ts`).
 *
 * ⚠ NESTING RULE — the terra-draw snapshot and the saved MapDB `C2Feature` are
 * full GeoJSON (a Polygon's `coordinates` is triple-nested `[[[lng,lat],…]]`).
 * MapDB feature storage keeps that GeoJSON shape verbatim (its schema allows any
 * nesting) — see {@link drawFeatureToC2Feature}. The mission-config inline
 * geometry is the ONE place nesting changes: the C2 mission parser
 * (`MissionConfig.hpp`, `MissionGeometry::FromJson`) reads `coords[i][0]` /
 * `coords[i][1]` as each vertex's lon/lat, i.e. a FLAT vertex list, NOT GeoJSON.
 * A single vertex is `[lng,lat]` (1 level); a line / ring / multi-vertex is
 * `[[lng,lat],…]` (2 levels). A GeoJSON triple-nested Polygon breaks the C2, so
 * {@link drawFeatureToInlineGeometry} flattens to that flat form.
 *
 * The persisted `feature_id` is an ORMI-generated UUID stored in
 * `properties.feature_id` — NOT terra-draw's internal numeric/string `id`, which
 * is volatile per draw session. On create we mint a fresh id; on edit we
 * preserve the incoming one.
 */

/** A terra-draw snapshot feature (GeoJSON Feature with Point/Line/Polygon). */
export type DrawFeature = Feature<Point | LineString | Polygon>;

/** Extra metadata authored alongside a drawn geometry. */
export interface FeatureMeta {
	/** Operator-facing name. */
	name: string;
	/** Domain tag (geofence, road, poi, …) stored in `properties.feature_type`. */
	feature_type: string;
	/**
	 * Preserve this `feature_id` (edit flow). When omitted, a fresh UUID is
	 * generated (create flow).
	 */
	feature_id?: string;
}

/**
 * Convert a terra-draw snapshot feature into the persisted `C2Feature` (MapDB)
 * GeoJSON shape.
 *
 * Coordinates pass through unchanged — full GeoJSON shape and `[lng, lat]` order
 * (MapDB's feature schema allows any nesting; this is NOT the flattened C2
 * mission form). The result's `properties.feature_id` is the ORMI UUID —
 * provided (edit) or freshly minted (create) — NOT the terra-draw `id`.
 *
 * @param drawn - The terra-draw snapshot feature.
 * @param meta - Name / feature_type / optional feature_id to carry.
 * @returns A `C2Feature` ready for `c2.features.save`.
 */
export function drawFeatureToC2Feature(
	drawn: DrawFeature,
	meta: FeatureMeta,
): C2Feature {
	const featureId = meta.feature_id ?? generateMissionId();
	return {
		type: "Feature",
		properties: {
			feature_id: featureId,
			name: meta.name,
			feature_type: meta.feature_type,
		},
		geometry: {
			type: drawn.geometry.type,
			// [lng, lat] preserved verbatim — no swap.
			coordinates: drawn.geometry.coordinates,
		},
	};
}

/**
 * Read the persisted `feature_id` off a stored `C2Feature`, tolerating a missing
 * `properties` block. Returns `null` when none is present.
 * @param feature - A stored MapDB feature.
 * @returns The `feature_id`, or `null`.
 */
export function readFeatureId(feature: C2Feature): string | null {
	const id = feature.properties?.feature_id;
	return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Convert a stored `C2Feature` back into a terra-draw snapshot feature so the
 * operator can load it into the authoring layer for editing.
 *
 * The persisted `feature_id` is carried into `properties.feature_id` so a
 * subsequent save round-trips under the same id (edit, not create). terra-draw's
 * own `id` is left undefined — it will assign a fresh session id on add.
 * Coordinates pass through unchanged (`[lng, lat]`).
 *
 * @param feature - The stored MapDB feature.
 * @returns A terra-draw feature, or `null` when the geometry is unusable.
 */
export function c2FeatureToDrawFeature(feature: C2Feature): DrawFeature | null {
	const geometry = feature.geometry;
	if (!geometry || geometry.coordinates === undefined) return null;

	// MULTI-PART GEOMETRY. The C2 backend accepts (and MapLibre renders)
	// `MultiLineString` / `MultiPolygon`, but this converter used to return null
	// for them, so such a feature displayed on the map and then refused to open
	// for editing with no explanation.
	//
	// A SINGLE-part multi is unwrapped: it is the same shape wearing a different
	// type tag, which is how most backends emit one polygon, and refusing it lost
	// nothing but cost the operator the edit. A genuinely multi-part geometry is
	// still refused — terra-draw authors one part, and silently editing part 0
	// would drop the rest on save, which is worse than not editing at all. The
	// caller surfaces {@link describeUneditableGeometry} to say which case it hit.
	const unwrapped = unwrapSinglePartGeometry(
		geometry.type,
		geometry.coordinates,
	);
	const type = unwrapped?.type ?? geometry.type;
	const coordinates = unwrapped?.coordinates ?? geometry.coordinates;

	if (type !== "Point" && type !== "LineString" && type !== "Polygon") {
		return null;
	}

	const props: Record<string, unknown> = {};
	const featureId = readFeatureId(feature);
	if (featureId) props.feature_id = featureId;
	if (typeof feature.properties?.name === "string") {
		props.name = feature.properties.name;
	}
	if (typeof feature.properties?.feature_type === "string") {
		props.feature_type = feature.properties.feature_type;
	}

	return {
		type: "Feature",
		properties: props as DrawFeature["properties"],
		geometry: {
			type,
			coordinates,
		} as DrawFeature["geometry"],
	};
}

/** GeoJSON multi-part types and the single-part type each collapses to. */
const MULTI_TO_SINGLE: Record<string, "Point" | "LineString" | "Polygon"> = {
	MultiPoint: "Point",
	MultiLineString: "LineString",
	MultiPolygon: "Polygon",
};

/**
 * Collapse a single-part `Multi*` geometry to its singular form.
 *
 * @param type - The GeoJSON geometry type.
 * @param coordinates - Its coordinates.
 * @returns The unwrapped `{ type, coordinates }`, or null when `type` is not a
 *   `Multi*` or the geometry genuinely has more (or fewer) than one part.
 */
export function unwrapSinglePartGeometry(
	type: string | undefined,
	coordinates: unknown,
): { type: "Point" | "LineString" | "Polygon"; coordinates: unknown } | null {
	if (!type) return null;
	const single = MULTI_TO_SINGLE[type];
	if (!single) return null;
	if (!Array.isArray(coordinates) || coordinates.length !== 1) return null;
	return { type: single, coordinates: coordinates[0] };
}

/**
 * Explain why a stored feature cannot be loaded into the authoring layer, or
 * null when it can.
 *
 * Exists so the map can say *which* limitation it hit instead of the flat
 * "Feature geometry can't be edited" it used to show for every cause — a
 * multi-part geometry, an unsupported type and a malformed one need different
 * responses from the operator.
 *
 * @param feature - The stored MapDB feature.
 * @returns A message, or null when the feature is editable.
 */
export function describeUneditableGeometry(feature: C2Feature): string | null {
	if (c2FeatureToDrawFeature(feature) != null) return null;
	const type = feature.geometry?.type;
	if (type && MULTI_TO_SINGLE[type]) {
		const parts = Array.isArray(feature.geometry?.coordinates)
			? (feature.geometry.coordinates as unknown[]).length
			: 0;
		return `This feature is a ${type} with ${parts} parts. It is stored and drawn correctly, but the drawing tools edit one part at a time — editing it here would drop the others. Delete and redraw it, or edit it outside the map.`;
	}
	if (!feature.geometry || feature.geometry.coordinates === undefined) {
		return "This feature has no geometry to edit.";
	}
	return `Geometry type "${String(type)}" can't be edited on the map.`;
}

/**
 * Build the inline `objective.geometries[]` entry for a drawn geometry, in the
 * mission-config shape `{ geometry: { geometry_type, coordinates } }`.
 *
 * Flattens terra-draw's GeoJSON `coordinates` to the C2's flat vertex list (the
 * only place in this module where nesting changes; `[lng, lat]` order is still
 * preserved, and MapDB feature storage stays full GeoJSON):
 *
 * - **Point** → `[[lng, lat]]` (2 levels, a single-vertex list). The C2 mission
 *   parser reads a Point's vertex as `coordinates[0]`, and the Mongo mission
 *   schema is `coordinates: [[Number]]` (2-level); emitting a bare 1-level
 *   `[lng, lat]` makes the C2 read `coordinates[0]` as a lone number. So the
 *   GeoJSON `[lng, lat]` is wrapped into a one-element vertex list here.
 * - **LineString** → `[[lng, lat], …]` (2 levels), as-is.
 * - **Polygon** → the OUTER RING only (`coordinates[0]` → `[[lng, lat], …]`,
 *   2 levels). terra-draw polygons are single-ring; the GeoJSON outer wrapper is
 *   dropped so the C2 can read `coords[i][0]`/`coords[i][1]` as each vertex.
 *
 * `geometry_type` is the GeoJSON type string — the C2 treats it as a label only.
 * Defensive: a missing/odd `coordinates` value is passed through unchanged rather
 * than throwing.
 *
 * @param drawn - A terra-draw snapshot feature.
 * @returns The inline geometry entry in the C2 flat vertex form.
 */
export function drawFeatureToInlineGeometry(drawn: DrawFeature): {
	geometry: { geometry_type: string; coordinates: unknown };
} {
	const type = drawn.geometry.type;
	const raw = drawn.geometry.coordinates;

	let coordinates: unknown = raw;
	// Polygon: drop the GeoJSON outer ring wrapper, keep ring 0 (the outer ring).
	if (type === "Polygon" && Array.isArray(raw) && Array.isArray(raw[0])) {
		coordinates = raw[0];
	}
	// Point: wrap the GeoJSON `[lng, lat]` into a single-vertex list `[[lng, lat]]`
	// (2-level) so the C2 reads the vertex as `coordinates[0]` and the Mongo
	// `[[Number]]` schema matches without coercion.
	else if (
		type === "Point" &&
		Array.isArray(raw) &&
		typeof raw[0] === "number"
	) {
		coordinates = [raw];
	}

	return {
		geometry: {
			geometry_type: type,
			coordinates,
		},
	};
}
