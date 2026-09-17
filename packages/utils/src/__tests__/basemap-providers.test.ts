import { describe, test, expect } from "bun:test";
import {
	BASEMAP_PROVIDERS,
	BASEMAPS_REQUIRING_KEY,
	VECTOR_BASEMAPS,
	applyBasemapKey,
	basemapOneOf,
	isVectorBasemap,
	vectorBasemapStyleId,
} from "../basemap-providers";

const CARTO =
	"https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png";
const STADIA_DARK =
	"https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png";
const STADIA_SATELLITE =
	"https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const LIBERTY = "ormi:vector/openfreemap-liberty";

/** Every raster row — i.e. every row a deployed widget config can hold today. */
const RASTER_PROVIDERS = BASEMAP_PROVIDERS.filter(
	(entry) => entry.kind !== "vector",
);

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
	test("excludes every vector sentinel — they take no key", () => {
		for (const url of VECTOR_BASEMAPS) {
			expect(BASEMAPS_REQUIRING_KEY).not.toContain(url);
		}
	});

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
	test("offers every basemap in the table, and only those", () => {
		expect(
			basemapOneOf()
				.map((entry) => entry.const)
				.sort(),
		).toEqual(BASEMAP_PROVIDERS.map((entry) => entry.url).sort());
	});

	// The picker is deliberately NOT in table order. Thirteen single-line
	// names, several differing by one word, read as an undifferentiated list;
	// ordering by what distinguishes them is what makes it scannable. Pinned
	// because it is a presentation decision that would otherwise be "tidied"
	// back to table order by someone reading the mapping as accidental.
	test("puts the vector styles first and the key-gated ones last", () => {
		const urls = basemapOneOf().map((entry) => entry.const);
		const rank = (url: string) => {
			const entry = BASEMAP_PROVIDERS.find((row) => row.url === url)!;
			if (entry.kind === "vector") return 0;
			return entry.keyParam ? 2 : 1;
		};

		const ranks = urls.map(rank);
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
		expect(ranks[0]).toBe(0);
		expect(ranks[ranks.length - 1]).toBe(2);
	});

	test("says when a basemap will not render without an API key", () => {
		for (const { const: url, title } of basemapOneOf()) {
			const entry = BASEMAP_PROVIDERS.find((row) => row.url === url)!;
			// Otherwise the operator selects it, gets a blank map, and has no
			// way to know the key field further down the form is the reason.
			expect(title.includes("API key required")).toBe(
				Boolean(entry.keyParam),
			);
		}
	});

	test("names the provider unless the title already opens with it", () => {
		const esri = basemapOneOf().find((entry) =>
			entry.const.includes("World_Imagery"),
		);
		expect(esri?.title).toContain("Esri");

		const osm = basemapOneOf().find(
			(entry) =>
				entry.const ===
				"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
		);
		expect(osm?.title).toBe("OpenStreetMap");
	});

	test("offers all thirteen basemaps", () => {
		expect(basemapOneOf()).toHaveLength(13);
	});

	test("emits a { const, title } pair for every row, vector rows included", () => {
		for (const entry of basemapOneOf()) {
			expect(Object.keys(entry).sort()).toEqual(["const", "title"]);
			expect(entry.const).toBeTruthy();
			expect(entry.title).toBeTruthy();
		}
	});
});

// ---------------------------------------------------------------------------
// Persisted-config regression guard
//
// Every value a deployed robot may already have saved in a widget config is a
// raster url. Adding vector rows must leave all of them on a byte-identical
// code path — these tests fail loudly if a vector change ever bleeds into the
// raster catalogue.
// ---------------------------------------------------------------------------

describe("raster rows are untouched by the vector entries", () => {
	test("all ten raster rows are still present, in order, with no `kind`", () => {
		expect(RASTER_PROVIDERS).toHaveLength(10);
		expect(BASEMAP_PROVIDERS.slice(0, 10)).toEqual(RASTER_PROVIDERS);
		for (const entry of RASTER_PROVIDERS) {
			expect(entry.kind).toBeUndefined();
		}
	});

	test("every raster row round-trips applyBasemapKey exactly as before", () => {
		for (const entry of RASTER_PROVIDERS) {
			expect(applyBasemapKey(entry.url)).toBe(entry.url);
			expect(applyBasemapKey(entry.url, "")).toBe(entry.url);
			expect(applyBasemapKey(entry.url, "abc123")).toBe(
				entry.keyParam
					? `${entry.url}?${entry.keyParam}=abc123`
					: entry.url,
			);
		}
	});

	test("isVectorBasemap is false for every raster url", () => {
		for (const entry of RASTER_PROVIDERS) {
			expect(isVectorBasemap(entry.url)).toBe(false);
			expect(vectorBasemapStyleId(entry.url)).toBeUndefined();
		}
	});

	test("isVectorBasemap is false for an unknown custom template and for empty input", () => {
		expect(
			isVectorBasemap("https://tiles.example.org/base/{z}/{x}/{y}.png"),
		).toBe(false);
		expect(isVectorBasemap("")).toBe(false);
		expect(isVectorBasemap("ormi:vector/does-not-exist")).toBe(false);
	});

	test("the teodor cockpit preset value stays raster", () => {
		// `default-cockpit.ts` seeds its map widget from the Carto Voyager row.
		const preset = BASEMAP_PROVIDERS.find((entry) =>
			entry.url.includes("voyager_labels_under"),
		);
		expect(preset).toBeDefined();
		expect(isVectorBasemap(preset!.url)).toBe(false);
	});
});

describe("vector basemaps", () => {
	test("exposes exactly the three bundled sentinels, in catalogue order", () => {
		expect([...VECTOR_BASEMAPS]).toEqual([
			"ormi:vector/openfreemap-liberty",
			"ormi:vector/openfreemap-positron",
			"ormi:vector/openfreemap-dark",
		]);
	});

	test("sentinels use a non-HTTP scheme so a stray setStyle fails loudly", () => {
		for (const url of VECTOR_BASEMAPS) {
			expect(url.startsWith("ormi:vector/")).toBe(true);
			expect(url.startsWith("http")).toBe(false);
			expect(url).not.toContain("{z}");
		}
	});

	test("sentinels are unique and collide with no raster url", () => {
		expect(new Set(VECTOR_BASEMAPS).size).toBe(VECTOR_BASEMAPS.length);
		const rasterUrls = new Set(RASTER_PROVIDERS.map((e) => e.url));
		for (const url of VECTOR_BASEMAPS) {
			expect(rasterUrls.has(url)).toBe(false);
		}
	});

	test("every sentinel resolves to its style id", () => {
		expect(vectorBasemapStyleId(LIBERTY)).toBe("openfreemap-liberty");
		expect(vectorBasemapStyleId("ormi:vector/openfreemap-positron")).toBe(
			"openfreemap-positron",
		);
		expect(vectorBasemapStyleId("ormi:vector/openfreemap-dark")).toBe(
			"openfreemap-dark",
		);
		for (const url of VECTOR_BASEMAPS) {
			expect(isVectorBasemap(url)).toBe(true);
			expect(vectorBasemapStyleId(url)).toBeTruthy();
		}
	});

	test("declares the source zoom ceiling MapLibre overzooms past", () => {
		for (const url of VECTOR_BASEMAPS) {
			const entry = BASEMAP_PROVIDERS.find((e) => e.url === url);
			expect(entry).toMatchObject({ kind: "vector", maxSourceZoom: 14 });
		}
	});

	test("applyBasemapKey is a no-op on a sentinel", () => {
		for (const url of VECTOR_BASEMAPS) {
			expect(applyBasemapKey(url, "abc123")).toBe(url);
			expect(applyBasemapKey(url)).toBe(url);
		}
	});
});
