import { describe, test, expect } from "bun:test";
import {
	ORMI_STYLE_ANCHORS,
	insertLayersAt,
	resolveAnchor,
} from "../style-layers";

interface TestLayer {
	id: string;
}

const layer = (id: string): TestLayer => ({ id });

/** A style shaped like an ORMI vector basemap: anchors at known seams. */
const anchoredLayers: TestLayer[] = [
	layer("background"),
	layer(ORMI_STYLE_ANCHORS.imagery),
	layer("water"),
	layer("roads"),
	layer(ORMI_STYLE_ANCHORS.overlay),
	layer(ORMI_STYLE_ANCHORS.graticule),
	layer("labels"),
	layer(ORMI_STYLE_ANCHORS.top),
];

/** A style shaped like a raster basemap: no anchors at all. */
const rasterLayers: TestLayer[] = [layer("simple-tiles")];

describe("ORMI_STYLE_ANCHORS", () => {
	test("exposes the four documented anchor ids", () => {
		expect(ORMI_STYLE_ANCHORS).toEqual({
			imagery: "ormi-anchor-imagery",
			overlay: "ormi-anchor-overlay",
			graticule: "ormi-anchor-graticule",
			top: "ormi-anchor-top",
		});
	});
});

describe("insertLayersAt", () => {
	test("inserts immediately before the anchor", () => {
		const result = insertLayersAt(
			anchoredLayers,
			ORMI_STYLE_ANCHORS.overlay,
			[layer("cog-1"), layer("cog-2")],
		);
		expect(result.map((l) => l.id)).toEqual([
			"background",
			"ormi-anchor-imagery",
			"water",
			"roads",
			"cog-1",
			"cog-2",
			"ormi-anchor-overlay",
			"ormi-anchor-graticule",
			"labels",
			"ormi-anchor-top",
		]);
	});

	test("keeps the inserted layers in their own order", () => {
		const result = insertLayersAt(
			anchoredLayers,
			ORMI_STYLE_ANCHORS.graticule,
			[layer("grid-layer")],
		);
		const ids = result.map((l) => l.id);
		expect(ids.indexOf("ormi-anchor-overlay")).toBeLessThan(
			ids.indexOf("grid-layer"),
		);
		expect(ids.indexOf("grid-layer")).toBeLessThan(
			ids.indexOf("ormi-anchor-graticule"),
		);
	});

	test("APPENDS when the anchor is absent — the raster-equivalence guard", () => {
		const result = insertLayersAt(
			rasterLayers,
			ORMI_STYLE_ANCHORS.overlay,
			[layer("custom-layer-0")],
		);
		expect(result.map((l) => l.id)).toEqual([
			"simple-tiles",
			"custom-layer-0",
		]);
	});

	test("two successive appends reproduce the pre-anchor raster order", () => {
		const withCustom = insertLayersAt(
			rasterLayers,
			ORMI_STYLE_ANCHORS.overlay,
			[layer("custom-layer-0"), layer("custom-layer-1")],
		);
		const withGrid = insertLayersAt(
			withCustom,
			ORMI_STYLE_ANCHORS.graticule,
			[layer("grid-layer")],
		);
		expect(withGrid.map((l) => l.id)).toEqual([
			"simple-tiles",
			"custom-layer-0",
			"custom-layer-1",
			"grid-layer",
		]);
	});

	test("inserting nothing returns an equal copy", () => {
		const result = insertLayersAt(
			anchoredLayers,
			ORMI_STYLE_ANCHORS.overlay,
			[],
		);
		expect(result).toEqual(anchoredLayers);
		expect(result).not.toBe(anchoredLayers);
	});

	test("never mutates its inputs", () => {
		const layers = [layer("a"), layer(ORMI_STYLE_ANCHORS.top)];
		const snapshot = layers.map((l) => l.id);
		const inserted = [layer("b")];

		insertLayersAt(layers, ORMI_STYLE_ANCHORS.top, inserted);

		expect(layers.map((l) => l.id)).toEqual(snapshot);
		expect(layers).toHaveLength(2);
		expect(inserted.map((l) => l.id)).toEqual(["b"]);
	});

	test("returns a new array, not the input", () => {
		expect(
			insertLayersAt(rasterLayers, ORMI_STYLE_ANCHORS.top, [layer("x")]),
		).not.toBe(rasterLayers);
	});
});

describe("resolveAnchor", () => {
	test("returns the anchor id when the style carries it", () => {
		expect(
			resolveAnchor(
				{ layers: anchoredLayers },
				ORMI_STYLE_ANCHORS.overlay,
			),
		).toBe("ormi-anchor-overlay");
	});

	test("returns undefined for an anchorless style — MapLibre throws on a missing beforeId", () => {
		expect(
			resolveAnchor({ layers: rasterLayers }, ORMI_STYLE_ANCHORS.overlay),
		).toBeUndefined();
	});

	test("tolerates a missing style or a style without layers", () => {
		expect(
			resolveAnchor(undefined, ORMI_STYLE_ANCHORS.overlay),
		).toBeUndefined();
		expect(resolveAnchor(null, ORMI_STYLE_ANCHORS.overlay)).toBeUndefined();
		expect(resolveAnchor({}, ORMI_STYLE_ANCHORS.overlay)).toBeUndefined();
		expect(
			resolveAnchor({ layers: [] }, ORMI_STYLE_ANCHORS.overlay),
		).toBeUndefined();
	});
});
