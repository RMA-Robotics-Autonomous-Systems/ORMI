/**
 * Shared fixtures for the map-layers control and map-side tests: a GeoServer
 * with basic auth (header), an XYZ server with no auth, and their adapters.
 */

import type { MapLayerEntry, MapServerRecord } from "../model";
import type { MapLayerProviderDefinition } from "../provider-definition";
import { serverKey } from "../server-key";

export const GEO_URL = "http://localhost:8095/geoserver";
export const XYZ_URL = "https://tiles.example.org/overlays";
export const GEO_KEY = serverKey("geoserver", GEO_URL);
export const XYZ_KEY = serverKey("xyz", XYZ_URL);

/**
 * Build a catalogue entry.
 * @param id - Layer id.
 * @param extra - Overrides.
 * @returns The entry.
 */
export function entry(
	id: string,
	extra: Partial<MapLayerEntry> = {},
): MapLayerEntry {
	return {
		id,
		title: id,
		tileSize: 256,
		webMercator: true,
		params: {},
		...extra,
	};
}

export const geoserverAdapter: MapLayerProviderDefinition = {
	id: "geoserver",
	name: "GeoServer",
	schema: { type: "object" },
	data: { url: "" },
	auth: { kinds: ["none", "basic", "query-token"], queryParam: "authkey" },
	discover: async () => ({ status: "ok", layers: [] }),
	toSource: (layer, settings) => ({
		type: "raster",
		tiles: [
			`${settings.url}/gwc/service/wmts/rest/${layer.id}/EPSG:900913/EPSG:900913:{z}/{y}/{x}?format=image/png`,
		],
		tileSize: layer.tileSize,
	}),
};

export const xyzAdapter: MapLayerProviderDefinition = {
	id: "xyz",
	name: "XYZ",
	schema: { type: "object" },
	data: { url: "" },
	auth: { kinds: ["none"] },
	discover: async () => ({ status: "ok", layers: [] }),
	toSource: (layer, settings) => ({
		type: "raster",
		tiles: [`${settings.url}/${layer.id}/{z}/{x}/{y}.png`],
	}),
};

export const PROVIDERS = [geoserverAdapter, xyzAdapter];

export const ROAD = "spain:atlas_road_aidedex_v1";
export const FIELD = "spain:atlas_openfield_aidedex_v1_crop";
export const SWEDEN = "Sweden:T1_AIDEDEX";

/**
 * The lab GeoServer, with basic auth.
 * @param password - Basic-auth password.
 * @returns The record.
 */
export function geoServer(password = "s3cret"): MapServerRecord {
	return {
		id: "s1",
		serverKey: GEO_KEY,
		adapterId: "geoserver",
		title: "Lab GeoServer",
		settings: {
			url: GEO_URL,
			auth: { kind: "basic", username: "viewer", password },
		},
		catalog: [
			entry(FIELD, {
				title: "Open field",
				bounds: [-3.71, 40.41, -3.7, 40.42],
			}),
			entry(ROAD, { title: "Road", bounds: [-3.72, 40.4, -3.71, 40.41] }),
			entry(SWEDEN, { title: "Sweden", webMercator: false }),
		],
		catalogFetchedAt: "2026-10-19T10:00:00.000Z",
	};
}

export const xyzServer: MapServerRecord = {
	id: "s2",
	serverKey: XYZ_KEY,
	adapterId: "xyz",
	title: "Public overlays",
	settings: { url: XYZ_URL },
	catalog: [entry("rail", { title: "Railways" })],
	catalogFetchedAt: null,
};
