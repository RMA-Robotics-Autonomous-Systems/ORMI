import { describe, expect, it } from "bun:test";

import { geoserverProvider } from "../adapters/geoserver";
import { ogcWmsProvider } from "../adapters/ogc-wms";
import {
	credentialFreeLayerId,
	credentialQueryKeys,
	shortHash,
	slugify,
	withoutQuery,
} from "../shared/url-safety";
import { routedContext } from "./helpers";

describe("credentialQueryKeys", () => {
	it("names every credential-like query key, case-insensitively", () => {
		expect(
			credentialQueryKeys(
				"https://h/x?password=a&Secret=b&access_token=c&authkey=d&API-Key=e&key=f&X-Amz-Signature=g&credential=h&style=i",
			),
		).toEqual([
			"password",
			"Secret",
			"access_token",
			"authkey",
			"API-Key",
			"key",
			"X-Amz-Signature",
			"credential",
		]);
	});

	it("reads templates, encoded names and ignores the fragment", () => {
		expect(credentialQueryKeys("t/{z}/{x}/{y}.png?%74oken=1")).toEqual([
			"token",
		]);
		expect(credentialQueryKeys("https://h/x#?token=1")).toEqual([]);
		expect(credentialQueryKeys("https://h/x?map=/a.map&layers=b")).toEqual(
			[],
		);
		expect(credentialQueryKeys("https://h/x")).toEqual([]);
	});
});

describe("credentialFreeLayerId", () => {
	it("is a slug plus a hash of the url without its query", () => {
		const seen = new Set<string>();
		const id = credentialFreeLayerId(
			"Ortho 2024 (RGB)",
			"https://h/a.tif?v=secretish",
			seen,
		);
		expect(id).toBe(`ortho-2024-rgb-${shortHash("https://h/a.tif")}`);
		expect(id).not.toContain("secretish");
		expect(
			credentialFreeLayerId("Ortho 2024 (RGB)", "https://h/a.tif", seen),
		).toBe(`${id}-2`);
	});

	it("falls back to a fixed word when the title has no slug", () => {
		expect(credentialFreeLayerId("", "https://h/a", new Set())).toBe(
			`layer-${shortHash("https://h/a")}`,
		);
		expect(slugify("Été / ñ")).toBe("ete-n");
	});

	it("hashes deterministically", () => {
		expect(shortHash("abc")).toBe(shortHash("abc"));
		expect(shortHash("abc")).not.toBe(shortHash("abd"));
		expect(shortHash("abc")).toHaveLength(7);
		expect(withoutQuery(" https://h/a?b#c ")).toBe("https://h/a");
	});
});

describe("server url refusal", () => {
	it("refuses a WMS or GeoServer url carrying a credential before any request", async () => {
		for (const provider of [ogcWmsProvider, geoserverProvider]) {
			const ctx = routedContext({});
			const result = await provider.discover(
				{
					...provider.data,
					url: "https://h/geoserver?authkey=abc123",
				} as never,
				ctx,
			);
			expect(result).toMatchObject({
				status: "error",
				reason: "not-a-server",
			});
			expect(JSON.stringify(result)).not.toContain("abc123");
			expect(ctx.requested).toEqual([]);
		}
	});
});
