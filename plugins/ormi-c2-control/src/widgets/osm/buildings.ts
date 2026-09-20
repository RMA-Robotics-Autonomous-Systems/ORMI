/**
 * Overpass building import — the building-specific half of the Overpass client.
 *
 * ⚠ THE NETWORK READ LIVES IN `./overpass`. This module used to carry its own
 * ~95 %-identical copy of it (same endpoint constant, same POST, same four
 * failure branches, same element narrowing) so that a fix to one client reached
 * only half the callers. What remains here is what is genuinely building-specific:
 * the query text and the distinct type name that keeps building and road
 * call-sites self-documenting.
 *
 * A single building-footprint fetch feeds BOTH outputs in `osm-buildings.ts`: the
 * `risk` polygon import and the MapLibre `fill-extrusion` 3D source.
 * The geometry/property translation is pure and lives there, so it is testable
 * without the network.
 */

import {
	runOverpassQuery,
	type OsmBbox,
	type OverpassGeomNode,
} from "./overpass";

/**
 * A single OSM `building` way from an Overpass `out geom;` response. Structurally
 * identical to {@link import("./overpass").OverpassWay}, named distinctly so
 * building and road call-sites stay self-documenting.
 */
export interface OverpassBuildingWay {
	type: "way";
	id?: number;
	tags?: Record<string, string>;
	/** Present because the query uses `out geom;` (inline lat/lon per node). */
	geometry?: OverpassGeomNode[];
}

/**
 * Result of {@link fetchOsmBuildings}: `ApiResult`-style discriminated union so
 * callers branch on `ok` rather than catching exceptions.
 */
export type OverpassBuildingsResult =
	{ ok: true; data: OverpassBuildingWay[] } | { ok: false; error: string };

/**
 * Build the Overpass QL query string for building footprints within `bbox`.
 *
 * Pure and unit-testable. Overpass bbox order is `(south,west,north,east)` =
 * `(minLat, minLon, maxLat, maxLon)`. `out geom;` makes each way carry its inline
 * `geometry: [{lat,lon}, …]`. Only `way["building"]` is queried for the MVP —
 * `relation["building"]` MULTIPOLYGON footprints are intentionally skipped (their
 * outer-ring assembly is non-trivial and the vast majority of footprints are
 * simple ways); this can be revisited if relation buildings prove material.
 *
 * @param bbox - The geographic bounding box to query.
 * @returns The Overpass QL query text.
 */
export function buildOsmBuildingsQuery(bbox: OsmBbox): string {
	const { minLon, minLat, maxLon, maxLat } = bbox;
	const area = `(${minLat},${minLon},${maxLat},${maxLon})`;
	return [
		"[out:json][timeout:25];",
		`way["building"]${area};`,
		"out geom;",
	].join("\n");
}

/**
 * Query the Overpass API for building footprints within `bbox`.
 *
 * Never throws: network / CORS / timeout / non-OK / non-JSON responses all
 * resolve to `{ ok: false, error }` (see {@link runOverpassQuery}).
 *
 * @param bbox - The geographic bounding box to query.
 * @param signal - Optional abort signal to cancel the request.
 * @returns An {@link OverpassBuildingsResult} with the matched ways or an error.
 */
export async function fetchOsmBuildings(
	bbox: OsmBbox,
	signal?: AbortSignal,
): Promise<OverpassBuildingsResult> {
	const result = await runOverpassQuery(buildOsmBuildingsQuery(bbox), signal);
	// The two way types are structurally identical; the cast keeps the distinct
	// name at the call sites without a pointless per-element rebuild.
	return result.ok
		? { ok: true, data: result.data as OverpassBuildingWay[] }
		: result;
}
