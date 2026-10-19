import { describe, expect, it } from "bun:test";

import type { MapLayerEntry, MapLayerRef, MapServerRecord } from "../model";
import type { MapLayerProviderDefinition } from "../provider-definition";
import { rasterLayerId, resolveLayerRefs } from "../resolve-layer-refs";
import { serverKey } from "../server-key";

const GEO_KEY = serverKey("geoserver", "http://localhost:8095/geoserver");
const XYZ_KEY = serverKey("xyz", "https://tiles.example.org/overlays");

function entry(id: string, extra: Partial<MapLayerEntry> = {}): MapLayerEntry {
	return {
		id,
		title: id,
		tileSize: 256,
		webMercator: true,
		params: {},
		...extra,
	};
}

const geoserver: MapLayerProviderDefinition = {
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
		maxzoom: 30,
	}),
};

const xyz: MapLayerProviderDefinition = {
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

const geoServer: MapServerRecord = {
	id: "s1",
	serverKey: GEO_KEY,
	adapterId: "geoserver",
	title: "Lab GeoServer",
	settings: {
		url: "http://localhost:8095/geoserver",
		auth: { kind: "query-token", token: "s3cret" },
	},
	catalog: [
		entry("spain:atlas_openfield_aidedex_v1_crop", {
			bounds: [-3.71, 40.41, -3.7, 40.42],
			maxzoom: 30,
		}),
		entry("spain:atlas_road_aidedex_v1", {
			bounds: [-3.72, 40.4, -3.71, 40.41],
		}),
		entry("Sweden:T1_AIDEDEX", { webMercator: false }),
	],
	catalogFetchedAt: "2026-10-19T10:00:00.000Z",
};

const xyzServer: MapServerRecord = {
	id: "s2",
	serverKey: XYZ_KEY,
	adapterId: "xyz",
	title: "Public overlays",
	settings: { url: "https://tiles.example.org/overlays" },
	catalog: [entry("rail", { maxzoom: 18, minzoom: 2 })],
	catalogFetchedAt: null,
};

function ref(key: string, layerId: string, enabled = true): MapLayerRef {
	return { serverKey: key, layerId, enabled, opacity: 0.5 };
}

const SERVERS = [geoServer, xyzServer];
const PROVIDERS = [geoserver, xyz];
const OPTS = { maxZoom: 24 };

describe("resolveLayerRefs", () => {
	it("resolves every kind", () => {
		const refs = [
			ref(GEO_KEY, "spain:atlas_road_aidedex_v1"),
			ref("geoserver:http://gone.example.org", "x"),
			ref(GEO_KEY, "spain:removed_layer"),
			ref(GEO_KEY, "Sweden:T1_AIDEDEX"),
		];
		const noXyz = [geoserver];
		const unknownAdapter: MapServerRecord = {
			...xyzServer,
			id: "s3",
			serverKey: "titiler:http://127.0.0.1:8000",
			adapterId: "titiler",
		};
		const all = resolveLayerRefs(
			[...refs, ref("titiler:http://127.0.0.1:8000", "cog")],
			[...SERVERS, unknownAdapter],
			noXyz,
			OPTS,
		);
		const kinds = Object.fromEntries(
			all.map((r) => [r.ref.layerId, r.kind]),
		);
		expect(kinds).toEqual({
			"spain:atlas_road_aidedex_v1": "ok",
			x: "missing-server",
			"spain:removed_layer": "missing-layer",
			"Sweden:T1_AIDEDEX": "not-web-mercator",
			cog: "adapter-unavailable",
		});
		const unavailable = all.find((r) => r.kind === "adapter-unavailable");
		expect(
			unavailable && "adapterId" in unavailable && unavailable.adapterId,
		).toBe("titiler");
	});

	it("never drops a ref, disabled or duplicated ones included", () => {
		const refs = [
			ref(GEO_KEY, "spain:atlas_road_aidedex_v1", false),
			ref(GEO_KEY, "spain:atlas_road_aidedex_v1"),
			ref("nope", "nope"),
			ref(XYZ_KEY, "rail", false),
		];
		const out = resolveLayerRefs(refs, SERVERS, PROVIDERS, OPTS);
		expect(out).toHaveLength(refs.length);
		for (const r of refs) expect(out.map((o) => o.ref)).toContain(r);
		expect(resolveLayerRefs(refs, [], [], OPTS)).toHaveLength(refs.length);
	});

	it("orders by registry (server position, then catalogue), never by click order", () => {
		const refs = [
			ref(XYZ_KEY, "rail"),
			ref("missing", "m"),
			ref(GEO_KEY, "spain:atlas_road_aidedex_v1"),
			ref(GEO_KEY, "spain:removed_layer"),
			ref(GEO_KEY, "spain:atlas_openfield_aidedex_v1_crop"),
		];
		const order = resolveLayerRefs(refs, SERVERS, PROVIDERS, OPTS).map(
			(r) => r.ref.layerId,
		);
		expect(order).toEqual([
			"spain:atlas_openfield_aidedex_v1_crop",
			"spain:atlas_road_aidedex_v1",
			"spain:removed_layer",
			"rail",
			"m",
		]);
		const swapped = resolveLayerRefs(
			refs,
			[xyzServer, geoServer],
			PROVIDERS,
			OPTS,
		).map((r) => r.ref.layerId);
		expect(swapped[0]).toBe("rail");
	});

	it("puts bounds and a clamped maxzoom on every source", () => {
		const out = resolveLayerRefs(
			[
				ref(GEO_KEY, "spain:atlas_openfield_aidedex_v1_crop"),
				ref(GEO_KEY, "spain:atlas_road_aidedex_v1"),
				ref(XYZ_KEY, "rail"),
			],
			SERVERS,
			PROVIDERS,
			OPTS,
		);
		const sources = out.map((r) =>
			r.kind === "ok" ? r.source : undefined,
		);
		expect(sources.every(Boolean)).toBe(true);
		// Entry says 30, adapter says 30: clamped to the map ceiling.
		expect(sources[0]?.maxzoom).toBe(24);
		expect(sources[0]?.bounds).toEqual([-3.71, 40.41, -3.7, 40.42]);
		// Entry has no depth, adapter says 30: clamped.
		expect(sources[1]?.maxzoom).toBe(24);
		expect(sources[1]?.bounds).toEqual([-3.72, 40.4, -3.71, 40.41]);
		// Shallower than the ceiling: kept.
		expect(sources[2]?.maxzoom).toBe(18);
		expect(sources[2]?.minzoom).toBe(2);
		expect(sources[2]?.bounds).toBeUndefined();
		for (const source of sources) expect(source?.type).toBe("raster");

		const shallow = resolveLayerRefs(
			[ref(GEO_KEY, "spain:atlas_road_aidedex_v1")],
			SERVERS,
			PROVIDERS,
			{
				maxZoom: 12,
			},
		)[0];
		expect(shallow?.kind === "ok" && shallow.source.maxzoom).toBe(12);
	});

	it("appends query auth to the tile template without breaking its braces", () => {
		const [ok] = resolveLayerRefs(
			[ref(GEO_KEY, "spain:atlas_road_aidedex_v1")],
			SERVERS,
			PROVIDERS,
			OPTS,
		);
		expect(ok?.kind).toBe("ok");
		if (ok?.kind !== "ok") return;
		expect(ok.source.tiles).toEqual([
			"http://localhost:8095/geoserver/gwc/service/wmts/rest/spain:atlas_road_aidedex_v1/EPSG:900913/EPSG:900913:{z}/{y}/{x}?format=image/png&authkey=s3cret",
		]);
		// The secret stays out of every identity.
		expect(ok.id).not.toContain("s3cret");
		expect(ok.ref).toEqual(ref(GEO_KEY, "spain:atlas_road_aidedex_v1"));
	});

	it("does not mutate the adapter's source", () => {
		const shared = {
			type: "raster" as const,
			tiles: ["http://h/{z}/{x}/{y}"],
			maxzoom: 30,
		};
		const provider: MapLayerProviderDefinition = {
			...geoserver,
			toSource: () => shared,
		};
		resolveLayerRefs(
			[ref(GEO_KEY, "spain:atlas_road_aidedex_v1")],
			[geoServer],
			[provider],
			OPTS,
		);
		expect(shared).toEqual({
			type: "raster",
			tiles: ["http://h/{z}/{x}/{y}"],
			maxzoom: 30,
		});
	});

	it("reports a throwing adapter as unavailable instead of crashing", () => {
		const broken: MapLayerProviderDefinition = {
			...geoserver,
			toSource: () => {
				throw new Error("boom");
			},
		};
		const warn = console.warn;
		console.warn = () => {};
		try {
			const [r] = resolveLayerRefs(
				[ref(GEO_KEY, "spain:atlas_road_aidedex_v1")],
				[geoServer],
				[broken],
				OPTS,
			);
			expect(r?.kind).toBe("adapter-unavailable");
		} finally {
			console.warn = warn;
		}
	});
});

describe("rasterLayerId", () => {
	it("is stable, sanitised, and separates servers", () => {
		const id = rasterLayerId(GEO_KEY, "spain:atlas_road_aidedex_v1");
		expect(id).toBe(rasterLayerId(GEO_KEY, "spain:atlas_road_aidedex_v1"));
		expect(id).toMatch(
			/^ormi-raster-[0-9a-z]+-spain_atlas_road_aidedex_v1-[0-9a-z]+$/,
		);
		expect(id).not.toContain("localhost");
		expect(rasterLayerId(XYZ_KEY, "spain:atlas_road_aidedex_v1")).not.toBe(
			id,
		);
	});
});

describe("rasterLayerId collisions", () => {
	it("keeps ids that sanitise alike apart, deterministically", () => {
		const colon = rasterLayerId(GEO_KEY, "ws:a");
		const under = rasterLayerId(GEO_KEY, "ws_a");
		expect(colon).not.toBe(under);
		expect(colon).toBe(rasterLayerId(GEO_KEY, "ws:a"));
		expect(rasterLayerId(GEO_KEY, "ws a")).not.toBe(colon);
		for (const id of [colon, under]) expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
	});
});

describe("auth scoping and attribution in the built source", () => {
	const elsewhere: MapLayerProviderDefinition = {
		...geoserver,
		toSource: (layer, settings) => ({
			type: "raster",
			tiles: [
				`${settings.url}/gwc/${layer.id}/{z}/{y}/{x}.png`,
				`https://cdn.example.org/geoserver/${layer.id}/{z}/{y}/{x}.png`,
				"http://localhost:8095/geoserver2/{z}/{x}/{y}.png",
			],
			url: "https://cdn.example.org/tiles.json",
			attribution:
				'&copy; <a href="https://lab.example.org" onclick="steal()">Lab</a><img src=x onerror=alert(1)>',
		}),
	};

	it("adds the query token only to templates under the server prefix", () => {
		const [ok] = resolveLayerRefs(
			[ref(GEO_KEY, "spain:atlas_road_aidedex_v1")],
			SERVERS,
			[elsewhere, xyz],
			OPTS,
		);
		expect(ok?.kind).toBe("ok");
		if (ok?.kind !== "ok") return;
		expect(ok.source.tiles).toEqual([
			"http://localhost:8095/geoserver/gwc/spain:atlas_road_aidedex_v1/{z}/{y}/{x}.png?authkey=s3cret",
			"https://cdn.example.org/geoserver/spain:atlas_road_aidedex_v1/{z}/{y}/{x}.png",
			"http://localhost:8095/geoserver2/{z}/{x}/{y}.png",
		]);
		expect(ok.source.url).toBe("https://cdn.example.org/tiles.json");
	});

	it("sanitises the adapter's attribution", () => {
		const [ok] = resolveLayerRefs(
			[ref(GEO_KEY, "spain:atlas_road_aidedex_v1")],
			SERVERS,
			[elsewhere, xyz],
			OPTS,
		);
		if (ok?.kind !== "ok") throw new Error("expected ok");
		expect(ok.source.attribution).toBe(
			'\u00a9 <a href="https://lab.example.org/" target="_blank" rel="noopener noreferrer">Lab</a>',
		);
	});
});
