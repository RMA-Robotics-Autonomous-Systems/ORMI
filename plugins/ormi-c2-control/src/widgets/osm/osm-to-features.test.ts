import { describe, expect, it } from "bun:test";

import { buildOverpassQuery } from "./overpass";
import type { OverpassWay } from "./overpass";
import {
	geofenceRingFromFeature,
	osmRoadsToFeatures,
	pointInPolygon,
	ringToBbox,
	type GeofenceRing,
} from "./osm-to-features";

/** A two-vertex drivable way inside the Brussels test area. */
const wayA: OverpassWay = {
	type: "way",
	id: 101,
	tags: { highway: "residential", name: "Rue A" },
	geometry: [
		{ lat: 50.842, lon: 4.392 },
		{ lat: 50.843, lon: 4.393 },
	],
};

/** A way with a `ref` but no `name`. */
const wayRef: OverpassWay = {
	type: "way",
	id: 102,
	tags: { highway: "primary", ref: "N5" },
	geometry: [
		{ lat: 50.842, lon: 4.392 },
		{ lat: 50.844, lon: 4.394 },
	],
};

/** A way with neither name nor ref. */
const wayNoName: OverpassWay = {
	type: "way",
	id: 103,
	tags: { highway: "track" },
	geometry: [
		{ lat: 50.842, lon: 4.392 },
		{ lat: 50.8425, lon: 4.3925 },
	],
};

describe("buildOverpassQuery", () => {
	it("emits the (south,west,north,east) bbox order and out geom", () => {
		const q = buildOverpassQuery({
			minLon: 4.39,
			minLat: 50.84,
			maxLon: 4.4,
			maxLat: 50.85,
		});
		expect(q).toContain("(50.84,4.39,50.85,4.4)");
		expect(q).toContain("out geom;");
		expect(q).toContain("[out:json][timeout:25];");
	});

	it("matches all drivable highway classes", () => {
		const q = buildOverpassQuery({
			minLon: 0,
			minLat: 0,
			maxLon: 1,
			maxLat: 1,
		});
		for (const hw of [
			"motorway",
			"trunk",
			"primary",
			"secondary",
			"tertiary",
			"unclassified",
			"residential",
			"service",
			"track",
		]) {
			expect(q).toContain(hw);
		}
	});
});

describe("osmRoadsToFeatures", () => {
	it("converts a way to a road LineString in [lon, lat] order", () => {
		const feature = osmRoadsToFeatures([wayA])[0];
		expect(feature?.type).toBe("Feature");
		expect(feature?.geometry?.type).toBe("LineString");
		expect(feature?.geometry?.coordinates).toEqual([
			[4.392, 50.842],
			[4.393, 50.843],
		]);
		expect(feature?.properties?.feature_type).toBe("road");
		expect(feature?.properties?.osm_id).toBe(101);
	});

	it("omits feature_id (server assigns)", () => {
		const feature = osmRoadsToFeatures([wayA])[0];
		expect(feature?.properties?.feature_id).toBeUndefined();
	});

	it("names from tags.name, then tags.ref, then a fallback", () => {
		const features = osmRoadsToFeatures([wayA, wayRef, wayNoName]);
		expect(features[0]?.properties?.name).toBe("Rue A");
		expect(features[1]?.properties?.name).toBe("N5");
		expect(features[2]?.properties?.name).toBe("OSM way 103");
	});

	it("drops degenerate ways with <2 vertices", () => {
		const single: OverpassWay = {
			type: "way",
			id: 200,
			geometry: [{ lat: 50.842, lon: 4.392 }],
		};
		const empty: OverpassWay = { type: "way", id: 201, geometry: [] };
		expect(osmRoadsToFeatures([single, empty, wayA])).toHaveLength(1);
	});

	it("drops nodes with non-finite coordinates", () => {
		const dirty: OverpassWay = {
			type: "way",
			id: 300,
			geometry: [
				{ lat: 50.842, lon: 4.392 },
				{ lat: Number.NaN, lon: 4.393 },
				{ lat: 50.844, lon: 4.394 },
			],
		};
		const feature = osmRoadsToFeatures([dirty])[0];
		expect(feature?.geometry?.coordinates).toEqual([
			[4.392, 50.842],
			[4.394, 50.844],
		]);
	});

	describe("geofence clipping", () => {
		// A unit square geofence around (4.39..4.40, 50.84..50.85).
		const ring: GeofenceRing = [
			[4.39, 50.84],
			[4.4, 50.84],
			[4.4, 50.85],
			[4.39, 50.85],
			[4.39, 50.84],
		];

		it("keeps a way with ≥1 vertex inside the geofence", () => {
			// wayA's vertices (4.392/4.393, 50.842/50.843) are inside.
			expect(osmRoadsToFeatures([wayA], ring)).toHaveLength(1);
		});

		it("drops a way entirely outside the geofence", () => {
			const outside: OverpassWay = {
				type: "way",
				id: 400,
				geometry: [
					{ lat: 51.0, lon: 5.0 },
					{ lat: 51.1, lon: 5.1 },
				],
			};
			expect(osmRoadsToFeatures([outside], ring)).toHaveLength(0);
		});

		it("keeps a way with one vertex inside and one outside", () => {
			const straddle: OverpassWay = {
				type: "way",
				id: 401,
				geometry: [
					{ lat: 50.845, lon: 4.395 }, // inside
					{ lat: 51.0, lon: 5.0 }, // outside
				],
			};
			expect(osmRoadsToFeatures([straddle], ring)).toHaveLength(1);
		});

		it("keeps all ways when no geofence is given", () => {
			const outside: OverpassWay = {
				type: "way",
				id: 402,
				geometry: [
					{ lat: 51.0, lon: 5.0 },
					{ lat: 51.1, lon: 5.1 },
				],
			};
			expect(osmRoadsToFeatures([wayA, outside])).toHaveLength(2);
		});

		it("ignores a degenerate ring (<3 vertices) and keeps all", () => {
			const tiny: GeofenceRing = [
				[4.39, 50.84],
				[4.4, 50.84],
			];
			const outside: OverpassWay = {
				type: "way",
				id: 403,
				geometry: [
					{ lat: 51.0, lon: 5.0 },
					{ lat: 51.1, lon: 5.1 },
				],
			};
			expect(osmRoadsToFeatures([outside], tiny)).toHaveLength(1);
		});
	});
});

describe("pointInPolygon", () => {
	const ring: GeofenceRing = [
		[0, 0],
		[10, 0],
		[10, 10],
		[0, 10],
		[0, 0],
	];

	it("returns true for an interior point", () => {
		expect(pointInPolygon([5, 5], ring)).toBe(true);
	});

	it("returns false for an exterior point", () => {
		expect(pointInPolygon([15, 5], ring)).toBe(false);
	});

	it("returns false for a degenerate ring", () => {
		expect(
			pointInPolygon(
				[5, 5],
				[
					[0, 0],
					[10, 0],
				],
			),
		).toBe(false);
	});
});

describe("ringToBbox", () => {
	it("computes the axis-aligned bbox of a ring", () => {
		expect(
			ringToBbox([
				[4.39, 50.84],
				[4.41, 50.83],
				[4.4, 50.86],
				[4.39, 50.84],
			]),
		).toEqual({
			minLon: 4.39,
			minLat: 50.83,
			maxLon: 4.41,
			maxLat: 50.86,
		});
	});

	it("returns null for an empty ring", () => {
		expect(ringToBbox([])).toBeNull();
	});

	it("skips malformed vertices", () => {
		expect(
			ringToBbox([
				[4.39, 50.84],
				[Number.NaN, 50.83] as [number, number],
				[4.4, 50.86],
			]),
		).toEqual({
			minLon: 4.39,
			minLat: 50.84,
			maxLon: 4.4,
			maxLat: 50.86,
		});
	});
});

describe("geofenceRingFromFeature", () => {
	it("extracts the outer ring of a Polygon geofence", () => {
		const ring = geofenceRingFromFeature({
			type: "Feature",
			properties: { feature_type: "geofence" },
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
		});
		expect(ring).toEqual([
			[4.39, 50.84],
			[4.4, 50.84],
			[4.4, 50.85],
			[4.39, 50.84],
		]);
	});

	it("returns null for a non-Polygon feature", () => {
		expect(
			geofenceRingFromFeature({
				type: "Feature",
				geometry: {
					type: "LineString",
					coordinates: [
						[4.39, 50.84],
						[4.4, 50.85],
					],
				},
			}),
		).toBeNull();
	});

	it("returns null for malformed coordinates", () => {
		expect(
			geofenceRingFromFeature({
				type: "Feature",
				geometry: { type: "Polygon", coordinates: [] },
			}),
		).toBeNull();
	});
});
