import { describe, test, expect } from "bun:test";
import {
	BASEMAP_PROVIDERS,
	BASEMAPS_REQUIRING_KEY,
	applyBasemapKey,
	basemapOneOf,
} from "../basemap-providers";

const CARTO =
	"https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png";
const STADIA_DARK =
	"https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png";
const STADIA_SATELLITE =
	"https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

describe("applyBasemapKey", () => {
	test("appends Carto's `key` parameter", () => {
		expect(applyBasemapKey(CARTO, "abc123")).toBe(`${CARTO}?key=abc123`);
	});

	test("appends Stadia's `api_key` parameter, not `key`", () => {
		const result = applyBasemapKey(STADIA_DARK, "abc123");
		expect(result).toBe(`${STADIA_DARK}?api_key=abc123`);
		expect(result).not.toContain("?key=");
	});

	test("leaves {z}/{x}/{y} placeholders verbatim", () => {
		const result = applyBasemapKey(CARTO, "abc123");
		expect(result).toContain("/{z}/{x}/{y}.png");
		expect(result).not.toContain("%7B");
		expect(result).not.toContain("%7D");
	});

	test("returns a keyless provider untouched even when a key is given", () => {
		expect(applyBasemapKey(OSM, "abc123")).toBe(OSM);
	});

	test("an empty or whitespace key is a no-op", () => {
		expect(applyBasemapKey(CARTO)).toBe(CARTO);
		expect(applyBasemapKey(CARTO, "")).toBe(CARTO);
		expect(applyBasemapKey(CARTO, "   ")).toBe(CARTO);
	});

	test("returns an unknown url untouched", () => {
		const custom = "https://tiles.example.org/base/{z}/{x}/{y}.png";
		expect(applyBasemapKey(custom, "abc123")).toBe(custom);
	});

	test("uses `&` when the url already carries a query string", () => {
		const withQuery = `${CARTO}?style=dark`;
		expect(applyBasemapKey(withQuery, "abc123")).toBe(
			`${withQuery}&key=abc123`,
		);
	});

	test("trims and url-encodes the key", () => {
		expect(applyBasemapKey(CARTO, "  a b/c  ")).toBe(
			`${CARTO}?key=a%20b%2Fc`,
		);
	});
});

describe("BASEMAPS_REQUIRING_KEY", () => {
	test("contains exactly the three key-requiring urls", () => {
		expect([...BASEMAPS_REQUIRING_KEY]).toEqual([
			CARTO,
			STADIA_DARK,
			STADIA_SATELLITE,
		]);
	});

	test("every listed url carries a keyParam and a keyUrl", () => {
		for (const url of BASEMAPS_REQUIRING_KEY) {
			const entry = BASEMAP_PROVIDERS.find((p) => p.url === url);
			expect(entry?.keyParam).toBeTruthy();
			expect(entry?.keyUrl).toBeTruthy();
		}
	});
});

describe("basemapOneOf", () => {
	test("mirrors the provider table one-for-one, in order", () => {
		expect(basemapOneOf()).toEqual(
			BASEMAP_PROVIDERS.map((entry) => ({
				const: entry.url,
				title: entry.title,
			})),
		);
	});

	test("offers all ten basemaps", () => {
		expect(basemapOneOf()).toHaveLength(10);
	});
});
