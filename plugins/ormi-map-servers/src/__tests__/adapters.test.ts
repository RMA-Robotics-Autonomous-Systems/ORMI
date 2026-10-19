import { beforeAll, describe, expect, it } from "bun:test";

import {
	createAuthedFetch,
	resolveMapServerAuth,
} from "@workspace/ormi-core/map-layers/model";

import { ogcWmsProvider } from "../adapters/ogc-wms";
import {
	titilerProvider,
	titilerTileJsonUrl,
	type TitilerSettings,
} from "../adapters/titiler";
import {
	expandSubdomains,
	PUBLIC_OVERLAYS_PRESET,
	xyzProvider,
	type XyzSettings,
} from "../adapters/xyz";
import MapLayerProvidersExport, { mapLayerProviders } from "../export";
import { shortHash } from "../shared/url-safety";
import {
	fixture,
	installDomParser,
	routedContext,
	withProbe,
	xml,
} from "./helpers";

beforeAll(installDomParser);

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

describe("titiler", () => {
	const base = "http://localhost:8000";
	const cog = {
		title: "Ortho",
		url: "https://data.example.org/ortho.tif",
		rescale: "0,255",
		colormap: "viridis",
	};
	const settings = (
		over: Partial<TitilerSettings> = {},
	): TitilerSettings => ({
		...titilerProvider.data,
		cogs: [cog],
		...over,
	});

	it("reads bounds and zooms from each COG's TileJSON", async () => {
		const ctx = routedContext({
			"/cog/WebMercatorQuad/tilejson.json": json({
				tilejson: "2.2.0",
				tiles: [
					`${base}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url=x&access_token=leaked`,
				],
				bounds: [-3.18, 38.13, -3.17, 38.14],
				minzoom: 14,
				maxzoom: 21,
			}),
		});
		const result = await titilerProvider.discover(settings(), ctx);
		expect(ctx.requested).toEqual([
			`${base}/cog/WebMercatorQuad/tilejson.json?url=https%3A%2F%2Fdata.example.org%2Fortho.tif&rescale=0%2C255&colormap_name=viridis`,
		]);
		expect(result).toEqual({
			status: "ok",
			layers: [
				{
					id: `ortho-${shortHash(cog.url)}`,
					title: "Ortho",
					bounds: [-3.18, 38.13, -3.17, 38.14],
					minzoom: 14,
					maxzoom: 21,
					tileSize: 256,
					webMercator: true,
					params: {
						cog: cog.url,
						rescale: "0,255",
						colormap: "viridis",
					},
				},
			],
		});
	});

	it("builds its own tile template, so a token TiTiler echoes never reaches the catalogue", async () => {
		const ctx = routedContext({
			"tilejson.json": json({
				tiles: ["http://x/{z}/{x}/{y}?access_token=leaked"],
				bounds: [0, 0, 1, 1],
			}),
		});
		const result = await titilerProvider.discover(settings(), ctx);
		expect(JSON.stringify(result)).not.toContain("leaked");
		if (result.status !== "ok") throw new Error("expected ok");
		const source = titilerProvider.toSource(result.layers[0]!, settings());
		expect(source.tiles).toEqual([
			`${base}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url=https%3A%2F%2Fdata.example.org%2Fortho.tif&rescale=0%2C255&colormap_name=viridis`,
		]);
	});

	it("applies an access_token through the context only", async () => {
		const seen: string[] = [];
		const resolved = resolveMapServerAuth(
			{ kind: "query-token", token: "tok" },
			titilerProvider.auth,
		);
		const fetchImpl = (async (url: string) => {
			seen.push(url);
			return json({ tiles: [], bounds: [0, 0, 1, 1] });
		}) as unknown as typeof fetch;
		const ctx = {
			signal: new AbortController().signal,
			fetch: createAuthedFetch(
				resolved,
				base,
				new AbortController().signal,
				fetchImpl,
			),
		};
		await titilerProvider.discover(
			settings({ cogs: [{ title: "A", url: "https://a/a.tif" }] }),
			ctx,
		);
		expect(seen[0]).toEndWith("&access_token=tok");
	});

	it("keeps a COG the server cannot read, without bounds, while another one reads", async () => {
		let n = 0;
		const ctx = routedContext({
			"tilejson.json": () =>
				n++ === 0
					? new Response("", { status: 500 })
					: json({ tiles: [], bounds: [1, 2, 3, 4] }),
		});
		const result = await titilerProvider.discover(
			settings({
				cogs: [
					{ title: "Broken", url: "https://a/broken.tif" },
					{ title: "Good", url: "https://a/good.tif" },
				],
			}),
			ctx,
		);
		expect(
			result.status === "ok" &&
				result.layers.map((l) => [l.title, l.bounds]),
		).toEqual([
			["Broken", undefined],
			["Good", [1, 2, 3, 4]],
		]);
	});

	it("fails when every COG fails, and on 401 at once", async () => {
		expect(
			await titilerProvider.discover(
				settings(),
				routedContext({ "tilejson.json": xml("<html/>") }),
			),
		).toMatchObject({
			status: "error",
			reason: "not-a-server",
		});
		expect(
			await titilerProvider.discover(
				settings(),
				routedContext({
					"tilejson.json": new Response("", { status: 401 }),
				}),
			),
		).toMatchObject({ reason: "unauthorized" });
		const unreachable = await withProbe(false, () =>
			titilerProvider.discover(
				settings(),
				routedContext({ "tilejson.json": "reject" }),
			),
		);
		expect(unreachable).toMatchObject({ reason: "unreachable" });
	});

	it("gives duplicate COG urls distinct ids", async () => {
		const ctx = routedContext({ "tilejson.json": json({ tiles: [] }) });
		const result = await titilerProvider.discover(
			settings({ cogs: [cog, { ...cog, rescale: "0,100" }] }),
			ctx,
		);
		expect(
			result.status === "ok" && result.layers.map((l) => l.id),
		).toEqual([
			`ortho-${shortHash(cog.url)}`,
			`ortho-${shortHash(cog.url)}-2`,
		]);
	});

	it("encodes every COG option in the TileJSON url", () => {
		expect(
			titilerTileJsonUrl(`${base}/`, {
				title: "t",
				url: " https://a/b c.tif ",
			}),
		).toBe(
			`${base}/cog/WebMercatorQuad/tilejson.json?url=https%3A%2F%2Fa%2Fb%20c.tif`,
		);
	});
	it("refuses a COG url or server url whose query carries a credential", async () => {
		for (const over of [
			{
				cogs: [
					{
						title: "Signed",
						url: "https://bucket.s3/a.tif?X-Amz-Signature=abc",
					},
				],
			},
			{ url: `${base}/?access_token=abc` },
		]) {
			const ctx = routedContext({});
			const result = await titilerProvider.discover(settings(over), ctx);
			expect(result).toMatchObject({
				status: "error",
				reason: "not-a-server",
			});
			if (result.status === "error")
				expect(result.detail).toContain("Authentication field");
			expect(JSON.stringify(result)).not.toContain("abc");
			expect(ctx.requested).toEqual([]);
		}
	});

	it("never puts the COG url's query in a layer id", async () => {
		const ctx = routedContext({ "tilejson.json": json({ tiles: [] }) });
		const result = await titilerProvider.discover(
			settings({
				cogs: [{ title: "Ortho", url: "https://a/b.tif?v=2" }],
			}),
			ctx,
		);
		if (result.status !== "ok") throw new Error("expected ok");
		expect(result.layers[0]!.id).toBe(
			`ortho-${shortHash("https://a/b.tif")}`,
		);
		expect(result.layers[0]!.id).not.toContain("?");
	});
});

describe("xyz", () => {
	it("refuses a template whose query carries a credential", async () => {
		for (const template of [
			"https://t/{z}/{x}/{y}.png?key=secret1",
			"https://t/{z}/{x}/{y}.png?api_key=secret1",
			"rel/{z}/{x}/{y}.png?style=a&Token=secret1",
		]) {
			const result = await xyzProvider.discover(
				{ url: "https://t", layers: [{ title: "L", template }] },
				routedContext({}),
			);
			expect(result).toMatchObject({
				status: "error",
				reason: "not-a-server",
			});
			expect(JSON.stringify(result)).not.toContain("secret1");
		}
	});

	it("keeps a template's harmless query, and its id stays credential-free and stable", async () => {
		const settings: XyzSettings = {
			url: "https://t",
			layers: [
				{
					title: "Hillshade",
					template: "https://t/{z}/{x}/{y}.png?style=a",
				},
				{
					title: "Hillshade",
					template: "https://t/{z}/{x}/{y}.png?style=b",
				},
			],
		};
		const first = await xyzProvider.discover(settings, routedContext({}));
		const again = await xyzProvider.discover(settings, routedContext({}));
		if (first.status !== "ok") throw new Error("expected ok");
		const hash = shortHash("https://t/{z}/{x}/{y}.png");
		expect(first.layers.map((l) => l.id)).toEqual([
			`hillshade-${hash}`,
			`hillshade-${hash}-2`,
		]);
		expect(again).toEqual(first);
		expect(first.layers[1]!.params.template).toBe(
			"https://t/{z}/{x}/{y}.png?style=b",
		);
	});

	it("echoes its layers as the catalogue", async () => {
		const settings: XyzSettings = {
			url: "https://tiles.example.org",
			auth: { kind: "none" },
			layers: [
				{
					title: "Roads",
					template: "https://tiles.example.org/roads/{z}/{x}/{y}.png",
					maxzoom: 19,
					bounds: [1, 2, 3, 4],
				},
				{ title: "Relative", template: "rel/{z}/{x}/{y}.png" },
			],
		};
		const result = await xyzProvider.discover(settings, routedContext({}));
		if (result.status !== "ok") throw new Error("expected ok");
		expect(result.layers[0]).toEqual({
			id: `roads-${shortHash("https://tiles.example.org/roads/{z}/{x}/{y}.png")}`,
			title: "Roads",
			bounds: [1, 2, 3, 4],
			minzoom: undefined,
			maxzoom: 19,
			tileSize: 256,
			webMercator: true,
			params: {
				template: "https://tiles.example.org/roads/{z}/{x}/{y}.png",
			},
		});
		expect(xyzProvider.toSource(result.layers[1]!, settings).tiles).toEqual(
			["https://tiles.example.org/rel/{z}/{x}/{y}.png"],
		);
	});

	it("refuses a template missing a placeholder", async () => {
		const result = await xyzProvider.discover(
			{
				url: "https://t",
				layers: [{ title: "Bad", template: "https://t/{z}/{x}.png" }],
			},
			routedContext({}),
		);
		expect(result).toMatchObject({
			status: "error",
			reason: "not-a-server",
		});
	});

	it("expands {a-c} into one template per subdomain", () => {
		expect(expandSubdomains("https://{a-c}.t/{z}/{x}/{y}.png")).toEqual([
			"https://a.t/{z}/{x}/{y}.png",
			"https://b.t/{z}/{x}/{y}.png",
			"https://c.t/{z}/{x}/{y}.png",
		]);
		expect(expandSubdomains("https://t/{z}/{x}/{y}.png")).toEqual([
			"https://t/{z}/{x}/{y}.png",
		]);
	});

	it("ships the public overlays as a preset with C2's four overlays", async () => {
		expect(xyzProvider.presets).toEqual([PUBLIC_OVERLAYS_PRESET]);
		expect(PUBLIC_OVERLAYS_PRESET).toMatchObject({
			id: "public-overlays",
			title: "Public overlays",
		});
		const settings = PUBLIC_OVERLAYS_PRESET.settings as XyzSettings;
		const result = await xyzProvider.discover(settings, routedContext({}));
		if (result.status !== "ok") throw new Error("expected ok");
		expect(
			result.layers.map((l) => [
				l.title,
				xyzProvider.toSource(l, settings).tiles,
			]),
		).toEqual([
			[
				"OpenSeaMap (seamarks)",
				["https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"],
			],
			[
				"OpenRailwayMap",
				["https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"],
			],
			[
				"Waymarked Trails (hiking)",
				["https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png"],
			],
			[
				"CyclOSM",
				["a", "b", "c"].map(
					(s) =>
						`https://${s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`,
				),
			],
		]);
		expect(result.layers.every((l) => l.params.attribution)).toBe(true);
	});
});

describe("ogc-wms", () => {
	it("keeps the endpoint's own query on capabilities and GetMap", async () => {
		const endpoint =
			"https://maps.example.org/cgi-bin/mapserv?map=/srv/site.map";
		const ctx = routedContext({
			"REQUEST=GetCapabilities": xml(
				fixture("geoserver-wms-capabilities.xml"),
			),
		});
		const settings = { ...ogcWmsProvider.data, url: endpoint };
		const result = await ogcWmsProvider.discover(settings, ctx);
		expect(ctx.requested).toEqual([
			`${endpoint}&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`,
		]);
		if (result.status !== "ok") throw new Error("expected ok");
		const road = result.layers.find(
			(l) => l.id === "spain:atlas_road_aidedex_v1",
		)!;
		expect(road).toMatchObject({
			webMercator: true,
			bounds: [
				-3.1735870761, 38.1379515783844, -3.17129735636,
				38.1389010390831,
			],
		});
		expect(ogcWmsProvider.toSource(road, settings).tiles?.[0]).toBe(
			`${endpoint}&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=spain%3Aatlas_road_aidedex_v1&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&CRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
		);
	});

	it("maps an HTML login page to not-a-server", async () => {
		const ctx = routedContext({
			GetCapabilities: xml("<html><body>Sign in</body></html>"),
		});
		expect(
			await ogcWmsProvider.discover(
				{ ...ogcWmsProvider.data, url: "https://m/wms" },
				ctx,
			),
		).toMatchObject({
			reason: "not-a-server",
		});
	});
});

describe("definitions", () => {
	it("are valid on open: every required key has a value in data", () => {
		for (const p of mapLayerProviders) {
			const required =
				(p.schema as { required?: string[] }).required ?? [];
			for (const key of required)
				expect(
					p.data as unknown as Record<string, unknown>,
				).toHaveProperty(key);
			const props = (
				p.schema as {
					properties: Record<string, { default?: unknown }>;
				}
			).properties;
			for (const [key, value] of Object.entries(p.data)) {
				expect(props).toHaveProperty(key);
				if (key !== "auth") expect(props[key]?.default).toEqual(value);
			}
		}
	});

	it("declare auth starting with none and keep auth out of the summary", () => {
		for (const p of mapLayerProviders) {
			expect(p.auth.kinds[0]).toBe("none");
			expect(p.summaryProps ?? []).not.toContain("auth");
			for (const key of p.summaryProps ?? [])
				expect(p.data).toHaveProperty(key);
		}
	});

	it("have unique ids, and the export filter appends each once", () => {
		const ids = mapLayerProviders.map((p) => p.id);
		expect(ids).toEqual(["geoserver", "ogc-wms", "titiler", "xyz"]);
		const list = MapLayerProvidersExport(MapLayerProvidersExport([]));
		expect(list.map((p) => p.id)).toEqual(ids);
	});

	it("declare the plan's auth kinds", () => {
		const kinds = Object.fromEntries(
			mapLayerProviders.map((p) => [
				p.id,
				[p.auth.kinds, p.auth.queryParam],
			]),
		);
		expect(kinds).toEqual({
			geoserver: [["none", "basic", "query-token"], "authkey"],
			"ogc-wms": [["none", "basic"], undefined],
			titiler: [["none", "bearer", "query-token"], "access_token"],
			xyz: [["none", "query-token", "header"], undefined],
		});
	});
});
