import { describe, expect, it } from "bun:test";

import { buildOsmBuildingsQuery } from "./buildings";
import type { OverpassBuildingWay } from "./buildings";
import {
	osmBuildingsToExtrusionFc,
	osmBuildingsToRiskFeatures,
	parseBuildingHeight,
} from "./osm-buildings";
import type { GeofenceRing } from "./osm-to-features";

/** A simple 4-vertex (closed) building footprint inside the Brussels area. */
const houseA: OverpassBuildingWay = {
	type: "way",
	id: 501,
	tags: { building: "yes", name: "Town Hall", height: "12" },
	geometry: [
		{ lat: 50.842, lon: 4.392 },
		{ lat: 50.842, lon: 4.393 },
		{ lat: 50.843, lon: 4.393 },
		{ lat: 50.843, lon: 4.392 },
		{ lat: 50.842, lon: 4.392 }, // already closed
	],
};

/** A footprint whose ring is OPEN (first != last) and has addr tags. */
const houseOpen: OverpassBuildingWay = {
	type: "way",
	id: 502,
	tags: {
		building: "house",
		"addr:housenumber": "10",
		"addr:street": "Rue A",
		"building:levels": "3",
	},
	geometry: [
		{ lat: 50.8421, lon: 4.3921 },
		{ lat: 50.8421, lon: 4.3922 },
		{ lat: 50.8422, lon: 4.3922 },
	],
};

describe("buildOsmBuildingsQuery", () => {
	it("emits the (south,west,north,east) bbox order, building filter, out geom", () => {
		const q = buildOsmBuildingsQuery({
			minLon: 4.39,
			minLat: 50.84,
			maxLon: 4.4,
			maxLat: 50.85,
		});
		expect(q).toContain("(50.84,4.39,50.85,4.4)");
		expect(q).toContain('way["building"]');
		expect(q).toContain("out geom;");
		expect(q).toContain("[out:json][timeout:25];");
	});
});

describe("osmBuildingsToRiskFeatures", () => {
	it("converts a footprint to a closed risk Polygon in [lon, lat] order", () => {
		const feature = osmBuildingsToRiskFeatures([houseA])[0];
		expect(feature?.type).toBe("Feature");
		expect(feature?.geometry?.type).toBe("Polygon");
		expect(feature?.properties?.feature_type).toBe("risk");
		expect(feature?.properties?.osm_id).toBe(501);
		const ring = (feature?.geometry?.coordinates as number[][][])[0]!;
		// [lon, lat] order, single-ring nesting.
		expect(ring[0]).toEqual([4.392, 50.842]);
		// Closed: first == last vertex.
		expect(ring[0]).toEqual(ring[ring.length - 1]!);
	});

	it("closes an open ring (first vertex repeated last)", () => {
		const feature = osmBuildingsToRiskFeatures([houseOpen])[0];
		const ring = (feature?.geometry?.coordinates as number[][][])[0]!;
		expect(ring[0]).toEqual(ring[ring.length - 1]!);
		// Three distinct vertices + the appended closing vertex.
		expect(ring).toHaveLength(4);
	});

	it("omits feature_id (server assigns)", () => {
		const feature = osmBuildingsToRiskFeatures([houseA])[0];
		expect(feature?.properties?.feature_id).toBeUndefined();
	});

	it("names from tags.name, then addr:street + housenumber, then a fallback", () => {
		const noName: OverpassBuildingWay = {
			type: "way",
			id: 503,
			tags: { building: "yes" },
			geometry: houseA.geometry,
		};
		const features = osmBuildingsToRiskFeatures([
			houseA,
			houseOpen,
			noName,
		]);
		expect(features[0]?.properties?.name).toBe("Town Hall");
		expect(features[1]?.properties?.name).toBe("Rue A 10");
		expect(features[2]?.properties?.name).toBe("OSM building 503");
	});

	it("drops footprints with <3 distinct vertices", () => {
		const sliver: OverpassBuildingWay = {
			type: "way",
			id: 600,
			tags: { building: "yes" },
			geometry: [
				{ lat: 50.842, lon: 4.392 },
				{ lat: 50.843, lon: 4.393 },
				{ lat: 50.842, lon: 4.392 }, // closes back — only 2 distinct
			],
		};
		expect(osmBuildingsToRiskFeatures([sliver])).toHaveLength(0);
	});

	describe("geofence clipping", () => {
		// Unit square geofence over (4.39..4.40, 50.84..50.85).
		const ring: GeofenceRing = [
			[4.39, 50.84],
			[4.4, 50.84],
			[4.4, 50.85],
			[4.39, 50.85],
			[4.39, 50.84],
		];

		it("keeps a footprint with ≥1 vertex inside the geofence", () => {
			expect(osmBuildingsToRiskFeatures([houseA], ring)).toHaveLength(1);
		});

		it("drops a footprint entirely outside the geofence", () => {
			const outside: OverpassBuildingWay = {
				type: "way",
				id: 700,
				tags: { building: "yes" },
				geometry: [
					{ lat: 51.0, lon: 5.0 },
					{ lat: 51.0, lon: 5.1 },
					{ lat: 51.1, lon: 5.1 },
					{ lat: 51.0, lon: 5.0 },
				],
			};
			expect(osmBuildingsToRiskFeatures([outside], ring)).toHaveLength(0);
		});

		it("keeps all footprints when no geofence is given", () => {
			expect(
				osmBuildingsToRiskFeatures([houseA, houseOpen]),
			).toHaveLength(2);
		});
	});
});

describe("parseBuildingHeight", () => {
	it("reads tags.height in metres (plain and with a unit)", () => {
		expect(parseBuildingHeight({ height: "12" })).toBe(12);
		expect(parseBuildingHeight({ height: "12.5 m" })).toBe(12.5);
	});

	it("ignores imperial heights and falls through", () => {
		expect(
			parseBuildingHeight({ height: "40'", "building:levels": "4" }),
		).toBe(12);
	});

	it("falls back to building:levels × 3", () => {
		expect(parseBuildingHeight({ "building:levels": "5" })).toBe(15);
	});

	it("defaults to ~6m when no height tag implies one", () => {
		expect(parseBuildingHeight({ building: "yes" })).toBe(6);
		expect(parseBuildingHeight(undefined)).toBe(6);
	});

	it("ignores non-positive / non-finite values", () => {
		expect(parseBuildingHeight({ height: "0" })).toBe(6);
		expect(parseBuildingHeight({ height: "-3" })).toBe(6);
		expect(parseBuildingHeight({ height: "abc" })).toBe(6);
	});
});

describe("osmBuildingsToExtrusionFc", () => {
	it("builds a FeatureCollection of closed Polygons with a numeric height", () => {
		const fc = osmBuildingsToExtrusionFc([houseA, houseOpen]);
		expect(fc.type).toBe("FeatureCollection");
		expect(fc.features).toHaveLength(2);
		const first = fc.features[0]!;
		expect(first.geometry.type).toBe("Polygon");
		expect(first.properties.height).toBe(12);
		const ring = first.geometry.coordinates[0]!;
		expect(ring[0]).toEqual(ring[ring.length - 1]!);
		// building:levels 3 × 3 = 9 m
		expect(fc.features[1]!.properties.height).toBe(9);
	});

	it("clips to the geofence and drops degenerate footprints", () => {
		const ring: GeofenceRing = [
			[4.39, 50.84],
			[4.4, 50.84],
			[4.4, 50.85],
			[4.39, 50.85],
			[4.39, 50.84],
		];
		const outside: OverpassBuildingWay = {
			type: "way",
			id: 800,
			tags: { building: "yes" },
			geometry: [
				{ lat: 51.0, lon: 5.0 },
				{ lat: 51.0, lon: 5.1 },
				{ lat: 51.1, lon: 5.1 },
				{ lat: 51.0, lon: 5.0 },
			],
		};
		const fc = osmBuildingsToExtrusionFc([houseA, outside], ring);
		expect(fc.features).toHaveLength(1);
	});
});
