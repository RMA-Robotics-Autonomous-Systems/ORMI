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
 * `[[lng,lat],…]` (2 levels). Nothing in this module WRITES that form any more
 * — a drawn shape becomes a MapDB feature and a mission references it by
 * `feature_id`. `mission-geometry.ts` still READS it, for missions stored
 * before that was true.
 *
 * The persisted `feature_id` is an ORMI-generated UUID stored in
 * `properties.feature_id` — NOT terra-draw's internal numeric/string `id`, which
 * is volatile per draw session. On create we mint a fresh id; on edit we
 * preserve the incoming one.
 */

/** A terra-draw snapshot feature (GeoJSON Feature with Point/Line/Polygon). */
export type DrawFeature = Feature<Point | LineString | Polygon>;

/**
 * Every `feature_type` the MapDB accepts, mirroring the backend's
 * `VALID_FEATURE_TYPES` (`mongodb-server.js`).
 *
 * `waypoint`, `zone` and `cue` are the ASSET types: the mission-behaviour graph
 * names an asset by `feature_id` and never carries coordinates, so a point, an
 * area and an operator-placed cue all have exactly one home — the map. Keeping
 * the list here (rather than a literal in the map widget) is what stops the
 * client from silently refusing a type the server has started accepting, which
 * is the same class of defect as the server silently dropping a property the
 * client sent.
 */
export const FEATURE_TYPES = [
	"road",
	"geofence",
	"risk",
	"waypoint",
	"zone",
	"cue",
] as const;

/** A MapDB `feature_type` — the only values the C2 accepts. */
export type FeatureType = (typeof FEATURE_TYPES)[number];

/**
 * The geometry each `feature_type` must carry. The backend validates this
 * server-side (`GEOM_FOR_TYPE`), so the authoring toolbar constrains the draw
 * shape to match rather than letting the operator finish a draw the save will
 * reject.
 */
export const FEATURE_TYPE_GEOMETRY: Record<
	FeatureType,
	"line" | "polygon" | "point"
> = {
	road: "line",
	geofence: "polygon",
	risk: "polygon",
	waypoint: "point",
	zone: "polygon",
	cue: "point",
};

/**
 * The feature types a feature of `type` may be RE-TYPED to, itself included.
 *
 * A retype is a `PUT /maps/:name/features/:featureId`, which replaces the
 * document through the backend's `normalizeFeature` — and that validates the
 * new `feature_type` against the same `GEOM_FOR_TYPE` table
 * {@link FEATURE_TYPE_GEOMETRY} mirrors. So a retype is legal only **within a
 * geometry class**: an area may become another kind of area, a point another
 * kind of point, and a `road` (the sole line type) has nowhere to go.
 *
 * Derived from {@link FEATURE_TYPE_GEOMETRY} rather than written out as a
 * second table. A hardcoded list is a list that can disagree with the one the
 * draw toolbar already reads, and the operator learns about the disagreement as
 * a save the server rejects.
 *
 * Order follows {@link FEATURE_TYPES}, so the picker does not reshuffle between
 * two features of the same class.
 *
 * @param type - The feature's current type.
 * @returns Every type sharing its geometry class, `type` included.
 */
export function retypeTargets(type: FeatureType): FeatureType[] {
	const geometry = FEATURE_TYPE_GEOMETRY[type];
	return FEATURE_TYPES.filter(
		(candidate) => FEATURE_TYPE_GEOMETRY[candidate] === geometry,
	);
}

/**
 * Whether re-typing a feature from `from` to `to` is something the server will
 * accept — i.e. whether both types take the same geometry.
 *
 * `from === to` is trivially legal (a rename that leaves the type alone).
 *
 * @param from - The feature's current type.
 * @param to - The type the operator picked.
 * @returns True when the retype is legal.
 */
export function canRetypeFeature(from: FeatureType, to: FeatureType): boolean {
	return FEATURE_TYPE_GEOMETRY[from] === FEATURE_TYPE_GEOMETRY[to];
}

/** How each geometry class is named to an operator. */
export const GEOMETRY_CLASS_LABELS: Record<
	"line" | "polygon" | "point",
	string
> = {
	line: "line",
	polygon: "area",
	point: "point",
};

/** Operator-facing label per {@link FeatureType}, for the authoring pickers. */
export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
	road: "Road (line)",
	geofence: "Geofence (area)",
	risk: "Risk (area)",
	waypoint: "Waypoint (point)",
	zone: "Zone (area)",
	cue: "Cue (point)",
};

/** Whether a value is one of the MapDB feature types. */
export function isFeatureType(value: unknown): value is FeatureType {
	return (
		typeof value === "string" &&
		(FEATURE_TYPES as readonly string[]).includes(value)
	);
}

/**
 * Sub-classifications offered for an asset's `properties.category`.
 *
 * A holding position is the motivating case: a `waypoint` an effector agent
 * waits at until it is dispatched is not the same thing as a waypoint it drives
 * through, and until the server started preserving arbitrary properties there
 * was nowhere to say so. The server declares `category` on the feature-property
 * sub-schema and accepts any string, so this list is an authoring convenience —
 * widening it is one array, and a `category` that arrived from elsewhere is
 * preserved verbatim rather than being coerced into one of these.
 */
export const ASSET_CATEGORIES = [
	"holding",
	"rally",
	"observation",
	"staging",
	"entry",
	"exit",
] as const;

/** Which feature types carry a `category` in the authoring UI. */
export const CATEGORISED_FEATURE_TYPES: readonly FeatureType[] = [
	"waypoint",
	"zone",
	"cue",
];

/**
 * Property keys terra-draw owns on a snapshot feature.
 *
 * A drawn feature's `properties` is terra-draw's bookkeeping (its mode, its
 * timestamps, its selection state), not the operator's data, so these are
 * dropped on the way to MapDB. This is a denylist, which is normally the wrong
 * shape — but here it fails in the harmless direction: a key terra-draw adds
 * later is *persisted as noise*, never lost. The failure this module exists to
 * prevent is the opposite one, a property silently discarded.
 *
 * Mirrors terra-draw's `COMMON_PROPERTIES` / `SELECT_PROPERTIES` plus the
 * store's tracked timestamps (terra-draw 1.31.2).
 */
const TERRA_DRAW_PROPERTY_KEYS: readonly string[] = [
	"mode",
	"createdAt",
	"updatedAt",
	"currentlyDrawing",
	"edited",
	"closingPoint",
	"snappingPoint",
	"coordinatePoint",
	"coordinatePointFeatureId",
	"coordinatePointIds",
	"provisionalCoordinateCount",
	"committedCoordinateCount",
	"marker",
	"selected",
	"midPoint",
	"selectionPointFeatureId",
	"selectionPoint",
];

/** The three identity fields `drawFeatureToC2Feature` always pins itself. */
const IDENTITY_PROPERTY_KEYS: readonly string[] = [
	"feature_id",
	"name",
	"feature_type",
];

/**
 * The operator-meaningful properties on a drawn feature: everything that is
 * neither terra-draw bookkeeping nor an identity field the caller re-states.
 *
 * @param properties - A draw feature's `properties` bag (may be null).
 * @returns A fresh object carrying only the pass-through properties.
 */
function passThroughProperties(
	properties: DrawFeature["properties"],
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!properties || typeof properties !== "object") return out;
	for (const [key, value] of Object.entries(
		properties as Record<string, unknown>,
	)) {
		if (value === undefined) continue;
		if (TERRA_DRAW_PROPERTY_KEYS.includes(key)) continue;
		if (IDENTITY_PROPERTY_KEYS.includes(key)) continue;
		out[key] = value;
	}
	return out;
}

/** Extra metadata authored alongside a drawn geometry. */
export interface FeatureMeta {
	/** Operator-facing name. */
	name: string;
	/** Domain tag (geofence, road, waypoint, zone, cue, …) stored in `properties.feature_type`. */
	feature_type: string;
	/**
	 * Preserve this `feature_id` (edit flow). When omitted, a fresh UUID is
	 * generated (create flow).
	 */
	feature_id?: string;
	/**
	 * Asset sub-classification, stored in `properties.category` (the server
	 * declares it). An empty string REMOVES a category the feature used to
	 * carry; `undefined` leaves whatever the pass-through carried untouched.
	 */
	category?: string;
	/**
	 * Further properties to persist verbatim, overlaid on top of whatever the
	 * drawn feature carried.
	 *
	 * The edit path supplies the stored feature's own property bag here, so a
	 * property this build does not know about survives a round trip through the
	 * authoring layer instead of being dropped on save — the client-side half of
	 * the defect the backend just fixed on its side.
	 */
	properties?: Record<string, unknown>;
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
 * ⚠ PROPERTIES ARE CARRIED, NOT REBUILT. This used to emit exactly
 * `{feature_id, name, feature_type}`, so every other property an asset carried
 * — a waypoint's `category`, a cue's confidence, a zone's required coverage —
 * was discarded on the way out of the editor. The backend had the mirror-image
 * defect (`normalizeFeature` rebuilt `properties` from the same three fields
 * and still answered 200) and has been fixed; a client that still rebuilds them
 * keeps the loss with nothing on screen to report it. Precedence, lowest first:
 * the drawn feature's own pass-through properties, then `meta.properties`, then
 * the identity fields and `category`, which are always the caller's.
 *
 * @param drawn - The terra-draw snapshot feature.
 * @param meta - Name / feature_type / optional feature_id / category / extra
 *   properties to carry.
 * @returns A `C2Feature` ready for `c2.features.save`.
 */
export function drawFeatureToC2Feature(
	drawn: DrawFeature,
	meta: FeatureMeta,
): C2Feature {
	const featureId = meta.feature_id ?? generateMissionId();
	const properties: Record<string, unknown> = {
		...passThroughProperties(drawn.properties),
		...(meta.properties ?? {}),
	};
	// Identity is never pass-through: it is what the caller just stated.
	for (const key of IDENTITY_PROPERTY_KEYS) delete properties[key];
	for (const key of TERRA_DRAW_PROPERTY_KEYS) delete properties[key];

	if (meta.category !== undefined) {
		// An empty string is an explicit "no category", which must REMOVE one
		// the feature used to carry rather than persisting a blank.
		const category = meta.category.trim();
		if (category) properties.category = category;
		else delete properties.category;
	}

	return {
		type: "Feature",
		properties: {
			...properties,
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
 * Read a stored feature's `properties.category`, or null when it carries none.
 *
 * @param feature - A stored MapDB feature.
 * @returns The trimmed category, or `null`.
 */
export function readFeatureCategory(feature: C2Feature): string | null {
	const category = feature.properties?.category;
	if (typeof category !== "string") return null;
	const trimmed = category.trim();
	return trimmed.length > 0 ? trimmed : null;
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

	// Everything the stored feature carries rides onto the draw feature, so a
	// property this build does not know about survives the authoring round trip
	// (`drawFeatureToC2Feature` passes it straight back). The four fields the
	// authoring UI reads are then normalised on top: a non-string `name` /
	// `feature_type` / `category` is dropped rather than shown, because a
	// picker that renders `[object Object]` is worse than one that renders the
	// default.
	const props: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(feature.properties ?? {})) {
		if (value === undefined) continue;
		props[key] = value;
	}
	delete props.feature_id;
	delete props.name;
	delete props.feature_type;
	delete props.category;

	const featureId = readFeatureId(feature);
	if (featureId) props.feature_id = featureId;
	if (typeof feature.properties?.name === "string") {
		props.name = feature.properties.name;
	}
	if (typeof feature.properties?.feature_type === "string") {
		props.feature_type = feature.properties.feature_type;
	}
	const category = readFeatureCategory(feature);
	if (category) props.category = category;

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
		return `This feature has ${parts} parts and can't be edited on the map. Delete and redraw it.`;
	}
	if (!feature.geometry || feature.geometry.coordinates === undefined) {
		return "This feature has no geometry to edit.";
	}
	return `Geometry type "${String(type)}" can't be edited on the map.`;
}
