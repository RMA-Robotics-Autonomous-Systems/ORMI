/**
 * GeoServer adapter.
 *
 * Discovery reads two anonymous-capable documents and never GeoServer's REST
 * API (which needs an admin account):
 *
 * 1. GeoWebCache's WMTS capabilities. A layer linking the `EPSG:900913`
 *    gridset (or another Web Mercator quadtree set) is drawn from cached
 *    tiles through the WMTS REST template, `TileRow` = `{y}`, `TileCol` = `{x}`
 *    (swapped, GeoServer answers 400).
 * 2. WMS 1.3.0 capabilities. A layer GeoWebCache does not cache, or every
 *    layer when `preferWms` is set, is drawn through GetMap with
 *    `{bbox-epsg-3857}`. WMS order is the catalogue order, since GeoWebCache
 *    lists its layers in no stable order.
 *
 * Either document alone is enough. A failure that is about the server
 * itself (unauthorized, CORS, unreachable) on the first request is reported
 * at once rather than retried against the second.
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
	trimBase,
	type DiscoveryFailure,
} from "../shared/discovery-fetch";
import { authSchema } from "../shared/schema";
import { refuseCredentialQuery } from "../shared/url-safety";
import {
	parseWmsCapabilities,
	pickFormat,
	wmsGetMapTemplate,
	type WmsCapabilities,
} from "../shared/wms";
import { parseWmtsCapabilities, type WmtsLayerInfo } from "../shared/wmts";

/** Settings of a GeoServer registration. */
export interface GeoServerSettings extends MapServerSettings {
	/** GeoServer base URL, e.g. `http://localhost:8095/geoserver`. */
	url: string;
	/** Workspaces to list (`spain`, `Sweden`). Empty lists every workspace. */
	workspaces: string[];
	/** Tile image format. */
	format: string;
	/** Draw every layer through WMS GetMap instead of cached WMTS tiles. */
	preferWms: boolean;
	/** Stored authentication. */
	auth?: MapServerAuth;
}

/** GeoServer accepts HTTP basic auth and, with the authkey module, a URL token. */
export const GEOSERVER_AUTH: MapServerAuthCapability = {
	kinds: ["none", "basic", "query-token"],
	queryParam: "authkey",
};

/** Adapter id, part of every GeoServer `serverKey`. */
export const GEOSERVER_ADAPTER_ID = "geoserver";

/** WMS version the GetMap fallback speaks. */
const WMS_VERSION = "1.3.0";

/** URL of GeoWebCache's WMTS capabilities under a GeoServer base. */
export function geoserverWmtsCapabilitiesUrl(base: string): string {
	return `${trimBase(base)}/gwc/service/wmts?REQUEST=GetCapabilities`;
}

/** URL of the WMS 1.3.0 capabilities under a GeoServer base. */
export function geoserverWmsCapabilitiesUrl(base: string): string {
	return `${trimBase(base)}/ows?service=WMS&version=1.3.0&request=GetCapabilities`;
}

/**
 * True when `layerName` belongs to one of `workspaces` (its `ws:` prefix,
 * compared case-insensitively). An empty list admits every layer; a layer
 * with no workspace prefix (a global layer group) is admitted only then.
 */
export function inWorkspaces(
	layerName: string,
	workspaces: readonly string[],
): boolean {
	const wanted = workspaces
		.map((w) => w.trim().toLowerCase())
		.filter((w) => w.length > 0);
	if (wanted.length === 0) return true;
	const colon = layerName.indexOf(":");
	if (colon <= 0) return false;
	return wanted.includes(layerName.slice(0, colon).toLowerCase());
}

/**
 * A layer title that names its workspace: `Atlas road (spain)` for
 * `spain:atlas_road`. GeoServer titles drop the prefix, so two workspaces'
 * same-named layers would otherwise read the same in a layer list. A title
 * that already carries the workspace, or a name without one, is kept.
 */
export function titleWithWorkspace(title: string, layerName: string): string {
	const colon = layerName.indexOf(":");
	if (colon <= 0) return title;
	const workspace = layerName.slice(0, colon);
	if (title.startsWith(`${workspace}:`) || title === layerName) return title;
	return `${title} (${workspace})`;
}

/**
 * Builds the catalogue from parsed capabilities. Pure: exported for tests.
 *
 * @param wmts - WMTS layers, or `null` when that document was not read.
 * @param wms - WMS capabilities, or `null` when that document was not read.
 */
export function buildGeoServerCatalog(
	wmts: readonly WmtsLayerInfo[] | null,
	wms: WmsCapabilities | null,
	settings: Pick<GeoServerSettings, "workspaces" | "format" | "preferWms">,
): MapLayerEntry[] {
	const wmtsById = new Map((wmts ?? []).map((l) => [l.id, l]));
	const wmsByName = new Map((wms?.layers ?? []).map((l) => [l.name, l]));
	const order = [
		...wmsByName.keys(),
		...[...wmtsById.keys()].filter((id) => !wmsByName.has(id)),
	];
	const entries: MapLayerEntry[] = [];
	for (const id of order) {
		if (!inWorkspaces(id, settings.workspaces)) continue;
		const tiled = wmtsById.get(id);
		const mapped = wmsByName.get(id);
		const title = titleWithWorkspace(
			mapped?.title ?? tiled?.title ?? id,
			id,
		);
		const bounds = tiled?.bounds ?? mapped?.bounds;
		if (tiled?.mercator && !settings.preferWms) {
			entries.push({
				id,
				title,
				bounds,
				minzoom: tiled.mercator.minzoom,
				maxzoom: tiled.mercator.maxzoom,
				tileSize: tiled.mercator.tileSize,
				webMercator: true,
				params: {
					mode: "wmts",
					matrixSet: tiled.mercator.matrixSet,
					format: pickFormat(tiled.formats, settings.format),
				},
			});
		} else if (mapped?.webMercator && mapped.mercatorCrs) {
			entries.push({
				id,
				title,
				bounds,
				tileSize: 256,
				webMercator: true,
				params: {
					mode: "wms",
					crs: mapped.mercatorCrs,
					format: pickFormat(wms?.formats ?? [], settings.format),
					version: WMS_VERSION,
				},
			});
		} else {
			entries.push({
				id,
				title,
				bounds,
				tileSize: 256,
				webMercator: false,
				params: {},
			});
		}
	}
	return entries;
}

/** A failure about the server itself, not about one of its two documents. */
function isServerLevel(
	failure: DiscoveryFailure,
	status: number | undefined,
): boolean {
	return (
		failure.reason === "unauthorized" ||
		(status === undefined && failure.reason !== "not-a-server")
	);
}

type ReadResult<T> =
	| { ok: true; value: T }
	| { ok: false; failure: DiscoveryFailure; serverLevel: boolean };

async function readDocument<T>(
	ctx: DiscoveryContext,
	url: string,
	parse: (text: string) => T,
	label: string,
): Promise<ReadResult<T>> {
	const res = await fetchText(ctx, url);
	if (!res.ok)
		return {
			ok: false,
			failure: res.failure,
			serverLevel: isServerLevel(res.failure, res.status),
		};
	try {
		return { ok: true, value: parse(res.text) };
	} catch {
		return {
			ok: false,
			failure: notAServer(`No ${label} capabilities at this URL`),
			serverLevel: false,
		};
	}
}

/** Lists a GeoServer's layers. */
export async function discoverGeoServer(
	settings: GeoServerSettings,
	ctx: DiscoveryContext,
): Promise<DiscoveryResult> {
	const insecure = checkInsecure(settings.url);
	if (insecure) return insecure;
	const urlCredential = refuseCredentialQuery(settings.url, "URL");
	if (urlCredential) return urlCredential;

	let wmts: WmtsLayerInfo[] | null = null;
	let wmtsFailure: DiscoveryFailure | undefined;
	if (!settings.preferWms) {
		const read = await readDocument(
			ctx,
			geoserverWmtsCapabilitiesUrl(settings.url),
			(t) => parseWmtsCapabilities(t),
			"WMTS",
		);
		if (read.ok) wmts = read.value;
		else if (read.serverLevel) return read.failure;
		else wmtsFailure = read.failure;
	}

	const wmsRead = await readDocument(
		ctx,
		geoserverWmsCapabilitiesUrl(settings.url),
		(t) => parseWmsCapabilities(t),
		"WMS",
	);
	if (!wmsRead.ok && wmts === null)
		return wmsRead.serverLevel
			? wmsRead.failure
			: (wmtsFailure ?? wmsRead.failure);
	const wms = wmsRead.ok ? wmsRead.value : null;

	return { status: "ok", layers: buildGeoServerCatalog(wmts, wms, settings) };
}

/** Raster source of one GeoServer catalogue layer. Pure, no credentials. */
export function geoServerSource(
	layer: MapLayerEntry,
	settings: GeoServerSettings,
): RasterSourceSpec {
	const base = trimBase(settings.url);
	const format = layer.params.format ?? settings.format;
	if (layer.params.mode === "wmts" && layer.params.matrixSet) {
		const set = layer.params.matrixSet;
		return {
			type: "raster",
			tileSize: layer.tileSize,
			tiles: [
				`${base}/gwc/service/wmts/rest/${layer.id}/${set}/${set}:{z}/{y}/{x}?format=${format}`,
			],
		};
	}
	return {
		type: "raster",
		tileSize: layer.tileSize,
		tiles: [
			wmsGetMapTemplate(`${base}/ows`, {
				layer: layer.id,
				format,
				version: layer.params.version ?? WMS_VERSION,
				crs: layer.params.crs ?? "EPSG:3857",
				tileSize: layer.tileSize,
			}),
		],
	};
}

/** The GeoServer adapter definition. */
export const geoserverProvider: MapLayerProviderDefinition<GeoServerSettings> =
	{
		id: GEOSERVER_ADAPTER_ID,
		name: "GeoServer",
		schema: {
			type: "object",
			properties: {
				url: {
					type: "string",
					title: "URL",
					description: "GeoServer base URL, ending in /geoserver",
					default: "http://localhost:8095/geoserver",
				},
				workspaces: {
					type: "array",
					title: "Workspaces",
					description: "Leave empty to list every workspace.",
					items: { type: "string", minLength: 1 },
					default: [],
				},
				format: {
					type: "string",
					title: "Tile format",
					enum: ["image/png", "image/jpeg"],
					default: "image/png",
				},
				preferWms: {
					type: "boolean",
					title: "Use WMS instead of cached tiles",
					default: false,
				},
				auth: authSchema(GEOSERVER_AUTH),
			},
			required: ["url"],
		},
		data: {
			url: "http://localhost:8095/geoserver",
			workspaces: [],
			format: "image/png",
			preferWms: false,
			auth: { kind: "none" },
		},
		summaryProps: ["url"],
		auth: GEOSERVER_AUTH,
		discover: discoverGeoServer,
		toSource: geoServerSource,
	};
