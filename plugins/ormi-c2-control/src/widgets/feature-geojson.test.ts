import { describe, expect, it } from "bun:test";

import {
	c2FeatureToDrawFeature,
	drawFeatureToC2Feature,
	drawFeatureToInlineGeometry,
	readFeatureId,
	type DrawFeature,
} from "./feature-geojson";
import { hasUsableCoordinates } from "./mission-editor-helpers";
import { inlineToDrawFeature } from "./mission-geometry";

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

const drawnLine: DrawFeature = {
	type: "Feature",
	properties: {},
	geometry: {
		type: "LineString",
		coordinates: [
			[4.39, 50.84],
			[4.4, 50.85],
		],
	},
};

describe("drawFeatureToInlineGeometry", () => {
	it("wraps a Point into a 2-level single-vertex list [[lng,lat]], no swap", () => {
		const inline = drawFeatureToInlineGeometry(drawnPoint);
		expect(inline.geometry.geometry_type).toBe("Point");
		expect(inline.geometry.coordinates).toEqual([[4.39, 50.84]]);
	});

	it("produces a single-vertex Point usable as C2 inline geometry", () => {
		// A single-vertex Point yields a 2-level list [[lon,lat]], which the C2
		// mission parser (and hasUsableCoordinates) accept as a valid vertex list.
		const inline = drawFeatureToInlineGeometry(drawnPoint);
		expect(hasUsableCoordinates(inline.geometry.coordinates)).toBe(true);
		const coords = inline.geometry.coordinates as number[][];
		expect(coords).toHaveLength(1);
		expect(coords[0]).toHaveLength(2);
		expect(typeof coords[0]?.[0]).toBe("number");
		expect(typeof coords[0]?.[1]).toBe("number");
	});

	it("passes a LineString through as a 2-level vertex list", () => {
		const inline = drawFeatureToInlineGeometry(drawnLine);
		expect(inline.geometry.geometry_type).toBe("LineString");
		expect(inline.geometry.coordinates).toEqual([
			[4.39, 50.84],
			[4.4, 50.85],
		]);
	});

	it("flattens a GeoJSON Polygon to its outer ring (2-level), preserving [lng,lat]", () => {
		const polygon: DrawFeature = {
			type: "Feature",
			properties: {},
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0],
					],
				],
			},
		};
		const inline = drawFeatureToInlineGeometry(polygon);
		expect(inline.geometry.geometry_type).toBe("Polygon");
		expect(inline.geometry.coordinates).toEqual([
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 0],
		]);
	});

	it("tolerates an odd/missing coordinates value without throwing", () => {
		const odd = {
			type: "Feature",
			properties: {},
			geometry: { type: "Polygon", coordinates: undefined },
		} as unknown as DrawFeature;
		expect(() => drawFeatureToInlineGeometry(odd)).not.toThrow();
		expect(drawFeatureToInlineGeometry(odd).geometry.coordinates).toBe(
			undefined,
		);
	});
});

describe("inline geometry round-trip (draw → inline → draw)", () => {
	/** draw → inline → draw, returning the recovered GeoJSON geometry. */
	function roundTrip(drawn: DrawFeature) {
		const inline = drawFeatureToInlineGeometry(drawn);
		const recovered = inlineToDrawFeature(inline.geometry);
		return recovered?.geometry ?? null;
	}

	it("round-trips a Point, recovering the GeoJSON [lng,lat] (order preserved)", () => {
		const inline = drawFeatureToInlineGeometry(drawnPoint);
		// Serializes to the 2-level single-vertex list contract.
		expect(inline.geometry.coordinates).toEqual([[4.39, 50.84]]);
		const recovered = roundTrip(drawnPoint);
		expect(recovered).toEqual({
			type: "Point",
			coordinates: [4.39, 50.84],
		});
	});

	it("round-trips a LineString, preserving every [lng,lat] vertex", () => {
		const recovered = roundTrip(drawnLine);
		expect(recovered).toEqual({
			type: "LineString",
			coordinates: [
				[4.39, 50.84],
				[4.4, 50.85],
			],
		});
	});

	it("round-trips a Polygon, preserving the outer ring [lng,lat] order", () => {
		const recovered = roundTrip(drawnPolygon);
		expect(recovered).toEqual({
			type: "Polygon",
			coordinates: [
				[
					[4.39, 50.84],
					[4.4, 50.84],
					[4.4, 50.85],
					[4.39, 50.84],
				],
			],
		});
	});
});
