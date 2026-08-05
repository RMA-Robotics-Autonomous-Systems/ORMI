/**
 * OSM building footprints → two pure outputs from one Overpass fetch.
 *
 * No map, no React, no fetch — only conversion and geofence clipping, so it is
 * unit-testable directly. `[lon, lat]` (GeoJSON) order is preserved end-to-end
 * and matches the widget's COORDINATE RULE (no swap).
 *
 *  1. {@link osmBuildingsToRiskFeatures} — each footprint → a `risk` **Polygon**
 *     `C2Feature` for the batch `c2.map.features.add` import (R2.E). The emitted
 *     shape matches `drawFeatureToC2Feature`'s output exactly (full GeoJSON
 *     Polygon, `[lon, lat]`, `properties.feature_type = "risk"`), minus
 *     `feature_id` which the server assigns. MAP_API.md §1 requires `risk` to
 *     carry `Polygon` geometry.
 *  2. {@link osmBuildingsToExtrusionFc} — the same footprints → a GeoJSON
 *     `FeatureCollection` carrying a numeric `height` per polygon, for a MapLibre
 *     `fill-extrusion` 3D layer (R2.F).
 *
 * Clipping is the MVP form shared with the roads importer: keep a footprint when
 * ≥1 of its vertices falls inside the geofence ring (ray-casting
 * point-in-polygon). Exact polygon clipping is a later refinement.
 *
 * MULTIPOLYGON `relation["building"]` footprints are out of scope (the fetch
 * queries `way["building"]` only); revisit if relation buildings prove material.
 */

import type { C2Feature } from "../../types/c2-types";
import type { OverpassBuildingWay } from "./buildings";
import type { OverpassGeomNode } from "./overpass";
import {
	pointInPolygon,
	type GeofenceRing,
	type LonLat,
} from "./osm-to-features";

/** Fallback building height (metres) when no tag implies one. */
const DEFAULT_BUILDING_HEIGHT_M = 6;

/** Assumed storey height (metres) used with `building:levels`. */
const METRES_PER_LEVEL = 3;

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
 * Count the distinct vertices in a `[lon, lat]` list (ignoring an explicit
 * closing vertex that repeats the first). A footprint needs ≥3 distinct vertices
 * to form a polygon.
 */
function distinctVertexCount(coords: LonLat[]): number {
	const seen = new Set<string>();
	for (const [lon, lat] of coords) seen.add(`${lon},${lat}`);
	return seen.size;
}

/**
 * Close a `[lon, lat]` ring so the first and last vertices are identical, as a
 * GeoJSON Polygon linear ring requires. A ring that is already closed is
 * returned unchanged.
 */
function closeRing(coords: LonLat[]): LonLat[] {
	if (coords.length === 0) return coords;
	const first = coords[0]!;
	const last = coords[coords.length - 1]!;
	if (first[0] === last[0] && first[1] === last[1]) return coords;
	return [...coords, [first[0], first[1]]];
}

/** Whether ≥1 vertex of the footprint lies inside the geofence ring. */
function intersectsGeofence(coords: LonLat[], ring: GeofenceRing): boolean {
	return coords.some((c) => pointInPolygon(c, ring));
}

/**
 * Pick the operator-facing name for a building footprint: `tags.name`, then a
 * house-number/street label from `addr:*`, then a stable per-way fallback.
 */
function buildingName(way: OverpassBuildingWay): string {
	const name = way.tags?.name?.trim();
	if (name) return name;
	const houseNumber = way.tags?.["addr:housenumber"]?.trim();
	const street = way.tags?.["addr:street"]?.trim();
	if (houseNumber && street) return `${street} ${houseNumber}`;
	if (houseNumber) return `Building ${houseNumber}`;
	return way.id != null ? `OSM building ${way.id}` : "OSM building";
}

/**
 * Parse a building footprint's height in metres from its OSM tags.
 *
 * Precedence (pure, unit-tested):
 *  1. `tags.height` parsed as metres — tolerates a trailing unit/space
 *     (`"12"`, `"12 m"`, `"12.5"`); a `'`/`ft` imperial value or any
 *     non-positive/non-finite parse is ignored.
 *  2. `tags["building:levels"]` × {@link METRES_PER_LEVEL}.
 *  3. {@link DEFAULT_BUILDING_HEIGHT_M}.
 *
 * @param tags - The way's OSM tag map (may be undefined).
 * @returns A positive, finite height in metres.
 */
export function parseBuildingHeight(
	tags: Record<string, string> | undefined,
): number {
	const rawHeight = tags?.height?.trim();
	if (rawHeight) {
		// Reject imperial feet/inches; accept a leading metric magnitude.
		const imperial = /['"]|(?:\bft\b)|(?:\bin\b)/i.test(rawHeight);
		if (!imperial) {
			const metres = Number.parseFloat(rawHeight);
			if (Number.isFinite(metres) && metres > 0) return metres;
		}
	}

	const rawLevels = tags?.["building:levels"]?.trim();
	if (rawLevels) {
		const levels = Number.parseFloat(rawLevels);
		if (Number.isFinite(levels) && levels > 0) {
			return levels * METRES_PER_LEVEL;
		}
	}

	return DEFAULT_BUILDING_HEIGHT_M;
}

/**
 * Convert Overpass building ways into `risk` Polygon {@link C2Feature}s.
 *
 * - Each way → a `risk` GeoJSON Polygon in `[lon, lat]` order from its inline
 *   geometry, with a **closed** outer ring (first vertex repeated last per the
 *   GeoJSON Polygon spec, matching `drawFeatureToC2Feature`'s shape).
 * - `properties.feature_type = "risk"`; `properties.name` from `tags.name` /
 *   `addr:*` / a per-way fallback; the OSM way id is stashed in
 *   `properties.osm_id`. `feature_id` is omitted — the server assigns it.
 * - Footprints with <3 distinct vertices are dropped.
 * - When `geofence` is provided, a footprint is kept only if ≥1 vertex lies
 *   inside the geofence ring (point-in-polygon). When omitted, all footprints in
 *   the bbox are kept.
 *
 * @param ways - Overpass building ways (from `fetchOsmBuildings`).
 * @param geofence - Optional geofence outer ring for clipping.
 * @returns The `risk` Polygon features ready for a batch `c2.map.features.add`.
 */
export function osmBuildingsToRiskFeatures(
	ways: OverpassBuildingWay[],
	geofence?: GeofenceRing,
): C2Feature[] {
	const clip =
		Array.isArray(geofence) && geofence.length >= 3 ? geofence : null;
	const features: C2Feature[] = [];

	for (const way of ways) {
		const coordinates = geomToCoordinates(way.geometry);
		if (distinctVertexCount(coordinates) < 3) continue;
		if (clip && !intersectsGeofence(coordinates, clip)) continue;

		const ring = closeRing(coordinates);
		const properties: NonNullable<C2Feature["properties"]> = {
			feature_type: "risk",
			name: buildingName(way),
		};
		if (way.id != null) properties.osm_id = way.id;

		features.push({
			type: "Feature",
			properties,
			// GeoJSON Polygon: outer ring wrapped one level, [lon, lat] verbatim.
			geometry: { type: "Polygon", coordinates: [ring] },
		});
	}

	return features;
}

/** One footprint feature in the 3D `fill-extrusion` source. */
export interface BuildingExtrusionFeature {
	type: "Feature";
	properties: { height: number };
	geometry: { type: "Polygon"; coordinates: LonLat[][] };
}

/** The GeoJSON source feeding the MapLibre `fill-extrusion` 3D buildings layer. */
export interface BuildingExtrusionFeatureCollection {
	type: "FeatureCollection";
	features: BuildingExtrusionFeature[];
}

/**
 * Convert Overpass building ways into a GeoJSON `FeatureCollection` of closed
 * Polygons, each carrying a numeric `height` (metres) for a MapLibre
 * `fill-extrusion` layer (`fill-extrusion-height` reads `["get", "height"]`).
 *
 * Shares the footprint discipline of {@link osmBuildingsToRiskFeatures} — closed
 * ring, ≥3 distinct vertices, optional geofence clip — so the same fetch feeds
 * both the 3D view and the risk import. `height` is derived by
 * {@link parseBuildingHeight}.
 *
 * @param ways - Overpass building ways (from `fetchOsmBuildings`).
 * @param geofence - Optional geofence outer ring for clipping.
 * @returns A `FeatureCollection` ready as a react-map-gl `<Source>` `data`.
 */
export function osmBuildingsToExtrusionFc(
	ways: OverpassBuildingWay[],
	geofence?: GeofenceRing,
): BuildingExtrusionFeatureCollection {
	const clip =
		Array.isArray(geofence) && geofence.length >= 3 ? geofence : null;
	const features: BuildingExtrusionFeature[] = [];

	for (const way of ways) {
		const coordinates = geomToCoordinates(way.geometry);
		if (distinctVertexCount(coordinates) < 3) continue;
		if (clip && !intersectsGeofence(coordinates, clip)) continue;

		features.push({
			type: "Feature",
			properties: { height: parseBuildingHeight(way.tags) },
			geometry: {
				type: "Polygon",
				coordinates: [closeRing(coordinates)],
			},
		});
	}

	return { type: "FeatureCollection", features };
}
