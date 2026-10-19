import { beforeAll, describe, expect, it } from "bun:test";

import {
	buildGeoServerCatalog,
	titleWithWorkspace,
	geoserverProvider,
	inWorkspaces,
	type GeoServerSettings,
} from "../adapters/geoserver";
import { checkInsecure, isLoopbackHost } from "../shared/discovery-fetch";
import { parseWmsCapabilities } from "../shared/wms";
import { parseWmtsCapabilities } from "../shared/wmts";
import {
	fixture,
	installDomParser,
	routedContext,
	withProbe,
	xml,
} from "./helpers";

beforeAll(installDomParser);

const WMTS = () => fixture("geoserver-wmts-capabilities.xml");
const WMS = () => fixture("geoserver-wms-capabilities.xml");
const BASE = "http://localhost:8095/geoserver";
const AIDEDEX = [
	"spain:atlas_openfield_aidedex_v1_crop",
	"spain:atlas_road_aidedex_v1",
	"Sweden:T1_AIDEDEX",
];

const settings = (
	over: Partial<GeoServerSettings> = {},
): GeoServerSettings => ({
	...geoserverProvider.data,
	...over,
});

describe("WMTS capabilities (GeoServer 2.27.1)", () => {
	it("reads the three aidedex layers with their WGS84 bounds and the 900913 gridset", () => {
		const layers = parseWmtsCapabilities(WMTS());
		const byId = new Map(layers.map((l) => [l.id, l]));
		expect(byId.get("spain:atlas_road_aidedex_v1")?.bounds).toEqual([
			-3.1735870761, 38.1379515783844, -3.17129735636, 38.1389010390831,
		]);
		expect(
			byId.get("spain:atlas_openfield_aidedex_v1_crop")?.bounds,
		).toEqual([-3.175198013, 38.138152901, -3.174003713, 38.138745708]);
		expect(byId.get("Sweden:T1_AIDEDEX")?.bounds).toEqual([
			17.81805617452983, 59.0755129008352, 17.82060976412126,
			59.07818323437433,
		]);
		for (const id of AIDEDEX) {
			expect(byId.get(id)?.mercator).toEqual({
				matrixSet: "EPSG:900913",
				minzoom: 0,
				maxzoom: 30,
				tileSize: 256,
			});
			expect(byId.get(id)?.formats).toEqual(["image/png", "image/jpeg"]);
		}
	});

	it("ignores the EPSG:4326 gridset: a layer linking only it has no Web Mercator set", () => {
		const only4326 = WMTS().replace(
			/<TileMatrixSetLink>\s*<TileMatrixSet>EPSG:900913<\/TileMatrixSet>[\s\S]*?<\/TileMatrixSetLink>/g,
			"",
		);
		const layers = parseWmtsCapabilities(only4326);
		expect(layers.length).toBeGreaterThan(0);
		expect(layers.every((l) => l.mercator === undefined)).toBe(true);
	});

	it("refuses a document that is not WMTS capabilities", () => {
		expect(() => parseWmtsCapabilities(WMS())).toThrow();
		expect(() =>
			parseWmtsCapabilities("<html><body>Login</body>"),
		).toThrow();
	});
});

describe("WMS capabilities (GeoServer 2.27.1)", () => {
	it("inherits the root layer's EPSG:3857 and reads each layer's bounds", () => {
		const caps = parseWmsCapabilities(WMS());
		expect(caps.version).toBe("1.3.0");
		const sweden = caps.layers.find((l) => l.name === "Sweden:T1_AIDEDEX");
		expect(sweden).toEqual({
			name: "Sweden:T1_AIDEDEX",
			title: "T1_AIDEDEX",
			bounds: [
				17.81805617452983, 59.0755129008352, 17.82060976412126,
				59.07818323437433,
			],
			webMercator: true,
			mercatorCrs: "EPSG:3857",
		});
		// The unnamed root layer is not requestable and is not listed.
		expect(caps.layers.map((l) => l.name)).not.toContain(
			"GeoServer Web Map Service",
		);
	});
});

describe("workspace filter", () => {
	it("matches the ws: prefix case-insensitively and drops unprefixed layer groups", () => {
		expect(inWorkspaces("spain:atlas_road_aidedex_v1", ["spain"])).toBe(
			true,
		);
		expect(inWorkspaces("Sweden:T1_AIDEDEX", ["sweden"])).toBe(true);
		expect(inWorkspaces("nurc:Pk50095", ["spain", "Sweden"])).toBe(false);
		expect(inWorkspaces("spearfish", ["spain"])).toBe(false);
		expect(inWorkspaces("spearfish", [])).toBe(true);
		expect(inWorkspaces("nurc:Pk50095", [" ", ""])).toBe(true);
	});

	it("removes the demo layers from the catalogue", () => {
		const all = buildGeoServerCatalog(
			parseWmtsCapabilities(WMTS()),
			parseWmsCapabilities(WMS()),
			settings(),
		);
		expect(all.map((e) => e.id)).toEqual(
			expect.arrayContaining([
				"nurc:Pk50095",
				"topp:states",
				"spearfish",
				...AIDEDEX,
			]),
		);
		const filtered = buildGeoServerCatalog(
			parseWmtsCapabilities(WMTS()),
			parseWmsCapabilities(WMS()),
			settings({ workspaces: ["spain", "Sweden"] }),
		);
		expect(filtered.map((e) => e.id).sort()).toEqual([...AIDEDEX].sort());
	});
});

describe("tile templates", () => {
	const catalog = () =>
		buildGeoServerCatalog(
			parseWmtsCapabilities(WMTS()),
			parseWmsCapabilities(WMS()),
			settings({ workspaces: ["spain", "Sweden"] }),
		);

	it("draws a cached layer from the WMTS REST template, TileRow {y} then TileCol {x}", () => {
		const road = catalog().find(
			(e) => e.id === "spain:atlas_road_aidedex_v1",
		);
		expect(road).toMatchObject({
			webMercator: true,
			minzoom: 0,
			maxzoom: 30,
			tileSize: 256,
		});
		expect(geoserverProvider.toSource(road!, settings())).toEqual({
			type: "raster",
			tileSize: 256,
			tiles: [
				"http://localhost:8095/geoserver/gwc/service/wmts/rest/spain:atlas_road_aidedex_v1/EPSG:900913/EPSG:900913:{z}/{y}/{x}?format=image/png",
			],
		});
	});

	it("tolerates a trailing slash on the base URL", () => {
		const road = catalog().find(
			(e) => e.id === "spain:atlas_road_aidedex_v1",
		)!;
		expect(
			geoserverProvider.toSource(road, settings({ url: `${BASE}/` }))
				.tiles?.[0],
		).toStartWith(`${BASE}/gwc/service/wmts/rest/`);
	});

	it("falls back to WMS GetMap with {bbox-epsg-3857} for a layer GeoWebCache does not cache", () => {
		const wmts = parseWmtsCapabilities(WMTS()).filter(
			(l) => l.id !== "Sweden:T1_AIDEDEX",
		);
		const entries = buildGeoServerCatalog(
			wmts,
			parseWmsCapabilities(WMS()),
			settings({ workspaces: ["Sweden"] }),
		);
		expect(entries).toHaveLength(1);
		const sweden = entries[0]!;
		expect(sweden).toMatchObject({
			webMercator: true,
			tileSize: 256,
			params: { mode: "wms", crs: "EPSG:3857" },
		});
		expect(sweden.maxzoom).toBeUndefined();
		expect(geoserverProvider.toSource(sweden, settings()).tiles).toEqual([
			"http://localhost:8095/geoserver/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Sweden%3AT1_AIDEDEX&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&CRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}",
		]);
	});

	it("draws every layer through WMS when preferWms is set", () => {
		const entries = buildGeoServerCatalog(
			parseWmtsCapabilities(WMTS()),
			parseWmsCapabilities(WMS()),
			settings({ workspaces: ["spain"], preferWms: true }),
		);
		expect(entries.map((e) => e.params.mode)).toEqual(["wms", "wms"]);
	});

	it("lists a layer offered in no Web Mercator CRS as not Web Mercator", () => {
		const wms = parseWmsCapabilities(
			`<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms"><Capability><Layer><CRS>EPSG:4326</CRS>
			<Layer><Name>utm:only</Name><Title>UTM only</Title><CRS>EPSG:32633</CRS></Layer></Layer></Capability></WMS_Capabilities>`,
		);
		expect(buildGeoServerCatalog(null, wms, settings())).toEqual([
			{
				id: "utm:only",
				title: "UTM only (utm)",
				bounds: undefined,
				tileSize: 256,
				webMercator: false,
				params: {},
			},
		]);
	});

	it("names the workspace in the title, so same-named layers stay distinct", () => {
		const wms = parseWmsCapabilities(
			`<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms"><Capability><Layer><CRS>EPSG:3857</CRS>
			<Layer><Name>spain:roads</Name><Title>Roads</Title></Layer>
			<Layer><Name>sweden:roads</Name><Title>Roads</Title></Layer>
			<Layer><Name>bare</Name><Title>Bare</Title></Layer></Layer></Capability></WMS_Capabilities>`,
		);
		expect(
			buildGeoServerCatalog(null, wms, settings()).map((e) => e.title),
		).toEqual(["Roads (spain)", "Roads (sweden)", "Bare"]);
		expect(titleWithWorkspace("spain:roads", "spain:roads")).toBe(
			"spain:roads",
		);
	});

	it("never puts a credential in params or a template", () => {
		const auth = { kind: "query-token" as const, token: "s3cret" };
		for (const entry of catalog()) {
			expect(JSON.stringify(entry)).not.toContain("s3cret");
			expect(
				JSON.stringify(
					geoserverProvider.toSource(entry, settings({ auth })),
				),
			).not.toContain("s3cret");
		}
	});
});

describe("discover", () => {
	const okRoutes = () => ({
		"/gwc/service/wmts": xml(WMTS()),
		"/ows?": xml(WMS()),
	});

	it("reads WMTS then WMS from the base URL", async () => {
		const ctx = routedContext(okRoutes());
		const result = await geoserverProvider.discover(
			settings({ workspaces: ["spain", "Sweden"] }),
			ctx,
		);
		expect(ctx.requested).toEqual([
			`${BASE}/gwc/service/wmts?REQUEST=GetCapabilities`,
			`${BASE}/ows?service=WMS&version=1.3.0&request=GetCapabilities`,
		]);
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;
		expect(result.layers.map((l) => l.id).sort()).toEqual(
			[...AIDEDEX].sort(),
		);
		expect(result.layers.every((l) => l.params.mode === "wmts")).toBe(true);
	});

	it("falls back to WMS alone when GeoWebCache answers 404", async () => {
		const ctx = routedContext({
			"/gwc/": new Response("", { status: 404 }),
			"/ows?": xml(WMS()),
		});
		const result = await geoserverProvider.discover(
			settings({ workspaces: ["spain"] }),
			ctx,
		);
		expect(
			result.status === "ok" && result.layers.map((l) => l.params.mode),
		).toEqual(["wms", "wms"]);
	});

	it("uses WMTS alone when WMS fails", async () => {
		const ctx = routedContext({
			"/gwc/": xml(WMTS()),
			"/ows?": new Response("", { status: 500 }),
		});
		const result = await geoserverProvider.discover(
			settings({ workspaces: ["Sweden"] }),
			ctx,
		);
		expect(
			result.status === "ok" && result.layers.map((l) => l.id),
		).toEqual(["Sweden:T1_AIDEDEX"]);
	});

	it("skips WMTS when preferWms is set", async () => {
		const ctx = routedContext(okRoutes());
		await geoserverProvider.discover(settings({ preferWms: true }), ctx);
		expect(ctx.requested).toHaveLength(1);
		expect(ctx.requested[0]).toContain("/ows?service=WMS");
	});

	it("maps 401 and 403 to unauthorized without trying the second document", async () => {
		for (const status of [401, 403]) {
			const ctx = routedContext({
				"/gwc/": new Response("", { status }),
				"/ows?": xml(WMS()),
			});
			expect(await geoserverProvider.discover(settings(), ctx)).toEqual({
				status: "error",
				reason: "unauthorized",
				detail: `HTTP ${status}`,
			});
			expect(ctx.requested).toHaveLength(1);
		}
	});

	it("maps a rejected fetch to cors when an opaque probe gets an answer", async () => {
		const ctx = routedContext({ "/gwc/": "reject", "/ows?": "reject" });
		const result = await withProbe(true, () =>
			geoserverProvider.discover(settings(), ctx),
		);
		expect(result).toMatchObject({ status: "error", reason: "cors" });
	});

	it("maps a rejected fetch to unreachable when the probe gets no answer either", async () => {
		const ctx = routedContext({ "/gwc/": "reject", "/ows?": "reject" });
		const result = await withProbe(false, () =>
			geoserverProvider.discover(settings(), ctx),
		);
		expect(result).toMatchObject({
			status: "error",
			reason: "unreachable",
		});
	});

	it("maps unparsable answers to not-a-server", async () => {
		const ctx = routedContext({
			"/gwc/": xml("<html><body>"),
			"/ows?": xml("<<not xml"),
		});
		const result = await geoserverProvider.discover(settings(), ctx);
		expect(result).toMatchObject({
			status: "error",
			reason: "not-a-server",
		});
	});

	it("maps a well-formed page that is not capabilities to not-a-server", async () => {
		const ctx = routedContext({
			"/gwc/": xml("<html/>"),
			"/ows?": xml("<html/>"),
		});
		expect(await geoserverProvider.discover(settings(), ctx)).toMatchObject(
			{ reason: "not-a-server" },
		);
	});

	it("re-throws an abort instead of reporting a failure", async () => {
		const ctx = routedContext({});
		ctx.fetch = async () => {
			throw new DOMException("aborted", "AbortError");
		};
		await expect(
			geoserverProvider.discover(settings(), ctx),
		).rejects.toThrow("aborted");
	});
});

describe("mixed-content pre-check", () => {
	it("blocks a non-loopback http: URL from an https: page only", () => {
		expect(
			checkInsecure("http://10.0.0.5:8080/geoserver", "https:"),
		).toMatchObject({ reason: "blocked-insecure" });
		expect(
			checkInsecure("http://10.0.0.5:8080/geoserver", "http:"),
		).toBeUndefined();
		expect(
			checkInsecure("https://maps.example.org/geoserver", "https:"),
		).toBeUndefined();
		expect(
			checkInsecure("http://localhost:8095/geoserver", "https:"),
		).toBeUndefined();
		expect(
			checkInsecure("http://127.0.0.1:8095/geoserver", "https:"),
		).toBeUndefined();
		expect(
			checkInsecure("http://[::1]:8095/geoserver", "https:"),
		).toBeUndefined();
	});

	it("treats localhost, *.localhost, 127/8 and ::1 as loopback", () => {
		expect(
			["localhost", "maps.localhost", "127.4.5.6", "[::1]"].every(
				isLoopbackHost,
			),
		).toBe(true);
		expect(
			["10.0.0.1", "localhost.example.org", "128.0.0.1"].some(
				isLoopbackHost,
			),
		).toBe(false);
	});

	it("is applied by discover before any request", async () => {
		const g = globalThis as { location?: unknown };
		const original = g.location;
		g.location = { protocol: "https:" };
		try {
			const ctx = routedContext(okRoutesForPrecheck());
			const result = await geoserverProvider.discover(
				settings({ url: "http://192.168.1.20:8080/geoserver" }),
				ctx,
			);
			expect(result).toMatchObject({
				status: "error",
				reason: "blocked-insecure",
			});
			expect(ctx.requested).toEqual([]);
		} finally {
			g.location = original;
		}
	});
});

function okRoutesForPrecheck() {
	return { "/gwc/": xml(WMTS()), "/ows?": xml(WMS()) };
}

describe("catalogue envelope", () => {
	it("stays inside the stored-catalogue limits, with no credential-like params key", () => {
		const entries = buildGeoServerCatalog(
			parseWmtsCapabilities(WMTS()),
			parseWmsCapabilities(WMS()),
			settings(),
		);
		const secretLike =
			/pass(word)?|secret|token|authkey|api[-_]?key|credential/i;
		for (const e of entries) {
			expect(e.id.length).toBeLessThanOrEqual(512);
			expect(e.title.length).toBeLessThanOrEqual(512);
			expect([256, 512]).toContain(e.tileSize);
			for (const z of [e.minzoom, e.maxzoom])
				if (z !== undefined) expect(z).toBeWithin(0, 33);
			expect(Object.keys(e.params).length).toBeLessThanOrEqual(32);
			for (const [k, v] of Object.entries(e.params)) {
				expect(k).not.toMatch(secretLike);
				expect(v.length).toBeLessThanOrEqual(2048);
			}
		}
	});
});
