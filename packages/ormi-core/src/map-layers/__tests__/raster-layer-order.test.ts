import { afterEach, describe, expect, it } from "bun:test";

import { handleMapError, mapErrorMessage } from "../map-error";
import {
	applyRasterLayerOrder,
	planRasterLayerMoves,
	resolveLiveBeforeId,
	type LayerOrderMap,
} from "../raster-layer-order";

const ANCHOR = "ormi-anchor-overlay";
const C2_FILL = "c2-features-fill";
const A = "ormi-raster-1-a-x";
const B = "ormi-raster-1-b-y";

/**
 * A map that behaves like MapLibre for ordering: `moveLayer` emits an error
 * (and moves nothing) for a `beforeId` the style lacks, as MapLibre does.
 */
function fakeMap(initial: string[]) {
	const errors: string[] = [];
	const map: LayerOrderMap & { layers: string[]; errors: string[] } = {
		layers: [...initial],
		errors,
		getLayersOrder() {
			return [...this.layers];
		},
		moveLayer(id: string, beforeId?: string) {
			if (!this.layers.includes(id)) {
				errors.push(`Cannot move layer "${id}"`);
				return;
			}
			if (beforeId !== undefined && !this.layers.includes(beforeId)) {
				errors.push(
					`Cannot move layer "${id}" before non-existing layer "${beforeId}"`,
				);
				return;
			}
			this.layers.splice(this.layers.indexOf(id), 1);
			if (beforeId === undefined) this.layers.push(id);
			else this.layers.splice(this.layers.indexOf(beforeId), 0, id);
		},
	};
	return map;
}

describe("resolveLiveBeforeId", () => {
	it("takes the first candidate the live style has", () => {
		expect(resolveLiveBeforeId(["bg", C2_FILL], [ANCHOR, C2_FILL])).toBe(
			C2_FILL,
		);
		expect(
			resolveLiveBeforeId(["bg", ANCHOR, C2_FILL], [ANCHOR, C2_FILL]),
		).toBe(ANCHOR);
		expect(resolveLiveBeforeId(["bg"], [ANCHOR, null, undefined])).toBe(
			undefined,
		);
		expect(resolveLiveBeforeId(["bg", A], [A], [A])).toBe(undefined);
	});
});

describe("planRasterLayerMoves", () => {
	it("stacks the layers directly under the anchor, bottom first", () => {
		const order = ["bg", "roads", ANCHOR, "labels", A, B];
		expect(planRasterLayerMoves(order, [A, B], [ANCHOR])).toEqual([
			{ id: B, beforeId: ANCHOR },
			{ id: A, beforeId: B },
		]);
	});

	it("is a no-op when already in place", () => {
		expect(
			planRasterLayerMoves(
				["bg", A, B, ANCHOR, "labels"],
				[A, B],
				[ANCHOR],
			),
		).toEqual([]);
	});

	it("skips layers not added yet and never names a missing layer", () => {
		const order = ["bg", ANCHOR, A];
		const moves = planRasterLayerMoves(order, [A, B], [ANCHOR]);
		expect(moves).toEqual([{ id: A, beforeId: ANCHOR }]);
	});
});

describe("applyRasterLayerOrder on a live map", () => {
	it("a raster style with no anchor: nothing is moved, no error", () => {
		const map = fakeMap(["raster-basemap", A, B]);
		expect(applyRasterLayerOrder(map, [A, B], [ANCHOR])).toEqual([]);
		expect(map.errors).toEqual([]);
		expect(map.layers).toEqual(["raster-basemap", A, B]);
	});

	it("raster to vector: placed once the new style has the anchor", () => {
		const map = fakeMap(["raster-basemap", A, B]);
		applyRasterLayerOrder(map, [A, B], [ANCHOR, C2_FILL]);
		// setStyle diff: the basemap is replaced, the overlay re-adds itself
		// on top (react-map-gl's styledata), then styledata reaches the overlay.
		map.layers = ["bg", "roads", ANCHOR, "labels", A, B];
		applyRasterLayerOrder(map, [A, B], [ANCHOR, C2_FILL]);
		expect(map.errors).toEqual([]);
		expect(map.layers).toEqual(["bg", "roads", A, B, ANCHOR, "labels"]);
		// The styledata a move itself causes ends in no move.
		expect(applyRasterLayerOrder(map, [A, B], [ANCHOR, C2_FILL])).toEqual(
			[],
		);
	});

	it("falls back to the next candidate, and moves up once the anchor appears", () => {
		const map = fakeMap(["raster-basemap", A, C2_FILL, "c2-features-line"]);
		applyRasterLayerOrder(map, [A], [ANCHOR, C2_FILL]);
		expect(map.layers).toEqual([
			"raster-basemap",
			A,
			C2_FILL,
			"c2-features-line",
		]);
		map.layers = ["bg", ANCHOR, "labels", A, C2_FILL];
		applyRasterLayerOrder(map, [A], [ANCHOR, C2_FILL]);
		expect(map.layers).toEqual(["bg", A, ANCHOR, "labels", C2_FILL]);
		expect(map.errors).toEqual([]);
	});

	it("a candidate added after the overlay (C2 features) is honoured on styledata", () => {
		const map = fakeMap(["raster-basemap", A]);
		applyRasterLayerOrder(map, [A], [ANCHOR, C2_FILL]);
		// C2 adds its feature fill after the overlay mounted: appended on top.
		map.layers = ["raster-basemap", C2_FILL, A];
		applyRasterLayerOrder(map, [A], [ANCHOR, C2_FILL]);
		expect(map.layers).toEqual(["raster-basemap", A, C2_FILL]);
		expect(map.errors).toEqual([]);
	});

	it("tolerates a map between styles", () => {
		const broken: LayerOrderMap = {
			getLayersOrder() {
				throw new Error("Style is not done loading");
			},
			moveLayer() {},
		};
		expect(applyRasterLayerOrder(broken, [A], [ANCHOR])).toEqual([]);
	});
});

describe("handleMapError", () => {
	const original = { warn: console.warn, error: console.error };
	afterEach(() => {
		console.warn = original.warn;
		console.error = original.error;
	});

	it("never logs a query string", () => {
		const logged: string[] = [];
		console.warn = (...args: unknown[]) => logged.push(args.join(" "));
		console.error = (...args: unknown[]) => logged.push(args.join(" "));
		handleMapError({
			sourceId: A,
			error: new Error(
				"Failed to fetch http://h/geoserver/gwc/1/2/3?authkey=s3cret&f=png (403)",
			),
		});
		handleMapError({ error: "Bad https://x.example/style.json?key=abc" });
		handleMapError({ error: { message: 42 } });
		expect(logged).toHaveLength(3);
		expect(logged.join("\n")).not.toContain("s3cret");
		expect(logged.join("\n")).not.toContain("key=abc");
		expect(logged[0]).toContain("http://h/geoserver/gwc/1/2/3 (403)");
		expect(mapErrorMessage(undefined)).toBe("Unknown map error");
	});

	it("warns for a source error, errors otherwise", () => {
		let warned = 0;
		let errored = 0;
		console.warn = () => warned++;
		console.error = () => errored++;
		handleMapError({ sourceId: A, error: new Error("x") });
		handleMapError({ error: new Error("y") });
		expect([warned, errored]).toEqual([1, 1]);
	});
});
