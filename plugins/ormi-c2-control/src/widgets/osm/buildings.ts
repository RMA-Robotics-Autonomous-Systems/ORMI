/**
 * Overpass building import — thin client over the public Overpass API.
 *
 * Sibling to {@link ./overpass}: same `ApiResult`-style contract, same
 * `out geom;` strategy, same never-throw discipline. A single building-footprint
 * fetch feeds BOTH outputs in `osm-buildings.ts`: the `risk` polygon import
 * (R2.E) and the MapLibre `fill-extrusion` 3D source (R2.F). This module owns
 * ONLY the network read; the geometry/property translation is pure and lives in
 * `osm-buildings.ts` so it is unit-testable without the network.
 *
 * Like the roads client this is a third-party HTTP read (not the mongodb-server
 * backend); it returns `{ ok }`-shaped output (Pattern #9 style) rather than
 * throwing, so callers handle rate-limit / timeout / CORS / network failures
 * uniformly. Overpass error responses (HTML / plain text) are tolerated.
 */

import type { OsmBbox, OverpassGeomNode } from "./overpass";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/**
 * A single OSM `building` way from an Overpass `out geom;` response. Mirrors
 * {@link import("./overpass").OverpassWay} but is named distinctly so building
 * and road call-sites stay self-documenting.
 */
export interface OverpassBuildingWay {
	type: "way";
	id?: number;
	tags?: Record<string, string>;
	/** Present because the query uses `out geom;` (inline lat/lon per node). */
	geometry?: OverpassGeomNode[];
}

/** Shape of the Overpass JSON response (only the fields we read). */
interface OverpassResponse {
	elements?: unknown[];
}

/**
 * Result of {@link fetchOsmBuildings}: `ApiResult`-style discriminated union so
 * callers branch on `ok` rather than catching exceptions.
 */
export type OverpassBuildingsResult =
	| { ok: true; data: OverpassBuildingWay[] }
	| { ok: false; error: string };

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
 * Narrow an arbitrary Overpass element to an {@link OverpassBuildingWay}, keeping
 * only ways that carry an inline `geometry` array.
 */
function asBuildingWay(element: unknown): OverpassBuildingWay | null {
	if (typeof element !== "object" || element === null) return null;
	const el = element as Record<string, unknown>;
	if (el.type !== "way") return null;
	if (!Array.isArray(el.geometry)) return null;
	return el as unknown as OverpassBuildingWay;
}

/**
 * Query the Overpass API for building footprints within `bbox`.
 *
 * Thin wrapper — keep all pure logic in {@link buildOsmBuildingsQuery} and
 * `osm-buildings.ts` so unit tests never reach the network. Never throws:
 * network / CORS / timeout / non-OK / non-JSON responses all resolve to
 * `{ ok: false, error }`.
 *
 * @param bbox - The geographic bounding box to query.
 * @param signal - Optional abort signal to cancel the request.
 * @returns An {@link OverpassBuildingsResult} with the matched ways or an error.
 */
export async function fetchOsmBuildings(
	bbox: OsmBbox,
	signal?: AbortSignal,
): Promise<OverpassBuildingsResult> {
	const query = buildOsmBuildingsQuery(bbox);
	let response: Response;
	try {
		response = await fetch(OVERPASS_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body: query,
			signal,
		});
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Overpass request failed: ${reason}` };
	}

	if (!response.ok) {
		// Overpass returns HTML/text on errors (429 rate-limit, 504 timeout, …).
		const detail = await response.text().catch(() => "");
		const snippet = detail.trim().slice(0, 200);
		return {
			ok: false,
			error: `Overpass error ${response.status}${snippet ? `: ${snippet}` : ""}`,
		};
	}

	let json: OverpassResponse;
	try {
		json = (await response.json()) as OverpassResponse;
	} catch {
		return { ok: false, error: "Overpass returned a non-JSON response." };
	}

	const elements = Array.isArray(json.elements) ? json.elements : [];
	const ways = elements
		.map(asBuildingWay)
		.filter((w): w is OverpassBuildingWay => w !== null);
	return { ok: true, data: ways };
}
