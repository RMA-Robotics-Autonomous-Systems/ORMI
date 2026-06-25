import { describe, expect, it } from "bun:test";

import {
	c2FeatureToDrawFeature,
	drawFeatureToC2Feature,
	drawFeatureToInlineGeometry,
	readFeatureId,
	type DrawFeature,
} from "./feature-geojson";

/** A drawn polygon with explicit [lng, lat] coordinates. */
const drawnPolygon: DrawFeature = {
	type: "Feature",
	properties: {},
	geometry: {
		type: "Polygon",
		coordinates: [
			[
				[4.39, 50.84],
				[4.4, 50.84],
				[4.4, 50.85],
				[4.39, 50.84],
			],
		],
	},
};

const drawnPoint: DrawFeature = {
	type: "Feature",
	properties: {},
	geometry: { type: "Point", coordinates: [4.39, 50.84] },
};

describe("drawFeatureToC2Feature", () => {
	it("preserves [lng, lat] coordinates verbatim (no swap)", () => {
		const feature = drawFeatureToC2Feature(drawnPolygon, {
			name: "Zone A",
			feature_type: "geofence",
		});
		expect(feature.geometry?.type).toBe("Polygon");
		expect(feature.geometry?.coordinates).toEqual([
			[
				[4.39, 50.84],
				[4.4, 50.84],
				[4.4, 50.85],
				[4.39, 50.84],
			],
		]);
	});

	it("generates a feature_id on create when none supplied", () => {
		const feature = drawFeatureToC2Feature(drawnPoint, {
			name: "POI",
			feature_type: "poi",
		});
		const id = feature.properties?.feature_id;
		expect(typeof id).toBe("string");
		expect((id as string).length).toBeGreaterThan(0);
	});

	it("preserves the supplied feature_id on edit", () => {
		const feature = drawFeatureToC2Feature(drawnPoint, {
			name: "POI",
			feature_type: "poi",
			feature_id: "fixed-id-123",
		});
		expect(feature.properties?.feature_id).toBe("fixed-id-123");
	});

	it("carries name and feature_type into properties", () => {
		const feature = drawFeatureToC2Feature(drawnPolygon, {
			name: "Zone A",
			feature_type: "geofence",
		});
		expect(feature.properties?.name).toBe("Zone A");
		expect(feature.properties?.feature_type).toBe("geofence");
		expect(feature.type).toBe("Feature");
	});

	it("mints distinct ids across two creates", () => {
		const a = drawFeatureToC2Feature(drawnPoint, {
			name: "a",
			feature_type: "poi",
		});
		const b = drawFeatureToC2Feature(drawnPoint, {
			name: "b",
			feature_type: "poi",
		});
		expect(a.properties?.feature_id).not.toBe(b.properties?.feature_id);
	});
});

describe("readFeatureId", () => {
	it("reads the persisted feature_id", () => {
		expect(
			readFeatureId({
				type: "Feature",
				properties: { feature_id: "abc" },
				geometry: { type: "Point", coordinates: [0, 0] },
			}),
		).toBe("abc");
	});

	it("returns null when absent", () => {
		expect(
			readFeatureId({
				type: "Feature",
				geometry: { type: "Point", coordinates: [0, 0] },
			}),
		).toBeNull();
	});
});

describe("c2FeatureToDrawFeature", () => {
	it("round-trips a feature back to draw form preserving id and [lng,lat]", () => {
		const saved = drawFeatureToC2Feature(drawnPolygon, {
			name: "Zone A",
			feature_type: "geofence",
			feature_id: "round-trip-1",
		});
		const drawn = c2FeatureToDrawFeature(saved);
		expect(drawn).not.toBeNull();
		expect(drawn?.geometry.type).toBe("Polygon");
		expect(drawn?.geometry.coordinates).toEqual(
			drawnPolygon.geometry.coordinates,
		);
		expect((drawn?.properties as Record<string, unknown>).feature_id).toBe(
			"round-trip-1",
		);
		expect((drawn?.properties as Record<string, unknown>).name).toBe(
			"Zone A",
		);
	});

	it("returns null for an unusable geometry", () => {
		expect(
			c2FeatureToDrawFeature({
				type: "Feature",
				properties: { feature_id: "x" },
				geometry: { type: "GeometryCollection" },
			}),
		).toBeNull();
		expect(
			c2FeatureToDrawFeature({
				type: "Feature",
				properties: {},
			}),
		).toBeNull();
	});
});

describe("drawFeatureToInlineGeometry", () => {
	it("emits geometry_type + [lng,lat] coordinates with no swap", () => {
		const inline = drawFeatureToInlineGeometry(drawnPoint);
		expect(inline.geometry.geometry_type).toBe("Point");
		expect(inline.geometry.coordinates).toEqual([4.39, 50.84]);
	});
});
