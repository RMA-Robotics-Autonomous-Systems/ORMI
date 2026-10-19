import type { JsonSchema, UISchemaElement } from "@jsonforms/core";
import type { RasterSourceSpecification } from "@maplibre/maplibre-gl-style-spec";

import type { MapServerAuthCapability } from "./auth";
import type {
	DiscoveryContext,
	DiscoveryResult,
	MapLayerEntry,
	MapServerPreset,
	MapServerSettings,
} from "./model";

/** A MapLibre raster source specification (type-only). */
export type RasterSourceSpec = RasterSourceSpecification;

/**
 * A map-server adapter: one server type (GeoServer, OGC WMS, TiTiler, XYZ).
 * Registered on `PluginsHooks.MAP_LAYER_PROVIDERS`; core owns this contract,
 * plugins ship the adapters.
 *
 * The definition *shape* follows `DatasourceDefinition` (`schema`, `data`,
 * `summaryProps`); the lifecycle does not: a map server has no topics, no
 * READY and no subscriptions.
 */
export interface MapLayerProviderDefinition<
	S extends MapServerSettings = MapServerSettings,
> {
	/** Adapter id, e.g. `"geoserver"`, `"ogc-wms"`, `"titiler"`, `"xyz"`. Part of `serverKey`. */
	id: string;
	/** Display name of the server type, e.g. `"GeoServer"`. */
	name: string;
	/** Settings schema. Embed `mapServerAuthProperty(auth)` under `auth`. */
	schema: JsonSchema;
	/** Optional settings uischema. */
	uischema?: UISchemaElement;
	/** Defaults. Every `schema.required` must be satisfiable from these. */
	data: S;
	/**
	 * Settings keys safe to show as a one-line summary (the URL). An allowlist;
	 * `"auth"` and any secret-like key are never allowed. Typed as plain
	 * strings (as `DatasourceDefinition.summaryProps` is) so an adapter with
	 * its own settings type stays assignable to the base definition; the
	 * registry test checks every key exists in `data`.
	 */
	summaryProps?: readonly string[];
	/** Auth kinds this server type supports. */
	auth: MapServerAuthCapability;
	/**
	 * Lists the server's layers, browser-direct. Fetch through `ctx.fetch` so
	 * auth is applied. Never throws for an expected failure: report it as a
	 * `DiscoveryResult` error with a reason.
	 */
	discover(settings: S, ctx: DiscoveryContext): Promise<DiscoveryResult>;
	/**
	 * Builds the raster source of one catalogue layer. Pure, synchronous, no
	 * credentials: core appends auth query params, sets `bounds` and clamps
	 * `maxzoom` to the map's ceiling.
	 */
	toSource(layer: MapLayerEntry, settings: S): RasterSourceSpec;
	/** Ready-made servers offered in Settings > Add, stored like any server once added. */
	presets?: readonly MapServerPreset[];
}
