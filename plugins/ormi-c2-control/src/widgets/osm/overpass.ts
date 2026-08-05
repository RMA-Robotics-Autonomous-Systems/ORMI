/**
 * Overpass road import — thin client over the public Overpass API.
 *
 * The map editor imports drivable road geometry for a geofenced area straight
 * from OpenStreetMap (frontend → Overpass direct), converts the returned ways to
 * `road` LineString features, and bulk-saves them through the existing
 * `c2.map.features.add` remote call. This module owns ONLY the network read; the
 * geometry/property translation lives in `osm-to-features.ts` so it can be unit
 * tested without touching the network.
 *
 * This is a third-party HTTP read (not the mongodb-server backend), so it is kept
 * plugin-local and mirrors Pattern #9: it returns an `ApiResult`-style
 * discriminated union instead of throwing, so callers handle rate-limit / timeout
 * / CORS / network failures uniformly. Overpass error responses (HTML / plain
 * text rather than JSON) are tolerated without throwing.
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/** Drivable highway classes imported as `road` features. */
const DRIVABLE_HIGHWAYS = [
	"motorway",
	"trunk",
	"primary",
	"secondary",
	"tertiary",
	"unclassified",
	"residential",
	"service",
	"track",
] as const;

/** A geographic bounding box in `[lon, lat]` (EPSG:4326) terms. */
export interface OsmBbox {
	minLon: number;
	minLat: number;
	maxLon: number;
	maxLat: number;
}

/** One inline geometry vertex as Overpass returns it under `out geom;`. */
export interface OverpassGeomNode {
	lat: number;
	lon: number;
}

/** A single OSM way element from an Overpass `out geom;` response. */
export interface OverpassWay {
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
 * Result of {@link fetchOsmRoads}: `ApiResult`-style discriminated union so
 * callers branch on `ok` rather than catching exceptions.
 */
export type OverpassResult =
	| { ok: true; data: OverpassWay[] }
	| { ok: false; error: string };

/**
 * Build the Overpass QL query string for drivable highways within `bbox`.
 *
 * Pure and unit-testable. Overpass bbox order is `(south,west,north,east)` =
 * `(minLat, minLon, maxLat, maxLon)`. `out geom;` makes each way carry its inline
 * `geometry: [{lat,lon}, …]`, so no second node-resolution request is needed.
 *
 * @param bbox - The geographic bounding box to query.
 * @returns The Overpass QL query text.
 */
export function buildOverpassQuery(bbox: OsmBbox): string {
	const { minLon, minLat, maxLon, maxLat } = bbox;
	const area = `(${minLat},${minLon},${maxLat},${maxLon})`;
	const highways = DRIVABLE_HIGHWAYS.join("|");
	return [
		"[out:json][timeout:25];",
		`way["highway"~"^(${highways})$"]${area};`,
		"out geom;",
	].join("\n");
}

/**
 * Narrow an arbitrary Overpass element to an {@link OverpassWay}, keeping only
 * ways that carry an inline `geometry` array.
 */
function asOverpassWay(element: unknown): OverpassWay | null {
	if (typeof element !== "object" || element === null) return null;
	const el = element as Record<string, unknown>;
	if (el.type !== "way") return null;
	if (!Array.isArray(el.geometry)) return null;
	return el as unknown as OverpassWay;
}

/**
 * Query the Overpass API for drivable roads within `bbox`.
 *
 * Thin wrapper — keep all pure logic in {@link buildOverpassQuery} and
 * `osm-to-features.ts` so unit tests never reach the network. Never throws:
 * network / CORS / timeout / non-OK / non-JSON responses all resolve to
 * `{ ok: false, error }`.
 *
 * @param bbox - The geographic bounding box to query.
 * @param signal - Optional abort signal to cancel the request.
 * @returns An {@link OverpassResult} with the matched ways or an error message.
 */
export async function fetchOsmRoads(
	bbox: OsmBbox,
	signal?: AbortSignal,
): Promise<OverpassResult> {
	const query = buildOverpassQuery(bbox);
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
		.map(asOverpassWay)
		.filter((w): w is OverpassWay => w !== null);
	return { ok: true, data: ways };
}
