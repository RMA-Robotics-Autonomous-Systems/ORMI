import type { MapServerAuth } from "./auth";

/**
 * Data model of the map-server registry.
 *
 * React-free and maplibre-runtime-free: this module is reached through the
 * `@workspace/ormi-core/map-layers/model` subpath, which the `apps/web` API
 * routes import. Nothing here may import a barrel that reaches React, a
 * stylesheet or react-map-gl.
 */

/**
 * One layer an operator has touched in a map widget's configuration, as
 * persisted in that widget's settings (`mapLayers: MapLayerRef[]`).
 *
 * Carries identity only, never a credential: the server is named by its
 * `serverKey()`, which is built from a URL that may not carry userinfo.
 */
export interface MapLayerRef {
	/** Canonical server identity, see `serverKey()`. */
	serverKey: string;
	/** Adapter-scoped layer id, e.g. `"spain:atlas_road_aidedex_v1"`. */
	layerId: string;
	/** Whether the layer is drawn. A switched-off ref is kept, opacity included. */
	enabled: boolean;
	/** 0..1, kept while disabled. */
	opacity: number;
}

/** One layer in a server's catalogue snapshot. */
export interface MapLayerEntry {
	/** Adapter-scoped id, matched by {@link MapLayerRef.layerId}. */
	id: string;
	/** Display title. */
	title: string;
	/** WGS84 extent `[west, south, east, north]`. */
	bounds?: [w: number, s: number, e: number, n: number];
	/** Shallowest zoom the source publishes. */
	minzoom?: number;
	/** Deepest zoom the source publishes (core clamps it to the map's ceiling). */
	maxzoom?: number;
	/** Tile size in pixels. */
	tileSize: 256 | 512;
	/** `false`: listed, named "Not available in Web Mercator", never selectable. */
	webMercator: boolean;
	/** Adapter-private (matrix set, format, style). Never credentials. */
	params: Record<string, string>;
}

/** Settings every map-server adapter's settings extend. */
export interface MapServerSettings {
	/** Server base URL (`http:` or `https:`, no userinfo). */
	url: string;
	/** Stored authentication. Secrets are only present on the owner's own read. */
	auth?: MapServerAuth;
}

/** A map server as stored for one user, in registry order. */
export interface MapServerRecord {
	/** Record id (cuid). */
	id: string;
	/** Canonical identity, see `serverKey()`. */
	serverKey: string;
	/** Id of the `MapLayerProviderDefinition` that owns `settings`. */
	adapterId: string;
	/** Operator-facing title. */
	title: string;
	/** Adapter settings, including auth. Secrets only on the owner's own read. */
	settings: MapServerSettings;
	/** Last successful discovery snapshot, `null` before the first one. */
	catalog: MapLayerEntry[] | null;
	/** ISO timestamp of {@link catalog}, `null` before the first discovery. */
	catalogFetchedAt: string | null;
}

/**
 * A ready-made server an adapter offers in Settings > Add. Once added it is an
 * ordinary stored record (edit, refresh, remove), never a built-in class.
 */
export interface MapServerPreset {
	/** Preset id, unique within its adapter. */
	id: string;
	/** Title the added record starts with. */
	title: string;
	/** Settings the added record starts with. */
	settings: MapServerSettings;
}

/** What an adapter's `discover` is handed. */
export interface DiscoveryContext {
	/** Aborted when the operator cancels or the dialog closes. */
	signal: AbortSignal;
	/**
	 * `fetch` with this server's auth applied (query params or headers), built
	 * from `resolveMapServerAuth`. Adapters never see the credential itself.
	 */
	fetch: (url: string) => Promise<Response>;
}

/** Why a discovery failed, in operator terms. */
export type DiscoveryFailureReason =
	| "unreachable"
	| "blocked-insecure"
	| "cors"
	| "unauthorized"
	| "not-a-server";

/** Outcome of an adapter's `discover`. */
export type DiscoveryResult =
	| { status: "ok"; layers: MapLayerEntry[] }
	| {
			status: "error";
			reason: DiscoveryFailureReason;
			detail?: string;
	  };
