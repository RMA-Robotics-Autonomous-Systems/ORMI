/**
 * Shared catalogue of raster basemap (XYZ tile) providers offered by the ORMI
 * map widgets, plus the helpers needed to build a JSON Schema dropdown from it
 * and to attach a per-widget API key to the providers that require one.
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
 */

/**
 * A selectable raster basemap.
 */
export interface BasemapProvider {
	/** XYZ tile URL template, containing `{z}`, `{x}` and `{y}` placeholders. */
	url: string;
	/** Human-readable label shown in the basemap dropdown. */
	title: string;
	/** Vendor name, for UI labels and help text. */
	provider: string;
	/**
	 * Query-parameter name carrying the API key, present only when this
	 * provider requires a key.
	 */
	keyParam?: string;
	/** Where an operator obtains a key, present only alongside `keyParam`. */
	keyUrl?: string;
}

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
];

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
