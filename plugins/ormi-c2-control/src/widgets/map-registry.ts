import type { C2Feature } from "../types/c2-types";

/**
 * First-class maps registry normalization (pure, testable).
 *
 * The `:5000 /maps` endpoint returns a registry of maps:
 * `{ maps: [ { name, collection, crs, bounds, feature_count, updated_at } ] }`.
 * `/maps/:name/features` returns a GeoJSON `FeatureCollection`. Both are
 * normalized defensively here so the map widget stays free of response-shape
 * guards, tolerating a wrapped or bare-array response.
 */

/** Geographic bounds of a map (degrees, `[lng, lat]` semantics). */
export interface MapBounds {
	minLon: number;
	minLat: number;
	maxLon: number;
	maxLat: number;
}

/** One entry in the maps registry. */
export interface MapRegistryEntry {
	name: string;
	collection?: string;
	crs?: string;
	bounds: MapBounds | null;
	feature_count: number;
	updated_at?: string;
}

/** Read a finite number off a record field, or `undefined`. */
function readNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

/** Normalize a registry `bounds` block, or `null` when absent/incomplete. */
function normalizeBounds(value: unknown): MapBounds | null {
	if (value == null || typeof value !== "object") return null;
	const b = value as Record<string, unknown>;
	const minLon = readNumber(b.minLon);
	const minLat = readNumber(b.minLat);
	const maxLon = readNumber(b.maxLon);
	const maxLat = readNumber(b.maxLat);
	if (
		minLon === undefined ||
		minLat === undefined ||
		maxLon === undefined ||
		maxLat === undefined
	) {
		return null;
	}
	return { minLon, minLat, maxLon, maxLat };
}

/**
 * Normalize the `c2.maps.list` response into registry entries.
 *
 * Accepts a `{ maps: [...] }` wrapper, a bare array, or null; drops entries
 * without a usable `name`.
 *
 * @param data - The raw remote-call response data.
 * @returns Normalized map registry entries (possibly empty).
 */
export function normalizeMaps(data: unknown): MapRegistryEntry[] {
	const list = Array.isArray(data)
		? data
		: Array.isArray((data as { maps?: unknown })?.maps)
			? (data as { maps: unknown[] }).maps
			: [];

	const out: MapRegistryEntry[] = [];
	for (const entry of list) {
		if (entry == null || typeof entry !== "object") continue;
		const obj = entry as Record<string, unknown>;
		if (typeof obj.name !== "string" || obj.name.length === 0) continue;
		out.push({
			name: obj.name,
			collection:
				typeof obj.collection === "string" ? obj.collection : undefined,
			crs: typeof obj.crs === "string" ? obj.crs : undefined,
			bounds: normalizeBounds(obj.bounds),
			feature_count: readNumber(obj.feature_count) ?? 0,
			updated_at:
				typeof obj.updated_at === "string" ? obj.updated_at : undefined,
		});
	}
	return out;
}

/**
 * Normalize the `c2.map.features.list` response into a `C2Feature[]`.
 *
 * Accepts a GeoJSON `FeatureCollection` (`{ features: [...] }`) or a bare
 * array; keeps only entries that carry a `geometry`.
 *
 * @param data - The raw remote-call response data.
 * @returns The map's features (possibly empty).
 */
export function normalizeMapFeatures(data: unknown): C2Feature[] {
	const raw = Array.isArray(data)
		? data
		: Array.isArray((data as { features?: unknown })?.features)
			? (data as { features: unknown[] }).features
			: [];
	return raw.filter(
		(f): f is C2Feature =>
			f != null && typeof f === "object" && "geometry" in f,
	);
}

/** Planner status, as reported by `c2.planner.status`. */
export interface PlannerStatus {
	loaded_map: string | null;
	mode?: string;
	agent_count?: number;
	graph_nodes?: number;
	error?: string | null;
	note?: string;
	updated_at?: string;
}

/**
 * Normalize the `c2.planner.status` response.
 *
 * Tolerates the pre-report shape (`{ loaded_map: null, note }`) and missing
 * fields; returns `null` only when the payload is not an object.
 *
 * @param data - The raw remote-call response data.
 * @returns Normalized planner status, or `null`.
 */
export function normalizePlannerStatus(data: unknown): PlannerStatus | null {
	if (data == null || typeof data !== "object") return null;
	const obj = data as Record<string, unknown>;
	return {
		loaded_map: typeof obj.loaded_map === "string" ? obj.loaded_map : null,
		mode: typeof obj.mode === "string" ? obj.mode : undefined,
		agent_count: readNumber(obj.agent_count),
		graph_nodes: readNumber(obj.graph_nodes),
		error:
			typeof obj.error === "string"
				? obj.error
				: obj.error === null
					? null
					: undefined,
		note: typeof obj.note === "string" ? obj.note : undefined,
		updated_at:
			typeof obj.updated_at === "string" ? obj.updated_at : undefined,
	};
}

/** A GeoJSON FeatureCollection (kept loosely typed for the MapLibre source). */
export interface GeoJsonFeatureCollection {
	type: "FeatureCollection";
	features: unknown[];
}

/**
 * Normalize the `c2.planner.graph` response into a safe GeoJSON
 * `FeatureCollection`.
 *
 * The planner serves `{ loaded_map, node_count, featureCollection, updated_at }`
 * — `featureCollection.features` are Point (nodes) and LineString (edges, with
 * `length`/`risk` props). When the planner hasn't reported a graph yet the
 * payload carries an empty `featureCollection` and a `note`. This tolerates a
 * missing / malformed `featureCollection` (and a bare FeatureCollection at the
 * top level) and ALWAYS returns a drawable FeatureCollection — empty when there
 * is nothing to draw, so the overlay never errors or spams.
 *
 * @param data - The raw remote-call response data.
 * @returns A FeatureCollection with a (possibly empty) `features` array.
 */
export function normalizePlannerGraph(data: unknown): GeoJsonFeatureCollection {
	const empty: GeoJsonFeatureCollection = {
		type: "FeatureCollection",
		features: [],
	};
	if (data == null || typeof data !== "object") return empty;
	const obj = data as Record<string, unknown>;
	// Either `{ featureCollection: { features } }` or a bare FeatureCollection.
	const fc =
		obj.featureCollection != null &&
		typeof obj.featureCollection === "object"
			? (obj.featureCollection as Record<string, unknown>)
			: obj;
	const features = Array.isArray(fc.features)
		? fc.features.filter((f) => f != null && typeof f === "object")
		: [];
	return { type: "FeatureCollection", features };
}
