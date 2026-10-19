import { applyQueryParams, authForUrl, resolveMapServerAuth } from "./auth";
import { sanitizeAttribution } from "./attribution";
import type { MapLayerEntry, MapLayerRef, MapServerRecord } from "./model";
import type {
	MapLayerProviderDefinition,
	RasterSourceSpec,
} from "./provider-definition";

/**
 * Resolution of a widget's `MapLayerRef[]` against the user's registry. Pure,
 * React-free.
 */

/** One ref, resolved. Every ref produces exactly one of these. */
export type ResolvedLayer =
	| {
			kind: "ok";
			ref: MapLayerRef;
			server: MapServerRecord;
			entry: MapLayerEntry;
			/** Final source: adapter source + auth query params + bounds + clamped maxzoom. */
			source: RasterSourceSpec;
			/** Stable MapLibre layer id, see {@link rasterLayerId}. */
			id: string;
	  }
	| { kind: "missing-server"; ref: MapLayerRef }
	| { kind: "missing-layer"; ref: MapLayerRef; server: MapServerRecord }
	| { kind: "adapter-unavailable"; ref: MapLayerRef; adapterId: string }
	| {
			kind: "not-web-mercator";
			ref: MapLayerRef;
			server: MapServerRecord;
			entry: MapLayerEntry;
	  };

/** Options of {@link resolveLayerRefs}. */
export interface ResolveLayerRefsOptions {
	/** The map's zoom ceiling; every source `maxzoom` is clamped to it. */
	maxZoom: number;
}

/** FNV-1a, 32-bit, base36. Short, deterministic, not a security hash. */
function hashString(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

/**
 * Stable MapLibre layer id of one server layer:
 * `ormi-raster-<hash(serverKey)>-<safe layerId>-<hash(layerId)>`, where the
 * safe layer id has every character outside `[A-Za-z0-9_-]` replaced by `_`.
 * The server hash keeps a URL out of the id and keeps two servers'
 * same-named layers apart; the trailing hash of the **raw** layer id keeps
 * two ids that sanitise alike (`"ws:a"`, `"ws_a"`) apart, while the readable
 * part stays for devtools. Deterministic: the same pair always yields the
 * same id. Use it as the source id too: MapLibre keeps sources and layers in
 * separate namespaces.
 */
export function rasterLayerId(serverKey: string, layerId: string): string {
	const safe = layerId.replace(/[^A-Za-z0-9_-]/g, "_");
	return `ormi-raster-${hashString(serverKey)}-${safe}-${hashString(layerId)}`;
}

/**
 * Builds the final raster source of one layer: a copy of the adapter's
 * source with the auth query params on every tile template (and TileJSON
 * url) that lies under the server's URL prefix (`authForUrl`, so a template
 * pointing at another host never carries the token), the attribution
 * sanitised, the entry's `bounds`, and `maxzoom` clamped to `maxZoom`.
 */
function buildSource(
	provider: MapLayerProviderDefinition,
	server: MapServerRecord,
	entry: MapLayerEntry,
	maxZoom: number,
): RasterSourceSpec {
	const base = provider.toSource(entry, server.settings);
	const { query } = resolveMapServerAuth(server.settings.auth, provider.auth);
	const source: RasterSourceSpec = { ...base, type: "raster" };
	const withAuth = (url: string) =>
		query
			? applyQueryParams(
					url,
					authForUrl(url, server.settings.url, { query }).query,
				)
			: url;

	if (base.tiles) source.tiles = base.tiles.map(withAuth);
	if (base.url) source.url = withAuth(base.url);

	if (typeof base.attribution === "string") {
		source.attribution = sanitizeAttribution(base.attribution);
	} else {
		delete source.attribution;
	}

	const bounds = entry.bounds ?? base.bounds;
	if (bounds) source.bounds = [bounds[0], bounds[1], bounds[2], bounds[3]];

	const minzoom = entry.minzoom ?? base.minzoom;
	if (minzoom !== undefined) source.minzoom = Math.min(minzoom, maxZoom);

	const depth = entry.maxzoom ?? base.maxzoom ?? maxZoom;
	source.maxzoom = Math.min(depth, maxZoom);

	source.tileSize = base.tileSize ?? entry.tileSize;
	return source;
}

/**
 * Resolves every ref against the registry. A ref is never dropped: each one
 * yields exactly one {@link ResolvedLayer}, whatever its `enabled` state, so
 * the dialog can name stale ones and the map can draw the `ok` ones.
 *
 * Output order is **registry order** (server position in `servers`, then the
 * layer's position in that server's catalogue), never the order toggles were
 * clicked in. Refs that cannot be placed in the catalogue (missing server or
 * layer) come after the placeable ones of the same rank, in input order.
 *
 * An adapter whose `toSource` throws is reported as `adapter-unavailable`
 * (with a console warning naming the adapter), so one faulty plugin cannot
 * take a map down.
 */
export function resolveLayerRefs(
	refs: readonly MapLayerRef[],
	servers: readonly MapServerRecord[],
	providers: readonly MapLayerProviderDefinition[],
	opts: ResolveLayerRefsOptions,
): ResolvedLayer[] {
	const serverIndex = new Map<string, number>();
	servers.forEach((server, index) => {
		if (!serverIndex.has(server.serverKey)) {
			serverIndex.set(server.serverKey, index);
		}
	});
	const providerById = new Map<string, MapLayerProviderDefinition>();
	for (const provider of providers) {
		if (!providerById.has(provider.id))
			providerById.set(provider.id, provider);
	}

	const ranked = refs.map((ref, inputIndex) => {
		const sIndex = serverIndex.get(ref.serverKey);
		const server = sIndex === undefined ? undefined : servers[sIndex];
		const eIndex =
			server?.catalog?.findIndex((entry) => entry.id === ref.layerId) ??
			-1;
		return {
			resolved: resolveOne(ref, server, eIndex, providerById, opts),
			rank: [
				sIndex ?? Number.POSITIVE_INFINITY,
				eIndex >= 0 ? eIndex : Number.POSITIVE_INFINITY,
				inputIndex,
			] as const,
		};
	});

	ranked.sort(
		(a, b) =>
			a.rank[0] - b.rank[0] ||
			a.rank[1] - b.rank[1] ||
			a.rank[2] - b.rank[2],
	);
	return ranked.map((item) => item.resolved);
}

function resolveOne(
	ref: MapLayerRef,
	server: MapServerRecord | undefined,
	entryIndex: number,
	providerById: ReadonlyMap<string, MapLayerProviderDefinition>,
	opts: ResolveLayerRefsOptions,
): ResolvedLayer {
	if (!server) return { kind: "missing-server", ref };

	const provider = providerById.get(server.adapterId);
	if (!provider) {
		return {
			kind: "adapter-unavailable",
			ref,
			adapterId: server.adapterId,
		};
	}

	const entry = entryIndex >= 0 ? server.catalog?.[entryIndex] : undefined;
	if (!entry) return { kind: "missing-layer", ref, server };

	if (!entry.webMercator)
		return { kind: "not-web-mercator", ref, server, entry };

	let source: RasterSourceSpec;
	try {
		source = buildSource(provider, server, entry, opts.maxZoom);
	} catch (error) {
		console.warn(
			`Map layer adapter "${provider.id}" could not build a source for layer "${entry.id}"`,
			error,
		);
		return {
			kind: "adapter-unavailable",
			ref,
			adapterId: server.adapterId,
		};
	}

	return {
		kind: "ok",
		ref,
		server,
		entry,
		source,
		id: rasterLayerId(ref.serverKey, ref.layerId),
	};
}
