/**
 * A stored feature opened for editing must be ACCEPTED by terra-draw.
 *
 * terra-draw's `addFeatures` does not throw on a feature it cannot use: it
 * returns `{ valid: false, reason }` and stores nothing. The editor used to
 * ignore that result, and `c2FeatureToDrawFeature` left out `properties.mode`,
 * so every edit was refused ("Mode property does not exist") and saving wrote
 * the unchanged geometry back. These tests run the real terra-draw store and
 * mode validators (no map: a stub adapter), so a converter change that breaks
 * loading fails here instead of in the field.
 */
import { describe, expect, it } from "bun:test";
import {
	TerraDraw,
	TerraDrawLineStringMode,
	TerraDrawPointMode,
	TerraDrawPolygonMode,
	TerraDrawSelectMode,
	type GeoJSONStoreFeatures,
} from "terra-draw";

import type { C2Feature } from "../types/c2-types";
import {
	c2FeatureToDrawFeature,
	drawFeatureToC2Feature,
	drawModeForGeometry,
	TERRA_DRAW_COORDINATE_PRECISION,
	type DrawFeature,
} from "./feature-geojson";

/** The smallest adapter terra-draw will start on: no map, nothing rendered. */
function stubAdapter() {
	return {
		project: () => ({ x: 0, y: 0 }),
		unproject: () => ({ lng: 0, lat: 0 }),
		setCursor: () => {},
		getLngLatFromEvent: () => null,
		setDoubleClickToZoom: () => {},
		setDraggability: () => {},
		getMapEventElement: () => ({}) as HTMLElement,
		register: (callbacks: { onReady?: () => void }) =>
			callbacks.onReady?.(),
		unregister: () => {},
		render: () => {},
		clear: () => {},
		getCoordinatePrecision: () => TERRA_DRAW_COORDINATE_PRECISION,
	};
}

/** Per-mode select flags as the C2 map sets them (`mission-map.tsx`). */
const EDITABLE = {
	feature: {
		draggable: true,
		coordinates: { midpoints: true, draggable: true, deletable: true },
	},
};

/**
 * A terra-draw instance with the modes the C2 map instantiates. A select mode
 * only selects features of a mode it has `flags` for, keyed by the same name
 * `drawModeForGeometry` writes into `properties.mode`.
 */
function startedDraw(): TerraDraw {
	const draw = new TerraDraw({
		// The stub satisfies terra-draw's adapter interface at runtime.
		adapter: stubAdapter() as never,
		modes: [
			new TerraDrawPointMode(),
			new TerraDrawLineStringMode(),
			new TerraDrawPolygonMode(),
			new TerraDrawSelectMode({
				flags: {
					point: { feature: { draggable: true } },
					linestring: EDITABLE,
					polygon: EDITABLE,
				},
			}),
		],
	});
	draw.start();
	return draw;
}

function load(draw: TerraDraw, drawn: DrawFeature | null) {
	expect(drawn).not.toBeNull();
	return draw.addFeatures([drawn as unknown as GeoJSONStoreFeatures])[0];
}

const stored: Record<string, C2Feature> = {
	waypoint: {
		type: "Feature",
		properties: {
			feature_id: "wp-1",
			name: "Rally",
			feature_type: "waypoint",
		},
		geometry: { type: "Point", coordinates: [4.3517, 50.8466] },
	},
	road: {
		type: "Feature",
		properties: { feature_id: "rd-1", name: "Track", feature_type: "road" },
		geometry: {
			type: "LineString",
			coordinates: [
				[4.35, 50.84],
				[4.36, 50.85],
				[4.37, 50.85],
			],
		},
	},
	zone: {
		type: "Feature",
		properties: { feature_id: "zn-1", name: "Field", feature_type: "zone" },
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[4.35, 50.84],
					[4.36, 50.84],
					[4.36, 50.85],
					[4.35, 50.85],
					[4.35, 50.84],
				],
			],
		},
	},
};

describe("a stored feature opened for editing is accepted by terra-draw", () => {
	for (const [kind, feature] of Object.entries(stored)) {
		it(`loads a stored ${kind} (${feature.geometry?.type})`, () => {
			const draw = startedDraw();
			const result = load(draw, c2FeatureToDrawFeature(feature));
			expect(result?.reason).toBeUndefined();
			expect(result?.valid).toBe(true);
			// It is in the store, under the mode the select flags are keyed by.
			const inStore = draw.getSnapshot().find((f) => f.id === result?.id);
			expect(inStore?.properties.mode).toBe(
				drawModeForGeometry(
					feature.geometry?.type as
						"Point" | "LineString" | "Polygon",
				),
			);
		});
	}

	it("can select the loaded feature (the editor selects it to show handles)", () => {
		const draw = startedDraw();
		const result = load(draw, c2FeatureToDrawFeature(stored.zone!));
		expect(() => draw.selectFeature(result!.id!)).not.toThrow();
		expect(draw.getMode()).toBe("select");
		const selected = draw.getSnapshot().find((f) => f.id === result?.id);
		expect(selected?.properties.selected).toBe(true);
	});

	it("loads coordinates stored with more decimals than terra-draw accepts", () => {
		// Imported or computed geometry routinely carries 13 to 15 decimals;
		// terra-draw refuses more than 9 ("excessive precision").
		const precise: C2Feature = {
			...stored.zone!,
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[4.350000000012345, 50.84000000000123],
						[4.36000000000987, 50.840000000004],
						[4.360000000003, 50.850000000007],
						[4.350000000012345, 50.84000000000123],
					],
				],
			},
		};
		const draw = startedDraw();
		const result = load(draw, c2FeatureToDrawFeature(precise));
		expect(result?.reason).toBeUndefined();
		expect(result?.valid).toBe(true);
	});

	it("ignores a stale stored mode and routes by geometry", () => {
		// An older build persisted terra-draw's `mode` as noise; a polygon
		// carrying `mode: "linestring"` must still load as a polygon.
		const noisy: C2Feature = {
			...stored.zone!,
			properties: { ...stored.zone!.properties, mode: "linestring" },
		};
		const drawn = c2FeatureToDrawFeature(noisy);
		expect((drawn?.properties as Record<string, unknown>).mode).toBe(
			"polygon",
		);
		const draw = startedDraw();
		expect(load(draw, drawn)?.valid).toBe(true);
	});

	it("a feature without its mode is refused (the defect this guards)", () => {
		const drawn = c2FeatureToDrawFeature(stored.waypoint!);
		const withoutMode = {
			...drawn!,
			properties: { ...(drawn!.properties as Record<string, unknown>) },
		};
		delete (withoutMode.properties as Record<string, unknown>).mode;
		const draw = startedDraw();
		const result = load(draw, withoutMode as DrawFeature);
		expect(result?.valid).toBe(false);
		expect(result?.reason).toBe("Mode property does not exist");
	});

	it("saves a moved waypoint with its new geometry and no terra-draw bookkeeping", () => {
		const draw = startedDraw();
		const result = load(draw, c2FeatureToDrawFeature(stored.waypoint!));
		// What a drag does to the store: the point's coordinates change.
		draw.updateFeatureGeometry(result!.id!, {
			type: "Point",
			coordinates: [4.3601, 50.8501],
		});
		const live = draw.getSnapshotFeature(
			result!.id!,
		) as unknown as DrawFeature;
		const saved = drawFeatureToC2Feature(live, {
			name: "Rally",
			feature_type: "waypoint",
			feature_id: "wp-1",
		});
		expect(saved.geometry).toEqual({
			type: "Point",
			coordinates: [4.3601, 50.8501],
		});
		expect(saved.properties?.feature_id).toBe("wp-1");
		expect(saved.properties?.mode).toBeUndefined();
		expect(saved.properties?.selected).toBeUndefined();
	});
});
