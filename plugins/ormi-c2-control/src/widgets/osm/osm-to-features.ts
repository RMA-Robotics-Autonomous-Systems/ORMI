/**
 * OSM ways → C2 `road` features — pure geometry/property translation.
 *
 * No map, no React, no fetch — only the conversion and geofence clipping, so it
 * is unit-testable directly. `[lon, lat]` (GeoJSON) order is preserved end-to-end
 * and matches the rest of the widget's COORDINATE RULE (no swap).
 *
 * Clipping is the MVP form: keep a way when at least one of its vertices falls
 * inside the geofence polygon (ray-casting point-in-polygon). Exact polygon
 * clipping is a later refinement; no turf dependency is introduced.
 */

import type { C2Feature } from "../../types/c2-types";
import type { OsmBbox, OverpassGeomNode, OverpassWay } from "./overpass";

/** A geographic position as `[lon, lat]` (GeoJSON / EPSG:4326 order). */
export type LonLat = [number, number];

/**
 * A geofence outline as a flat `[lon, lat]` ring. Derived from a stored geofence
 * Polygon's outer ring (callers pass `coordinates[0]`).
 */
export type GeofenceRing = LonLat[];

/**
 * Convert an Overpass `out geom;` node list to a `[lon, lat]` coordinate array,
 * dropping any node missing a finite lon/lat.
 */
function geomToCoordinates(geometry: OverpassGeomNode[] | undefined): LonLat[] {
	if (!Array.isArray(geometry)) return [];
	const coords: LonLat[] = [];
	for (const node of geometry) {
		if (node && Number.isFinite(node.lon) && Number.isFinite(node.lat)) {
			coords.push([node.lon, node.lat]);
		}
	}
	return coords;
}

/**
 * Pick the operator-facing name for a way: `tags.name`, then `tags.ref`, then a
 * stable fallback built from the OSM id (or a generic label when even that is
 * missing).
 */
function wayName(way: OverpassWay): string {
	const name = way.tags?.name?.trim();
	if (name) return name;
	const ref = way.tags?.ref?.trim();
	if (ref) return ref;
	return way.id != null ? `OSM way ${way.id}` : "OSM road";
}

/**
 * Ray-casting point-in-polygon test (even-odd rule) for a `[lon, lat]` point
 * against a flat `[lon, lat]` ring.
 *
 * Pure, dependency-free. The ring may be open or closed (first == last); both
 * work. A degenerate ring (<3 vertices) always returns `false`.
 *
 * @param point - The `[lon, lat]` point to test.
 * @param ring - The polygon outer ring as flat `[lon, lat]` vertices.
 * @returns `true` when the point lies inside the ring.
 */
export function pointInPolygon(point: LonLat, ring: GeofenceRing): boolean {
	if (!Array.isArray(ring) || ring.length < 3) return false;
	const [x, y] = point;
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const vi = ring[i];
		const vj = ring[j];
		if (!vi || !vj) continue;
		const [xi, yi] = vi;
		const [xj, yj] = vj;
		const intersects =
			yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersects) inside = !inside;
	}
	return inside;
}

/**
 * Compute the axis-aligned bounding box of a flat `[lon, lat]` ring.
 *
 * Pure helper used to derive the Overpass query area from a selected geofence
 * polygon's outer ring. Returns `null` when the ring has no usable vertices.
 *
 * @param ring - A flat `[lon, lat]` ring (e.g. a geofence Polygon's outer ring).
 * @returns The `{ minLon, minLat, maxLon, maxLat }` bbox, or `null`.
 */
export function ringToBbox(ring: GeofenceRing): OsmBbox | null {
	if (!Array.isArray(ring) || ring.length === 0) return null;
	let minLon = Infinity;
	let minLat = Infinity;
	let maxLon = -Infinity;
	let maxLat = -Infinity;
	let seen = false;
	for (const vertex of ring) {
		if (!Array.isArray(vertex) || vertex.length < 2) continue;
		const [lon, lat] = vertex;
		if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
		seen = true;
		if (lon < minLon) minLon = lon;
		if (lat < minLat) minLat = lat;
		if (lon > maxLon) maxLon = lon;
		if (lat > maxLat) maxLat = lat;
	}
	if (!seen) return null;
	return { minLon, minLat, maxLon, maxLat };
}

/**
 * Extract a geofence Polygon's outer ring as a flat `[lon, lat]` array from a
 * stored {@link C2Feature}.
 *
 * Tolerates the GeoJSON Polygon nesting (`coordinates[0]` is the outer ring) and
 * returns `null` for non-Polygon or malformed geometry.
 *
 * @param feature - A stored geofence feature.
 * @returns The outer ring as `[lon, lat]` vertices, or `null`.
 */
export function geofenceRingFromFeature(
	feature: C2Feature,
): GeofenceRing | null {
	const geometry = feature.geometry;
	if (!geometry || geometry.type !== "Polygon") return null;
	const coordinates = geometry.coordinates;
	if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
	const outer = coordinates[0];
	if (!Array.isArray(outer)) return null;
	const ring: GeofenceRing = [];
	for (const vertex of outer) {
		if (!Array.isArray(vertex) || vertex.length < 2) continue;
		const [lon, lat] = vertex;
		if (Number.isFinite(lon) && Number.isFinite(lat)) {
			ring.push([lon, lat]);
		}
	}
	return ring.length > 0 ? ring : null;
}

/**
 * Convert Overpass ways into `road` LineString {@link C2Feature}s.
 *
 * - Each way → a `road` LineString in `[lon, lat]` order from its inline
 *   geometry.
 * - `properties.name` = `tags.name` ?? `tags.ref` ?? a per-way fallback;
 *   `properties.feature_type = "road"`; the OSM way id is stashed in
 *   `properties.osm_id` for future dedup. `feature_id` is omitted — the server
 *   assigns it.
 * - Degenerate ways (<2 vertices after cleaning) are dropped.
 * - When `geofence` is provided, a way is kept only if ≥1 vertex lies inside the
 *   geofence ring (point-in-polygon). When omitted, all ways in the bbox are
 *   kept.
 *
 * @param ways - Overpass ways (from `fetchOsmRoads`).
 * @param geofence - Optional geofence outer ring for clipping.
 * @returns The `road` features ready for a batch `c2.map.features.add`.
 */
export function osmRoadsToFeatures(
	ways: OverpassWay[],
	geofence?: GeofenceRing,
): C2Feature[] {
	const clip =
		Array.isArray(geofence) && geofence.length >= 3 ? geofence : null;
	const features: C2Feature[] = [];

	for (const way of ways) {
		const coordinates = geomToCoordinates(way.geometry);
		if (coordinates.length < 2) continue;
		if (clip && !coordinates.some((c) => pointInPolygon(c, clip))) {
			continue;
		}

		const properties: NonNullable<C2Feature["properties"]> = {
			feature_type: "road",
			name: wayName(way),
		};
		if (way.id != null) properties.osm_id = way.id;

		features.push({
			type: "Feature",
			properties,
			geometry: { type: "LineString", coordinates },
		});
	}

	return features;
}
