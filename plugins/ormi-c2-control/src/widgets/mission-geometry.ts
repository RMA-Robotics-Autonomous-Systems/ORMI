import type { Feature, LineString, Point, Polygon } from "geojson";

import type { MissionConfig, MissionGeometry } from "../types/c2-types";

/**
 * Mission objective geometry ↔ GeoJSON projection (pure, testable).
 *
 * The mission editor stores objective geometry as `objective.geometries[]`,
 * where each entry is either an INLINE geometry
 * (`{ geometry: { geometry_type, coordinates } }`, in the C2 flat vertex form
 * produced by `drawFeatureToInlineGeometry`) or a REFERENCE to a stored MapDB
 * feature (`{ feature_id }`).
 *
 * The map renders ONLY the inline geometries — references would resolve to map
 * features (already drawn by the map-feature layer), so re-projecting them here
 * would double-render them.
 *
 * ⚠ COORDINATE RULE — `[lng, lat]` order is preserved end-to-end; no swap.
 *
 * ⚠ NESTING RULE — the inline C2 form is a FLAT vertex list (see the header of
 * `feature-geojson.ts`): a Point is `[[lng,lat]]` (2 levels, a single-vertex list
 * — the C2 reads its vertex as `coordinates[0]`); a line / polygon ring is
 * `[[lng,lat],…]` (2 levels). GeoJSON Polygon coordinates are `[[[lng,lat],…]]`
 * (3 levels), so {@link inlineGeometryToGeoJSON} re-wraps a `Polygon` ring back
 * into the GeoJSON outer-ring form for rendering, and unwraps a single-vertex
 * Point list back into a GeoJSON `Point` `[lng,lat]`.
 */

/** A rendered mission geometry feature, tagged with its source index. */
export type MissionGeometryFeature = Feature<
	Point | LineString | Polygon,
	{ index: number; geometry_type: string }
>;

/** Whether a value is a 2-level vertex list (`[[lng,lat],…]`). */
function isVertexList(coords: unknown): coords is [number, number][] {
	return (
		Array.isArray(coords) &&
		coords.length > 0 &&
		Array.isArray(coords[0]) &&
		typeof (coords[0] as unknown[])[0] === "number"
	);
}

/** Whether a value is a single `[lng, lat]` vertex (1 level). */
function isVertex(coords: unknown): coords is [number, number] {
	return (
		Array.isArray(coords) &&
		coords.length >= 2 &&
		typeof coords[0] === "number" &&
		typeof coords[1] === "number"
	);
}

/**
 * Convert one inline mission geometry (flat C2 vertex form) into a GeoJSON
 * geometry suitable for MapLibre rendering, re-wrapping a Polygon ring into the
 * GeoJSON triple-nested form. Returns `null` when the geometry can't be mapped
 * to a renderable Point / LineString / Polygon.
 *
 * @param geometry_type - The GeoJSON-style type label stored on the geometry.
 * @param coordinates - The flat C2 coordinates.
 * @returns A GeoJSON geometry, or `null`.
 */
export function inlineGeometryToGeoJSON(
	geometry_type: string | undefined,
	coordinates: unknown,
): Point | LineString | Polygon | null {
	switch (geometry_type) {
		case "Point": {
			// C2 contract: a Point is a single-vertex list `[[lng,lat]]` (2-level).
			// Unwrap it to the GeoJSON `Point` `[lng,lat]`. A bare 1-level
			// `[lng,lat]` is tolerated for legacy/stored geometry.
			if (isVertexList(coordinates)) {
				const vertex = coordinates[0];
				return vertex ? { type: "Point", coordinates: vertex } : null;
			}
			return isVertex(coordinates)
				? { type: "Point", coordinates }
				: null;
		}
		case "LineString":
			return isVertexList(coordinates)
				? { type: "LineString", coordinates }
				: null;
		case "Polygon":
			// Flat C2 form keeps only the outer ring; re-wrap for GeoJSON.
			return isVertexList(coordinates)
				? { type: "Polygon", coordinates: [coordinates] }
				: null;
		default:
			return null;
	}
}

/**
 * Convert one inline mission geometry into a terra-draw GeoJSON Feature so the
 * operator can load it into the authoring layer for editing. Returns `null` when
 * the geometry can't be mapped to a renderable Point / LineString / Polygon.
 *
 * @param inline - The inline `{ geometry_type, coordinates }` block.
 * @returns A GeoJSON Feature, or `null`.
 */
export function inlineToDrawFeature(inline: {
	geometry_type?: string;
	coordinates: unknown;
}): Feature<Point | LineString | Polygon> | null {
	const geometry = inlineGeometryToGeoJSON(
		inline.geometry_type,
		inline.coordinates,
	);
	if (!geometry) return null;
	return { type: "Feature", properties: {}, geometry };
}

/**
 * Project a mission's `objective.geometries[]` into a GeoJSON FeatureCollection
 * for the mission-feature layer. Only INLINE geometries are rendered; entries
 * that are pure `feature_id` references (resolving to map features) are skipped.
 *
 * Each feature carries its source `index` in `objective.geometries[]` so the
 * mission editor can select / replace / delete a specific entry.
 *
 * @param mission - The full mission config (or `null`/partial).
 * @returns A FeatureCollection of the inline mission geometries.
 */
export function missionGeometriesToFeatureCollection(
	mission: MissionConfig | null | undefined,
): {
	type: "FeatureCollection";
	features: MissionGeometryFeature[];
} {
	const geometries: MissionGeometry[] = mission?.objective?.geometries ?? [];
	const features: MissionGeometryFeature[] = [];
	geometries.forEach((entry, index) => {
		const inline = entry?.geometry;
		if (!inline) return; // pure feature_id reference — rendered by the map layer
		const geojson = inlineGeometryToGeoJSON(
			inline.geometry_type,
			inline.coordinates,
		);
		if (!geojson) return;
		features.push({
			type: "Feature",
			properties: {
				index,
				geometry_type: inline.geometry_type ?? geojson.type,
			},
			geometry: geojson,
		});
	});
	return { type: "FeatureCollection", features };
}
