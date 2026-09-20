import type { C2Feature, MissionGeometry } from "../types/c2-types";

import {
	geofenceRingFromFeature,
	pointInPolygon,
	type GeofenceRing,
	type LonLat,
} from "./osm/osm-to-features";
// ONE definition of "is this a coordinate", shared with the renderer. This file
// used to carry its own (stricter) copy, so the two disagreed about a NaN
// vertex — see the note on `isVertex` in `mission-geometry.ts`.
import { isVertex } from "./mission-geometry";

/**
 * Mission objective ↔ geofence containment check (pure, testable).
 *
 * The C2 planner builds its routable graph ONLY inside `geofence` polygons. An
 * objective geometry drawn outside every geofence yields "0 nodes inside" and
 * planning fails. This helper lets the map widget warn the operator at authoring
 * time, against the currently-loaded map's geofences.
 *
 * ⚠ COORDINATE RULE — `[lon, lat]` order throughout; no swap (matches
 * `osm-to-features.ts` and `mission-geometry.ts`).
 *
 * ⚠ NESTING RULE — inline mission geometry is the FLAT C2 vertex form: a Point
 * is `[[lon,lat]]` (a single-vertex list), a LineString / Polygon outer ring is
 * `[[lon,lat],…]` (both 2-level), and a MultiLineString / MultiPolygon is a list
 * of those (3-level). Pure `feature_id` references carry no inline
 * coordinates — they resolve to a stored map feature and are SKIPPED here (the
 * referenced feature's own placement is the map's concern, not the mission's).
 */

/**
 * Extract every finite `[lon, lat]` vertex from one inline mission geometry's
 * flat C2 coordinates (Point `[[lon,lat]]`, LineString / Polygon ring
 * `[[lon,lat],…]`, and the 3-level multi-part forms — a MultiLineString's lines
 * or a MultiPolygon's rings `[[[lon,lat],…],…]`). Every part contributes, so a
 * multi-part objective counts as inside when any part is. Returns an empty list
 * for malformed or non-vertex input.
 *
 * @param coordinates - The inline geometry's flat C2 coordinates (`unknown`).
 * @returns The geometry's vertices as `[lon, lat]`.
 */
function geometryVertices(coordinates: unknown): LonLat[] {
	if (!Array.isArray(coordinates)) return [];
	const vertices: LonLat[] = [];
	const collect = (entry: unknown) => {
		if (isVertex(entry)) vertices.push([entry[0], entry[1]] as LonLat);
	};
	for (const entry of coordinates) {
		if (isVertex(entry)) collect(entry);
		else if (Array.isArray(entry)) entry.forEach(collect);
	}
	return vertices;
}

/**
 * Collect the geofence outer rings from a map's stored features.
 *
 * Only features with `properties.feature_type === "geofence"` and Polygon
 * geometry contribute a ring (via {@link geofenceRingFromFeature}); everything
 * else is ignored.
 *
 * @param features - The selected map's MapDB features.
 * @returns The geofence outer rings as flat `[lon, lat]` arrays.
 */
export function geofenceRings(features: C2Feature[]): GeofenceRing[] {
	const rings: GeofenceRing[] = [];
	for (const feature of features) {
		if (feature?.properties?.feature_type !== "geofence") continue;
		const ring = geofenceRingFromFeature(feature);
		if (ring) rings.push(ring);
	}
	return rings;
}

/**
 * Find the objective geometries that lie fully OUTSIDE every geofence.
 *
 * For each objective geometry, the entry is considered "inside" when AT LEAST
 * ONE of its vertices falls inside ANY geofence ring (point-in-polygon). An
 * entry is reported when ALL of its vertices are outside ALL geofences.
 *
 * Skipped (never reported):
 * - pure `feature_id` references — they carry no inline coordinates and resolve
 *   to a stored map feature;
 * - inline geometries with no usable vertices (malformed / empty).
 *
 * When NO geofence polygons are available, returns an empty array — containment
 * is undeterminable, so the caller must not warn.
 *
 * @param geometries - The working mission's `objective.geometries[]`.
 * @param geofenceFeatures - The selected map's MapDB features (geofences picked out).
 * @returns The zero-based indices (into `geometries`) of objectives outside all geofences.
 */
export function objectivesOutsideGeofence(
	geometries: MissionGeometry[] | null | undefined,
	geofenceFeatures: C2Feature[],
): number[] {
	const rings = geofenceRings(geofenceFeatures);
	if (rings.length === 0) return [];
	if (!Array.isArray(geometries) || geometries.length === 0) return [];

	const outside: number[] = [];
	geometries.forEach((entry, index) => {
		const inline = entry?.geometry;
		if (!inline) return; // pure feature_id reference — skip
		const vertices = geometryVertices(inline.coordinates);
		if (vertices.length === 0) return; // no usable coords — can't judge
		const anyInside = vertices.some((vertex) =>
			rings.some((ring) => pointInPolygon(vertex, ring)),
		);
		if (!anyInside) outside.push(index);
	});
	return outside;
}
