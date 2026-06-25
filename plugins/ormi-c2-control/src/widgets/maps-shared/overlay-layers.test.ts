import { describe, expect, it } from "bun:test";

import { MAP_OVERLAYS, overlayById, resolveOverlays } from "./overlay-layers";

describe("MAP_OVERLAYS catalog", () => {
	it("has unique ids", () => {
		const ids = MAP_OVERLAYS.map((o) => o.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("every tile template is https with z/x/y placeholders", () => {
		for (const overlay of MAP_OVERLAYS) {
			expect(overlay.tiles.length).toBeGreaterThan(0);
			for (const tpl of overlay.tiles) {
				expect(tpl.startsWith("https://")).toBe(true);
				expect(tpl).toContain("{z}");
				expect(tpl).toContain("{x}");
				expect(tpl).toContain("{y}");
			}
		}
	});

	it("pre-expands CyclOSM subdomains (no {s} placeholder for MapLibre)", () => {
		const cyclosm = overlayById("cyclosm");
		expect(cyclosm).toBeDefined();
		expect(cyclosm?.tiles.length).toBe(3);
		for (const tpl of cyclosm?.tiles ?? []) {
			expect(tpl).not.toContain("{s}");
		}
	});
});

describe("overlayById", () => {
	it("resolves a known id and ignores unknown ones", () => {
		expect(overlayById("openseamap")?.title).toContain("OpenSeaMap");
		expect(overlayById("does-not-exist")).toBeUndefined();
	});
});

describe("resolveOverlays", () => {
	it("filters to known overlays preserving catalog order", () => {
		const resolved = resolveOverlays(["cyclosm", "openseamap", "bogus"]);
		expect(resolved.map((o) => o.id)).toEqual(["openseamap", "cyclosm"]);
	});

	it("returns empty for no matches", () => {
		expect(resolveOverlays([])).toEqual([]);
		expect(resolveOverlays(["nope"])).toEqual([]);
	});
});
