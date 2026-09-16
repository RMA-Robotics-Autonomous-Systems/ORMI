import { describe, test, expect } from "bun:test";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { StyleSpecification } from "maplibre-gl";
import {
	createOpenFreeMapDarkStyle,
	createOpenFreeMapLibertyStyle,
	createOpenFreeMapPositronStyle,
	createVectorBasemapStyle,
} from "../basemap-styles";
import { ORMI_STYLE_ANCHORS } from "../style-layers";
import { BASEMAP_PROVIDERS, VECTOR_BASEMAPS } from "../basemap-providers";

/**
 * Each bundled style with the NAMED neighbours its anchors sit between.
 *
 * Deliberately named layers rather than raw indices: Positron and Dark are not
 * trimmed copies of Liberty and carry different layer ids, and an index-based
 * assertion would silently pass after an upstream re-derivation reshuffles the
 * stack.
 */
interface StyleUnderTest {
	name: string;
	factory: () => StyleSpecification;
	/** layer the `imagery` anchor sits directly after / before */
	imageryAfter: string;
	imageryBefore: string;
	/** layer the `overlay` anchor sits directly after */
	overlayAfter: string;
	/** layer the `graticule` anchor sits directly before */
	graticuleBefore: string;
	/** layer the `top` anchor sits directly after (it is always last) */
	topAfter: string;
}

const STYLES: StyleUnderTest[] = [
	{
		name: "liberty",
		factory: createOpenFreeMapLibertyStyle,
		imageryAfter: "natural_earth",
		imageryBefore: "park",
		overlayAfter: "boundary_disputed",
		graticuleBefore: "waterway_line_label",
		topAfter: "label_country_1",
	},
	{
		name: "positron",
		factory: createOpenFreeMapPositronStyle,
		imageryAfter: "background",
		imageryBefore: "park",
		overlayAfter: "boundary_disputed",
		graticuleBefore: "waterway_line_label",
		topAfter: "label_country_1",
	},
	{
		name: "dark",
		factory: createOpenFreeMapDarkStyle,
		imageryAfter: "background",
		imageryBefore: "water",
		overlayAfter: "railway_dashline",
		graticuleBefore: "highway_name_other",
		topAfter: "place_country_major",
	},
];

const layerIds = (style: StyleSpecification) => style.layers.map((l) => l.id);

for (const spec of STYLES) {
	describe(`${spec.name} vector basemap style`, () => {
		const style = spec.factory();
		const ids = layerIds(style);

		test("validates against the MapLibre style specification", () => {
			expect(validateStyleMin(style)).toEqual([]);
		});

		test("keeps the openmaptiles source in TileJSON `url` form", () => {
			const source = style.sources.openmaptiles as Record<
				string,
				unknown
			>;
			expect(source.type).toBe("vector");
			expect(source.url).toBe("https://tiles.openfreemap.org/planet");
			// The concrete tile path behind that TileJSON is date-versioned and
			// rotates on every weekly planet rebuild. Inlining it would pass review
			// and break in the field within a week.
			expect(source.tiles).toBeUndefined();
		});

		test("carries the empty ormi-anchor source", () => {
			expect(style.sources["ormi-anchor"]).toEqual({
				type: "geojson",
				data: { type: "FeatureCollection", features: [] },
			});
		});

		test("carries all four anchors, exactly once each", () => {
			for (const anchor of Object.values(ORMI_STYLE_ANCHORS)) {
				expect(ids.filter((id) => id === anchor)).toHaveLength(1);
			}
		});

		test("anchors sit at their documented named neighbours", () => {
			const at = (id: string) => {
				const i = ids.indexOf(id);
				expect(i).toBeGreaterThanOrEqual(0);
				return i;
			};

			expect(at(ORMI_STYLE_ANCHORS.imagery)).toBe(
				at(spec.imageryAfter) + 1,
			);
			expect(at(spec.imageryBefore)).toBe(
				at(ORMI_STYLE_ANCHORS.imagery) + 1,
			);

			expect(at(ORMI_STYLE_ANCHORS.overlay)).toBe(
				at(spec.overlayAfter) + 1,
			);
			expect(at(ORMI_STYLE_ANCHORS.graticule)).toBe(
				at(ORMI_STYLE_ANCHORS.overlay) + 1,
			);
			expect(at(spec.graticuleBefore)).toBe(
				at(ORMI_STYLE_ANCHORS.graticule) + 1,
			);

			expect(at(ORMI_STYLE_ANCHORS.top)).toBe(ids.length - 1);
			expect(at(spec.topAfter)).toBe(ids.length - 2);
		});

		test("anchors are in bottom-to-top order", () => {
			const order = [
				ORMI_STYLE_ANCHORS.imagery,
				ORMI_STYLE_ANCHORS.overlay,
				ORMI_STYLE_ANCHORS.graticule,
				ORMI_STYLE_ANCHORS.top,
			].map((anchor) => ids.indexOf(anchor));
			expect(order).toEqual([...order].sort((a, b) => a - b));
		});

		test("anchor layers paint nothing", () => {
			for (const anchor of Object.values(ORMI_STYLE_ANCHORS)) {
				const layer = style.layers.find((l) => l.id === anchor);
				// Never a `background` layer — that would paint the whole viewport.
				expect(layer?.type).toBe("line");
				expect(layer).toMatchObject({
					source: "ormi-anchor",
					layout: { visibility: "none" },
				});
			}
		});

		test("ships building-3d hidden", () => {
			const buildings = style.layers.find((l) => l.id === "building-3d");
			expect(buildings?.type).toBe("fill-extrusion");
			expect(buildings).toMatchObject({
				source: "openmaptiles",
				"source-layer": "building",
				layout: { visibility: "none" },
			});
		});

		test("points glyphs and sprite at absolute urls", () => {
			expect(style.glyphs).toMatch(
				/^https:\/\/\S+\{fontstack\}\S*\{range\}/,
			);
			expect(style.sprite).toMatch(/^https:\/\/\S+/);
		});

		test("two calls return equal but NON-IDENTICAL objects", () => {
			const a = spec.factory();
			const b = spec.factory();
			expect(a).toEqual(b);
			expect(a).not.toBe(b);
			expect(a.layers).not.toBe(b.layers);
			expect(a.layers[0]).not.toBe(b.layers[0]);
			expect(a.sources).not.toBe(b.sources);
		});

		test("a mutation of one copy cannot reach the next", () => {
			const mutated = spec.factory();
			mutated.layers.push({
				id: "scribble",
				type: "line",
				source: "ormi-anchor",
			});
			expect(layerIds(spec.factory())).not.toContain("scribble");
		});
	});
}

describe("createVectorBasemapStyle", () => {
	test("resolves every vector row in the basemap catalogue", () => {
		for (const url of VECTOR_BASEMAPS) {
			const entry = BASEMAP_PROVIDERS.find((p) => p.url === url);
			if (entry?.kind !== "vector")
				throw new Error(`${url} is not a vector row`);
			const style = createVectorBasemapStyle(entry.styleId);
			expect(style.version).toBe(8);
			expect(validateStyleMin(style)).toEqual([]);
		}
	});

	test("returns a fresh copy on every call", () => {
		expect(createVectorBasemapStyle("openfreemap-liberty")).not.toBe(
			createVectorBasemapStyle("openfreemap-liberty"),
		);
	});
});
