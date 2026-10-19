import { describe, expect, it } from "bun:test";

import type {
	MapLayerEntry,
	MapLayerProviderDefinition,
	MapServerSettings,
} from "@workspace/ormi-core/map-layers/model";

import { testMapServerConnection } from "../connection-test";

const LAYER: MapLayerEntry = {
	id: "a",
	title: "A",
	tileSize: 256,
	webMercator: true,
	params: {},
};

function provider(
	layers: MapLayerEntry[] | "throws",
	tile = "https://srv.example/{z}/{x}/{y}.png",
): MapLayerProviderDefinition {
	return {
		id: "fake",
		name: "Fake",
		schema: { type: "object" },
		data: { url: "" },
		auth: { kinds: ["none", "bearer", "query-token"], queryParam: "key" },
		async discover(_settings, ctx) {
			if (layers === "throws") throw new Error("boom");
			await ctx.fetch("https://srv.example/caps");
			return { status: "ok", layers };
		},
		toSource: () => ({
			type: "raster",
			tiles: [tile],
		}),
	};
}

interface Call {
	url: string;
	init?: RequestInit;
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
	const calls: Call[] = [];
	const impl = (async (url: string, init?: RequestInit) => {
		const call = { url: String(url), init };
		calls.push(call);
		return respond(call);
	}) as unknown as typeof fetch;
	return { impl, calls };
}

const settings = {
	url: "https://srv.example",
	auth: { kind: "bearer", token: "tok" },
} as MapServerSettings;

describe("testMapServerConnection", () => {
	it("counts layers and fetches one tile with auth applied", async () => {
		const { impl, calls } = fakeFetch(() => new Response("ok"));
		const outcome = await testMapServerConnection(
			provider([LAYER, { ...LAYER, id: "b", webMercator: false }]),
			settings,
			new AbortController().signal,
			impl,
		);
		expect(outcome.result).toEqual({
			status: "ok",
			layerCount: 2,
			notWebMercator: 1,
			tile: { status: "ok" },
		});
		expect(outcome.layers?.length).toBe(2);
		const tile = calls.find((call) => call.url.endsWith(".png"));
		expect(tile?.url).toBe("https://srv.example/0/0/0.png");
		expect(
			(tile?.init?.headers as Record<string, string>).Authorization,
		).toBe("Bearer tok");
	});

	it("puts a query token on the tile, never on the CORS probe", async () => {
		const { impl, calls } = fakeFetch((call) => {
			if (call.url.endsWith("/caps?key=q")) return new Response("ok");
			if (call.init?.mode === "no-cors") return new Response(null);
			throw new TypeError("Failed to fetch");
		});
		const outcome = await testMapServerConnection(
			provider([LAYER]),
			{
				url: "https://srv.example",
				auth: { kind: "query-token", token: "q" },
			} as MapServerSettings,
			new AbortController().signal,
			impl,
		);
		expect(outcome.result).toMatchObject({
			status: "ok",
			tile: { status: "error", reason: "cors" },
		});
		const probe = calls.find((call) => call.init?.mode === "no-cors");
		expect(probe?.url).toBe("https://srv.example/0/0/0.png");
		expect(probe?.init?.headers).toBeUndefined();
	});

	it("sends no auth to a tile outside the server prefix", async () => {
		for (const auth of [
			{ kind: "bearer", token: "tok" },
			{ kind: "query-token", token: "q" },
		]) {
			const { impl, calls } = fakeFetch(() => new Response("ok"));
			await testMapServerConnection(
				provider([LAYER], "https://cdn.other.example/{z}/{x}/{y}.png"),
				{ url: "https://srv.example", auth } as MapServerSettings,
				new AbortController().signal,
				impl,
			);
			const tile = calls.find((call) => call.url.endsWith(".png"));
			expect(tile?.url).toBe("https://cdn.other.example/0/0/0.png");
			expect(tile?.init?.headers).toBeUndefined();
			const caps = calls.find((call) => call.url.includes("/caps"));
			expect(JSON.stringify(caps)).toMatch(/tok|key=q/);
		}
	});

	it("reports a refused tile as unauthorized", async () => {
		const { impl } = fakeFetch((call) =>
			call.url.endsWith(".png")
				? new Response(null, { status: 401 })
				: new Response("ok"),
		);
		const outcome = await testMapServerConnection(
			provider([LAYER]),
			settings,
			new AbortController().signal,
			impl,
		);
		expect(outcome.result).toMatchObject({
			tile: { status: "error", reason: "unauthorized", httpStatus: 401 },
		});
	});

	it("reports an unreachable tile host", async () => {
		const { impl } = fakeFetch((call) => {
			if (call.url.endsWith("/caps")) return new Response("ok");
			throw new TypeError("Failed to fetch");
		});
		const outcome = await testMapServerConnection(
			provider([LAYER]),
			settings,
			new AbortController().signal,
			impl,
		);
		expect(outcome.result).toMatchObject({
			tile: { status: "error", reason: "unreachable" },
		});
	});

	it("skips the tile when no layer is in Web Mercator", async () => {
		const { impl, calls } = fakeFetch(() => new Response("ok"));
		const outcome = await testMapServerConnection(
			provider([{ ...LAYER, webMercator: false }]),
			settings,
			new AbortController().signal,
			impl,
		);
		expect(outcome.result).toMatchObject({ tile: { status: "skipped" } });
		expect(calls.some((call) => call.url.endsWith(".png"))).toBe(false);
	});

	it("maps an adapter that throws to unreachable", async () => {
		const { impl } = fakeFetch(() => new Response("ok"));
		const outcome = await testMapServerConnection(
			provider("throws"),
			settings,
			new AbortController().signal,
			impl,
		);
		expect(outcome.result).toMatchObject({
			status: "error",
			reason: "unreachable",
		});
		expect(outcome.layers).toBeUndefined();
	});

	it("re-throws an abort", async () => {
		const controller = new AbortController();
		const { impl } = fakeFetch(() => {
			controller.abort();
			throw new DOMException("aborted", "AbortError");
		});
		await expect(
			testMapServerConnection(
				provider([LAYER]),
				settings,
				controller.signal,
				impl,
			),
		).rejects.toMatchObject({ name: "AbortError" });
	});
});
