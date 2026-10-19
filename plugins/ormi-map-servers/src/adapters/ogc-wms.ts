/**
 * Generic OGC WMS adapter (MapServer, QGIS Server, ArcGIS WMS, any WMS 1.3.0).
 *
 * The configured URL is the service endpoint itself, and it is used for
 * GetMap too, never the `OnlineResource` the capabilities advertise: servers
 * behind a proxy routinely advertise an internal host, and auth headers are
 * only attached to requests under the registered URL. Query parameters on
 * the endpoint (MapServer's `map=`) are kept on every request.
 */

import type {
	DiscoveryContext,
	DiscoveryResult,
	MapLayerEntry,
	MapLayerProviderDefinition,
	MapServerAuth,
	MapServerAuthCapability,
	MapServerSettings,
	RasterSourceSpec,
} from "@workspace/ormi-core/map-layers/model";

import {
	checkInsecure,
	fetchText,
	notAServer,
} from "../shared/discovery-fetch";
import { authSchema } from "../shared/schema";
import { refuseCredentialQuery } from "../shared/url-safety";
import {
	parseWmsCapabilities,
	pickFormat,
	wmsGetMapTemplate,
	withQuerySeparator,
} from "../shared/wms";

/** Settings of a WMS registration. */
export interface OgcWmsSettings extends MapServerSettings {
	/** WMS service endpoint. */
	url: string;
	/** Tile image format. */
	format: string;
	/** Stored authentication. */
	auth?: MapServerAuth;
}

/** Generic WMS servers take HTTP basic auth. */
export const OGC_WMS_AUTH: MapServerAuthCapability = {
	kinds: ["none", "basic"],
};

/** Adapter id, part of every WMS `serverKey`. */
export const OGC_WMS_ADAPTER_ID = "ogc-wms";

/** GetCapabilities URL for a WMS endpoint, keeping the endpoint's own query. */
export function wmsCapabilitiesUrl(endpoint: string): string {
	return `${withQuerySeparator(endpoint.trim())}SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`;
}

/** Lists a WMS server's named layers. */
export async function discoverOgcWms(
	settings: OgcWmsSettings,
	ctx: DiscoveryContext,
): Promise<DiscoveryResult> {
	const insecure = checkInsecure(settings.url);
	if (insecure) return insecure;
	const urlCredential = refuseCredentialQuery(settings.url, "URL");
	if (urlCredential) return urlCredential;
	const res = await fetchText(ctx, wmsCapabilitiesUrl(settings.url));
	if (!res.ok) return res.failure;
	let caps;
	try {
		caps = parseWmsCapabilities(res.text);
	} catch {
		return notAServer("No WMS capabilities at this URL");
	}
	const format = pickFormat(caps.formats, settings.format);
	const version = caps.version.startsWith("1.1") ? caps.version : "1.3.0";
	const layers = caps.layers.map((l): MapLayerEntry =>
		l.webMercator && l.mercatorCrs
			? {
					id: l.name,
					title: l.title,
					bounds: l.bounds,
					tileSize: 256,
					webMercator: true,
					params: { crs: l.mercatorCrs, format, version },
				}
			: {
					id: l.name,
					title: l.title,
					bounds: l.bounds,
					tileSize: 256,
					webMercator: false,
					params: {},
				},
	);
	return { status: "ok", layers };
}

/** Raster source of one WMS layer. Pure, no credentials. */
export function ogcWmsSource(
	layer: MapLayerEntry,
	settings: OgcWmsSettings,
): RasterSourceSpec {
	return {
		type: "raster",
		tileSize: layer.tileSize,
		tiles: [
			wmsGetMapTemplate(settings.url.trim(), {
				layer: layer.id,
				format: layer.params.format ?? settings.format,
				version: layer.params.version ?? "1.3.0",
				crs: layer.params.crs ?? "EPSG:3857",
				tileSize: layer.tileSize,
			}),
		],
	};
}

/** The generic WMS adapter definition. */
export const ogcWmsProvider: MapLayerProviderDefinition<OgcWmsSettings> = {
	id: OGC_WMS_ADAPTER_ID,
	name: "OGC WMS",
	schema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				title: "URL",
				description:
					"WMS service endpoint, for example https://example.org/wms",
				default: "",
			},
			format: {
				type: "string",
				title: "Tile format",
				enum: ["image/png", "image/jpeg"],
				default: "image/png",
			},
			auth: authSchema(OGC_WMS_AUTH),
		},
		required: ["url"],
	},
	data: { url: "", format: "image/png", auth: { kind: "none" } },
	summaryProps: ["url"],
	auth: OGC_WMS_AUTH,
	discover: discoverOgcWms,
	toSource: ogcWmsSource,
};
