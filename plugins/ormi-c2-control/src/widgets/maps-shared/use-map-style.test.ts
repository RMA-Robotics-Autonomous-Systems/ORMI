/**
 * The mission map's basemap style.
 *
 * The one property worth a test here is a negative: the style depends on the
 * basemap and the key, and on **nothing the operator toggles**. A style object
 * that changed with the 3D toggle would make react-map-gl re-`setStyle`, whose
 * diff deletes every imperatively added source and layer — terra-draw's
 * authoring layers among them, which nothing re-adds. The 3D flip therefore
 * happens on the live map (`setLayerVisibility`, tested in `packages/utils`),
 * and the building layer must leave this function exactly as the bundled style
 * ships it.
 */

import { describe, expect, it } from "bun:test";
import {
	ORMI_BUILDINGS_3D_LAYER,
	BASEMAP_PROVIDERS,
	MAP_MAX_ZOOM,
	basemapMaxSourceZoom,
} from "@workspace/utils";

import { buildMapStyle } from "./use-map-style";

/** The first bundled vector basemap, as the widget's dropdown offers it. */
const VECTOR_URL = BASEMAP_PROVIDERS.find(
	(entry) => entry.kind === "vector",
)!.url;

/** A raster XYZ template with no key requirement. */
const RASTER_URL = "https://tile.example.org/{z}/{x}/{y}.png";

/** The style's 3D building layer, if it has one. */
const buildingsLayer = (style: ReturnType<typeof buildMapStyle>) =>
	style.layers.find((layer) => layer.id === ORMI_BUILDINGS_3D_LAYER);

describe("a vector basemap", () => {
	it("carries the building layer, shipped hidden", () => {
		// Present, so the widget has something to flip; hidden, so a map opens
		// flat until the operator asks for 3D.
		const layer = buildingsLayer(buildMapStyle(VECTOR_URL));
		expect(layer?.type).toBe("fill-extrusion");
		expect(layer?.layout?.visibility).toBe("none");
	});

	it("is a fresh style per call, never the frozen module literal", () => {
		// MapLibre consumes and normalises the object it is handed, so two map
		// widgets sharing one style object is an intermittent, unreproducible
		// bug.
		const a = buildMapStyle(VECTOR_URL);
		const b = buildMapStyle(VECTOR_URL);
		expect(a).not.toBe(b);
		expect(a.layers).not.toBe(b.layers);
		expect(buildingsLayer(a)).not.toBe(buildingsLayer(b));
	});
});

describe("a raster basemap", () => {
	it("has no building layer at all", () => {
		// Raster tiles carry no vector geometry; the widget's Overpass
		// `Buildings3DLayer` is what answers the toggle there.
		expect(buildingsLayer(buildMapStyle(RASTER_URL))).toBeUndefined();
	});

	it("serves plain raster tiles", () => {
		const style = buildMapStyle(RASTER_URL);
		expect(style.layers.map((l) => l.id)).toEqual(["simple-tiles"]);
		expect(style.sources["raster-tiles"]).toMatchObject({
			type: "raster",
			tiles: [RASTER_URL],
		});
	});

	it("never caps the basemap LAYER, at any zoom", () => {
		// A layer `maxzoom` hides the layer at and above that zoom. The `22`
		// that used to sit here made every raster basemap disappear past z22 —
		// the operator's "the map has a zoom limit". Tile depth belongs on the
		// source, never here.
		for (const entry of BASEMAP_PROVIDERS) {
			const layer = buildMapStyle(entry.url).layers.find(
				(candidate) => candidate.id === "simple-tiles",
			);
			expect(layer?.maxzoom).toBeUndefined();
		}
		expect(
			buildMapStyle(RASTER_URL).layers.find(
				(candidate) => candidate.id === "simple-tiles",
			)?.maxzoom,
		).toBeUndefined();
	});

	it("declares the vendor's real tile depth on the source", () => {
		// Without it MapLibre keeps requesting `{z}` the vendor never
		// generated; they 404 and the basemap goes blank on the way in,
		// instead of overzooming the deepest real level.
		for (const entry of BASEMAP_PROVIDERS) {
			if (entry.kind === "vector") continue;
			const source = buildMapStyle(entry.url).sources["raster-tiles"];
			expect(source).toMatchObject({
				maxzoom: basemapMaxSourceZoom(entry.url),
			});
			expect(entry.maxSourceZoom).toBeLessThan(MAP_MAX_ZOOM);
		}
	});

	it("declares nothing for a url the catalogue does not carry", () => {
		// An operator's own tile server may well go deeper than any vendor
		// here; capping it would be a guess, so MapLibre's default stands.
		expect(
			buildMapStyle(RASTER_URL).sources["raster-tiles"],
		).not.toHaveProperty("maxzoom");
	});
});
