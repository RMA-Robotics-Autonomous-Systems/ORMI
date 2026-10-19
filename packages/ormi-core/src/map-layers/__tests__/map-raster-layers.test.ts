import { describe, expect, it } from "bun:test";

import {
	buildMapServerHeaderRules,
	composeTransformRequest,
	createScopedTransformRequest,
} from "../compose-transform-request";
import { resolveLayerRefs, rasterLayerId } from "../resolve-layer-refs";
import {
	TILE_ERROR_THRESHOLD,
	createTileHealthTracker,
	planRasterOverlay,
	stripQueryStrings,
	toRasterOverlayLayers,
	type RasterOverlayLayer,
} from "../raster-overlay-plan";
import { mapLayerHealthKey } from "../map-servers-store";
import {
	FIELD,
	GEO_KEY,
	GEO_URL,
	PROVIDERS,
	ROAD,
	SWEDEN,
	XYZ_KEY,
	XYZ_URL,
	geoServer,
	xyzServer,
} from "./map-layers-fixtures";

const BASIC = `Basic ${btoa("viewer:s3cret")}`;

function resolve(password = "s3cret", enabled = true) {
	return resolveLayerRefs(
		[
			{ serverKey: GEO_KEY, layerId: ROAD, enabled, opacity: 0.5 },
			{ serverKey: XYZ_KEY, layerId: "rail", enabled: true, opacity: 1 },
		],
		[geoServer(password), xyzServer],
		PROVIDERS,
		{ maxZoom: 24 },
	);
}

const GEO_TILE = `${GEO_URL}/gwc/service/wmts/rest/${ROAD}/EPSG:900913/EPSG:900913:20/1/2?format=image/png`;

describe("transformRequest", () => {
	it("adds headers only under a used server's prefix, never to the basemap", () => {
		const scoped = createScopedTransformRequest(
			buildMapServerHeaderRules(resolve(), PROVIDERS),
		);
		expect(scoped.transformRequest(GEO_TILE)).toEqual({
			url: GEO_TILE,
			headers: { Authorization: BASIC },
		});
		expect(
			scoped.transformRequest("https://tile.openstreetmap.org/1/0/0.png"),
		).toBeUndefined();
		// Same host, sibling path: not covered.
		expect(
			scoped.transformRequest("http://localhost:8095/geoserver2/x.png"),
		).toBeUndefined();
		// The xyz server has no auth: nothing added.
		expect(
			scoped.transformRequest(`${XYZ_URL}/rail/1/0/0.png`),
		).toBeUndefined();
	});

	it("a server with only disabled layers gets no headers", () => {
		expect(
			buildMapServerHeaderRules(resolve("s3cret", false), PROVIDERS),
		).toEqual([]);
	});

	it("keeps its identity while an auth change applies without a remount", () => {
		const scoped = createScopedTransformRequest(
			buildMapServerHeaderRules(resolve(), PROVIDERS),
		);
		const fn = scoped.transformRequest;
		scoped.setRules(
			buildMapServerHeaderRules(resolve("rotated"), PROVIDERS),
		);
		expect(scoped.transformRequest).toBe(fn);
		expect(fn(GEO_TILE)?.headers).toEqual({
			Authorization: `Basic ${btoa("viewer:rotated")}`,
		});
		scoped.setRules([]);
		expect(fn(GEO_TILE)).toBeUndefined();
	});

	it("composes with a widget's own function, the second seeing the first's url", () => {
		const own = (url: string) =>
			url.startsWith("https://basemap")
				? { url: `${url}?key=k`, headers: { "X-Own": "1" } }
				: undefined;
		const scoped = createScopedTransformRequest([
			{
				prefix: "https://basemap.example",
				headers: { Authorization: "Bearer t" },
			},
		]);
		const composed = composeTransformRequest(own, scoped.transformRequest);
		expect(composed("https://basemap.example/1/0/0.png")).toEqual({
			url: "https://basemap.example/1/0/0.png?key=k",
			headers: { "X-Own": "1", Authorization: "Bearer t" },
		});
		expect(composed("https://other/1.png")).toBeUndefined();
		expect(
			composeTransformRequest(undefined, own)("https://basemap/x"),
		).toMatchObject({
			url: "https://basemap/x?key=k",
		});
	});
});

describe("raster overlay plan", () => {
	it("draws enabled ok layers only, with bounds and a clamped maxzoom and no layer maxzoom", () => {
		const resolved = resolveLayerRefs(
			[
				{
					serverKey: GEO_KEY,
					layerId: FIELD,
					enabled: true,
					opacity: 1,
				},
				{
					serverKey: GEO_KEY,
					layerId: ROAD,
					enabled: false,
					opacity: 1,
				},
				{
					serverKey: GEO_KEY,
					layerId: SWEDEN,
					enabled: true,
					opacity: 1,
				},
				{
					serverKey: "gone:x",
					layerId: "a",
					enabled: true,
					opacity: 1,
				},
				// Duplicate ref: drawn once.
				{
					serverKey: GEO_KEY,
					layerId: FIELD,
					enabled: true,
					opacity: 1,
				},
			],
			[geoServer()],
			PROVIDERS,
			{ maxZoom: 24 },
		);
		const layers = toRasterOverlayLayers(resolved);
		expect(layers.map((l) => l.layerId)).toEqual([FIELD]);
		expect(layers[0]!.source.bounds).toEqual([-3.71, 40.41, -3.7, 40.42]);
		expect(layers[0]!.source.maxzoom).toBe(24);
		expect(layers[0]!.bounds).toEqual([-3.71, 40.41, -3.7, 40.42]);
	});

	it("chains beforeId bottom to top and mounts topmost first", () => {
		const layers = toRasterOverlayLayers(resolve());
		expect(layers.map((l) => l.id)).toEqual([
			rasterLayerId(GEO_KEY, ROAD),
			rasterLayerId(XYZ_KEY, "rail"),
		]);
		const plan = planRasterOverlay(layers, "ormi-anchor-overlay");
		expect(plan.map((p) => [p.layer.id, p.beforeId])).toEqual([
			[layers[1]!.id, "ormi-anchor-overlay"],
			[layers[0]!.id, layers[1]!.id],
		]);
		expect(
			planRasterOverlay(layers, undefined)[0]!.beforeId,
		).toBeUndefined();
		expect(planRasterOverlay([], "x")).toEqual([]);
	});

	it("keys a layer on its source spec, not its opacity", () => {
		const [a] = toRasterOverlayLayers(resolve());
		const faded = { ...a!, opacity: 0.1 };
		const moved: RasterOverlayLayer = {
			...a!,
			source: { ...a!.source, bounds: [0, 0, 1, 1] },
		};
		const key = (l: RasterOverlayLayer) =>
			planRasterOverlay([l], undefined)[0]!.key;
		expect(key(faded)).toBe(key(a!));
		expect(key(moved)).not.toBe(key(a!));
	});
});

describe("tile health", () => {
	it("reports not responding at the threshold and recovers on a loaded tile", () => {
		const layers = toRasterOverlayLayers(resolve());
		const tracker = createTileHealthTracker(() => layers);
		const id = layers[0]!.id;
		for (let i = 1; i < TILE_ERROR_THRESHOLD; i++) {
			expect(tracker.onError(id).kind).toBe("unchanged");
		}
		const change = tracker.onError(id);
		expect(change).toMatchObject({
			kind: "not-responding",
			healthKey: mapLayerHealthKey(GEO_KEY, ROAD),
		});
		expect(tracker.onError(id).kind).toBe("unchanged");
		expect(tracker.onTileLoaded(id).kind).toBe("recovered");
		expect(tracker.onTileLoaded(id).kind).toBe("unchanged");
		expect(tracker.onError("basemap").kind).toBe("unchanged");
		expect(tracker.onError(undefined).kind).toBe("unchanged");
	});

	it("strips query strings, and the token in them, from logged messages", () => {
		expect(
			stripQueryStrings(
				"AJAXError: Forbidden (403): http://h/geoserver/x/1/2?authkey=s3cret&format=image/png failed",
			),
		).toBe("AJAXError: Forbidden (403): http://h/geoserver/x/1/2 failed");
	});
});
