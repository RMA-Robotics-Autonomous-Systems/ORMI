/**
 * Shared catalogue of the basemaps offered by the ORMI map widgets — raster
 * (XYZ tile) providers and ORMI-bundled vector styles — plus the helpers needed
 * to build a JSON Schema dropdown from it and to attach a per-widget API key to
 * the providers that require one.
 *
 * This module is intentionally dependency-free (no React, no `ormi-core`, no
 * `ormi-plugins`) — same discipline as `topic-key.ts` — so widget code, page
 * presets and schema builders can all agree on one table instead of each
 * repeating the tile URLs.
 *
 * Two of the providers now require a key:
 * - Carto watermarks its tiles ("API KEY REQUIRED") rather than returning an
 *   HTTP error, so a missing key is a silent visual failure.
 * - Stadia Maps serves keyless tiles only on localhost, so a dashboard works in
 *   development and stops working once deployed.
 *
 * The query-parameter name differs per vendor (`key` vs `api_key`), which is
 * why the key is carried in the table rather than hardcoded at the call site.
 *
 * Vector entries work differently: their `url` is not a tile template at all
 * but an opaque `ormi:vector/...` SENTINEL naming one of the styles bundled in
 * `basemap-styles/`. The sentinel deliberately uses a non-HTTP scheme so that
 * anything which mistakes it for a tile template or a style URL fails loudly
 * instead of quietly fetching someone else's style without ORMI's anchors.
 * `url` stays the identity field either way, which is what keeps every
 * persisted widget config — all of them raster — working untouched.
 */

/** Fields every basemap entry carries, raster or vector. */
interface BasemapProviderBase {
	/**
	 * The persisted identity of this basemap, and the value stored in a widget
	 * config. An XYZ tile URL template containing `{z}`, `{x}` and `{y}` for
	 * raster entries; an `ormi:vector/...` sentinel for vector entries.
	 */
	url: string;
	/** Human-readable label shown in the basemap dropdown. */
	title: string;
	/** Vendor name, for UI labels and help text. */
	provider: string;
}

/**
 * A raster XYZ tile basemap.
 *
 * `kind` is optional and absent on every entry: a missing `kind` MEANS raster,
 * which is what lets the ten pre-existing rows — and every widget config
 * persisted against them — stay exactly as they are.
 */
export interface RasterBasemapProvider extends BasemapProviderBase {
	/** Always omitted or `"raster"`; absent is the raster default. */
	kind?: "raster";
	/**
	 * Query-parameter name carrying the API key, present only when this
	 * provider requires a key.
	 */
	keyParam?: string;
	/** Where an operator obtains a key, present only alongside `keyParam`. */
	keyUrl?: string;
}

/** Id of a vector basemap style bundled under `basemap-styles/`. */
export type VectorBasemapStyleId =
	"openfreemap-liberty" | "openfreemap-positron" | "openfreemap-dark";

/**
 * A vector basemap backed by an ORMI-bundled MapLibre style.
 *
 * `keyParam`/`keyUrl` are declared as `undefined` rather than omitted so that
 * the key helpers can keep reading them straight off the union — a vector
 * basemap never takes an API key.
 */
export interface VectorBasemapProvider extends BasemapProviderBase {
	/** Discriminator; always present on vector entries. */
	kind: "vector";
	/** The bundled style this entry selects. */
	styleId: VectorBasemapStyleId;
	/**
	 * Maximum zoom the vector SOURCE actually ships tiles for. MapLibre
	 * overzooms beyond it, so the map stays usable at high zoom — labels and
	 * geometry are simply scaled rather than refined.
	 */
	maxSourceZoom: number;
	/** Never set on a vector basemap. */
	keyParam?: undefined;
	/** Never set on a vector basemap. */
	keyUrl?: undefined;
}

/** A selectable basemap: raster tiles, or an ORMI-bundled vector style. */
export type BasemapProvider = RasterBasemapProvider | VectorBasemapProvider;

/**
 * The basemap both map widgets start on: OpenFreeMap's Liberty vector style.
 *
 * Exported so the two widget schemas — and C2's runtime fallback for an unset
 * `mapUrl` — agree on one value instead of each repeating a sentinel string.
 */
export const DEFAULT_BASEMAP_URL = "ormi:vector/openfreemap-liberty";

/**
 * Every basemap ORMI's map widgets offer, in dropdown order.
 */
export const BASEMAP_PROVIDERS: readonly BasemapProvider[] = [
	{
		url: "https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png",
		title: "Carto Voyager (labels under)",
		provider: "Carto",
		keyParam: "key",
		keyUrl: "https://carto.com/basemaps/apikey/",
	},
	{
		url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
		title: "OpenStreetMap",
		provider: "OpenStreetMap",
	},
	{
		url: "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
		title: "OpenStreetMap Humanitarian",
		provider: "OpenStreetMap France",
	},
	{
		url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
		title: "OpenTopoMap",
		provider: "OpenTopoMap",
	},
	{
		url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png",
		title: "Stadia Alidade Smooth Dark",
		provider: "Stadia Maps",
		keyParam: "api_key",
		keyUrl: "https://docs.stadiamaps.com/authentication/",
	},
	{
		url: "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg",
		title: "Stadia Alidade Satellite",
		provider: "Stadia Maps",
		keyParam: "api_key",
		keyUrl: "https://docs.stadiamaps.com/authentication/",
	},
	{
		url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
		title: "ArcGIS World Imagery",
		provider: "Esri",
	},
	{
		url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
		title: "ArcGIS World Topo Map",
		provider: "Esri",
	},
	{
		url: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png",
		title: "TopPlus Open (gray)",
		provider: "BKG",
	},
	{
		url: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png",
		title: "TopPlus Open (color)",
		provider: "BKG",
	},
	{
		kind: "vector",
		url: DEFAULT_BASEMAP_URL,
		title: "OpenFreeMap Liberty (vector)",
		provider: "OpenFreeMap",
		styleId: "openfreemap-liberty",
		maxSourceZoom: 14,
	},
	{
		kind: "vector",
		url: "ormi:vector/openfreemap-positron",
		title: "OpenFreeMap Positron (vector)",
		provider: "OpenFreeMap",
		styleId: "openfreemap-positron",
		maxSourceZoom: 14,
	},
	{
		kind: "vector",
		url: "ormi:vector/openfreemap-dark",
		title: "OpenFreeMap Dark (vector)",
		provider: "OpenFreeMap",
		styleId: "openfreemap-dark",
		maxSourceZoom: 14,
	},
];

/**
 * Every vector basemap in the catalogue, keyed by its sentinel url.
 *
 * Kept as a `Map` rather than a repeated `.find()` so the per-render lookups in
 * `useMapStyle` stay O(1).
 */
const VECTOR_BASEMAPS_BY_URL: ReadonlyMap<string, VectorBasemapProvider> =
	new Map(
		BASEMAP_PROVIDERS.filter(
			(entry): entry is VectorBasemapProvider => entry.kind === "vector",
		).map((entry) => [entry.url, entry]),
	);

/**
 * The sentinel urls of every vector basemap, in catalogue order.
 *
 * Used as the `enum` of JSON Forms conditions that must hide raster-only
 * controls (the MapTiler 3D-buildings key) when a vector basemap is selected.
 */
export const VECTOR_BASEMAPS: readonly string[] = [
	...VECTOR_BASEMAPS_BY_URL.keys(),
];

/**
 * Whether a persisted `mapUrl` selects an ORMI-bundled vector style.
 *
 * @param url - A persisted basemap value; anything unknown (a custom tile
 *   template, a blank string) is raster.
 * @returns `true` only for a known vector sentinel.
 */
export function isVectorBasemap(url: string): boolean {
	return VECTOR_BASEMAPS_BY_URL.has(url);
}

/**
 * Resolve a persisted `mapUrl` to the bundled style it selects.
 *
 * @param url - A persisted basemap value.
 * @returns The style id, or `undefined` when the value is not a vector
 *   sentinel — in which case the caller must take its raster path.
 */
export function vectorBasemapStyleId(
	url: string,
): VectorBasemapStyleId | undefined {
	return VECTOR_BASEMAPS_BY_URL.get(url)?.styleId;
}

/**
 * The tile URLs of every provider that requires an API key.
 *
 * Derived from {@link BASEMAP_PROVIDERS} so the table stays the single source
 * of truth. Used as the `enum` of a JSON Forms `SHOW` condition, so the API-key
 * field only appears when a key-requiring basemap is selected.
 */
export const BASEMAPS_REQUIRING_KEY: readonly string[] =
	BASEMAP_PROVIDERS.filter((entry) => entry.keyParam !== undefined).map(
		(entry) => entry.url,
	);

/**
 * Build the `oneOf` array for a JSON Schema string property rendered as a
 * basemap dropdown.
 *
 * @returns One `{ const, title }` entry per {@link BASEMAP_PROVIDERS} row.
 */
export function basemapOneOf(): { const: string; title: string }[] {
	return BASEMAP_PROVIDERS.map((entry) => ({
		const: entry.url,
		title: entry.title,
	}));
}

/**
 * Append the operator's API key to a basemap tile template, when the provider
 * needs one.
 *
 * Deliberately plain string concatenation: these are tile *templates*
 * containing `{z}/{x}/{y}`, and running them through `new URL(...)` would
 * percent-encode the braces and break the template for MapLibre.
 *
 * The provider is matched on the url with any existing query string stripped,
 * so a template that already carries parameters is still recognised and gets
 * its key appended with `&` rather than a second `?`.
 *
 * @param url - The tile URL template, normally one of {@link BASEMAP_PROVIDERS}.
 * @param key - The operator-supplied API key; blank or absent is a no-op.
 * @returns The url unchanged when no key is needed or none was given,
 *   otherwise the url with the provider's key parameter appended.
 */
export function applyBasemapKey(url: string, key?: string): string {
	const trimmed = key?.trim();
	if (!trimmed) return url;

	const queryStart = url.indexOf("?");
	const baseUrl = queryStart === -1 ? url : url.slice(0, queryStart);
	const provider = BASEMAP_PROVIDERS.find((entry) => entry.url === baseUrl);
	if (!provider?.keyParam) return url;

	const separator = queryStart === -1 ? "?" : "&";
	return `${url}${separator}${provider.keyParam}=${encodeURIComponent(trimmed)}`;
}
