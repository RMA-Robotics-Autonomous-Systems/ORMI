/**
 * The standard map widget's basemap style — the zoom limits specifically.
 *
 * Mirrors `plugins/ormi-c2-control/src/widgets/maps-shared/use-map-style.test.ts`
 * for the other map. The two style builders are separate code with the same
 * contract, so the same invariants are asserted on both: a `maxzoom` that
 * lands on the basemap LAYER hides the basemap at that zoom, which is the
 * blank map an operator reads as "this map has a zoom limit".
 */

import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	BASEMAP_PROVIDERS,
	MAP_MAX_ZOOM,
	basemapMaxSourceZoom,
} from "@workspace/utils";
import type { StyleSpecification } from "react-map-gl/maplibre";

import { useMapStyle } from "../useMapStyle";

/** A raster XYZ template the catalogue does not carry. */
const CUSTOM_RASTER_URL = "https://tile.example.org/{z}/{x}/{y}.png";

/**
 * Run the hook once and hand back what it produced.
 *
 * Rendered rather than called directly because it is a `useMemo` hook; the
 * repo's other React tests use the same server-render probe, which needs no
 * DOM.
 *
 * @param mapUrl - The persisted basemap value to build a style for.
 * @returns The style the hook returned.
 */
function buildStyle(mapUrl: string): StyleSpecification {
	let captured: StyleSpecification | undefined;
	const Probe = () => {
		captured = useMapStyle({
			mapUrl,
			use3D: false,
			customLayers: [],
			showGrid: false,
		});
		return null;
	};
	renderToStaticMarkup(React.createElement(Probe));
	if (!captured) throw new Error(`no style built for ${mapUrl}`);
	return captured;
}

/**
 * The basemap tile layer of a raster style.
 *
 * @param style - A built style.
 * @returns The layer, if present.
 */
const basemapLayer = (style: StyleSpecification) =>
	style.layers.find((layer) => layer.id === "simple-tiles");

describe("raster basemap zoom limits", () => {
	it("never caps the basemap LAYER, at any zoom", () => {
		// The `22` that used to sit here made every raster basemap vanish past
		// z22. Tile depth belongs on the source; the layer draws at any zoom.
		for (const entry of BASEMAP_PROVIDERS) {
			if (entry.kind === "vector") continue;
			expect(
				basemapLayer(buildStyle(entry.url))?.maxzoom,
			).toBeUndefined();
		}
		expect(
			basemapLayer(buildStyle(CUSTOM_RASTER_URL))?.maxzoom,
		).toBeUndefined();
	});

	it("declares the vendor's real tile depth on the source", () => {
		// So MapLibre overzooms the deepest published level instead of
		// requesting `{z}` values that 404 and leave the map blank.
		for (const entry of BASEMAP_PROVIDERS) {
			if (entry.kind === "vector") continue;
			expect(buildStyle(entry.url).sources["raster-tiles"]).toMatchObject(
				{
					maxzoom: basemapMaxSourceZoom(entry.url),
				},
			);
			expect(entry.maxSourceZoom).toBeLessThan(MAP_MAX_ZOOM);
		}
	});

	it("declares nothing for a url the catalogue does not carry", () => {
		// An operator's own tile server may go deeper than anything vendored.
		expect(
			buildStyle(CUSTOM_RASTER_URL).sources["raster-tiles"],
		).not.toHaveProperty("maxzoom");
	});
});
