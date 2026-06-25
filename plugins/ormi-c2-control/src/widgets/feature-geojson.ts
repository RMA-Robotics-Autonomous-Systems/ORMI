import type { Feature, LineString, Point, Polygon } from "geojson";

import { C2Feature } from "../types/c2-types";
import { generateMissionId } from "./mission-list";

/**
 * F6 — pure terra-draw-snapshot ↔ `C2Feature` (MapDB) mapping.
 *
 * No map, no React, no fetch — just the geometry/property translation so it can
 * be unit-tested directly.
 *
 * ⚠ COORDINATE RULE — everything here is GeoJSON `[lng, lat]` end-to-end. The
 * terra-draw snapshot, the saved MapDB `C2Feature`, and the mission
 * `objective.geometries[].geometry.coordinates` all use `[lng, lat]`. There is
 * NO swap in this module (the only swap in the whole system is the
 * `mission_feedback` waypoints, handled by S2 in `mission-feedback.ts`).
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
 * Coordinates pass through unchanged (`[lng, lat]`). The result's
 * `properties.feature_id` is the ORMI UUID — provided (edit) or freshly minted
 * (create) — NOT the terra-draw `id`.
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
	const type = geometry?.type;
	if (
		!geometry ||
		(type !== "Point" && type !== "LineString" && type !== "Polygon") ||
		geometry.coordinates === undefined
	) {
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
			coordinates: geometry.coordinates,
		} as DrawFeature["geometry"],
	};
}

/**
 * Build the inline `objective.geometries[]` entry for a drawn geometry, in the
 * mission-config shape `{ geometry: { geometry_type, coordinates } }`.
 *
 * Coordinates pass through unchanged (`[lng, lat]`).
 * @param drawn - A terra-draw snapshot feature.
 * @returns The inline geometry entry.
 */
export function drawFeatureToInlineGeometry(drawn: DrawFeature): {
	geometry: { geometry_type: string; coordinates: unknown };
} {
	return {
		geometry: {
			geometry_type: drawn.geometry.type,
			coordinates: drawn.geometry.coordinates,
		},
	};
}
