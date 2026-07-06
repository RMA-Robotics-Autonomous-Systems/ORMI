import { describe, expect, it } from "bun:test";

import type { C2Feature, MissionGeometry } from "../types/c2-types";

import {
	geofenceRings,
	objectivesOutsideGeofence,
} from "./mission-geofence-check";

/** A unit-square geofence around the origin (`[lon,lat]` outer ring). */
const geofence = (
	ring: [number, number][] = [
		[0, 0],
		[10, 0],
		[10, 10],
		[0, 10],
		[0, 0],
	],
	name = "fence",
): C2Feature => ({
	type: "Feature",
	properties: { feature_type: "geofence", name },
	geometry: { type: "Polygon", coordinates: [ring] },
});

/** An inline objective Point at `[[lon,lat]]` (FLAT single-vertex C2 form). */
const pointObjective = (lon: number, lat: number): MissionGeometry => ({
	geometry: { geometry_type: "Point", coordinates: [[lon, lat]] },
});

/** An inline objective LineString at `[[lon,lat],…]`. */
const lineObjective = (coords: [number, number][]): MissionGeometry => ({
	geometry: { geometry_type: "LineString", coordinates: coords },
});

describe("geofenceRings", () => {
	it("extracts only geofence polygon rings", () => {
		const features: C2Feature[] = [
			geofence(),
			{
				type: "Feature",
				properties: { feature_type: "road" },
				geometry: {
					type: "LineString",
					coordinates: [
						[0, 0],
						[1, 1],
					],
				},
			},
			{
				type: "Feature",
				properties: { feature_type: "risk" },
				geometry: {
					type: "Polygon",
					coordinates: [[[0, 0]]],
				},
			},
		];
		const rings = geofenceRings(features);
		expect(rings).toHaveLength(1);
		expect(rings[0]).toEqual([
			[0, 0],
			[10, 0],
			[10, 10],
			[0, 10],
			[0, 0],
		]);
	});

	it("ignores a geofence feature without Polygon geometry", () => {
		const bad: C2Feature = {
			type: "Feature",
			properties: { feature_type: "geofence" },
			geometry: {
				type: "LineString",
				coordinates: [
					[0, 0],
					[1, 1],
				],
			},
		};
		expect(geofenceRings([bad])).toHaveLength(0);
	});
});

describe("objectivesOutsideGeofence", () => {
	it("returns empty when there are no geofences (undeterminable)", () => {
		const objectives = [pointObjective(50, 50)];
		expect(objectivesOutsideGeofence(objectives, [])).toEqual([]);
	});

	it("flags an objective Point outside the geofence", () => {
		const objectives = [pointObjective(50, 50)];
		expect(objectivesOutsideGeofence(objectives, [geofence()])).toEqual([
			0,
		]);
	});

	it("does not flag an objective Point inside the geofence", () => {
		const objectives = [pointObjective(5, 5)];
		expect(objectivesOutsideGeofence(objectives, [geofence()])).toEqual([]);
	});

	it("treats a straddling line as inside (≥1 vertex inside)", () => {
		// One vertex inside (5,5), one far outside (50,50).
		const objectives = [
			lineObjective([
				[5, 5],
				[50, 50],
			]),
		];
		expect(objectivesOutsideGeofence(objectives, [geofence()])).toEqual([]);
	});

	it("flags a line whose every vertex is outside", () => {
		const objectives = [
			lineObjective([
				[50, 50],
				[60, 60],
			]),
		];
		expect(objectivesOutsideGeofence(objectives, [geofence()])).toEqual([
			0,
		]);
	});

	it("skips pure feature_id references", () => {
		const objectives: MissionGeometry[] = [{ feature_id: "abc-123" }];
		expect(objectivesOutsideGeofence(objectives, [geofence()])).toEqual([]);
	});

	it("considers a vertex inside ANY of multiple geofences", () => {
		const near = geofence();
		const far = geofence([
			[100, 100],
			[110, 100],
			[110, 110],
			[100, 110],
			[100, 100],
		]);
		// Point lives in the far geofence only — still inside.
		const objectives = [pointObjective(105, 105)];
		expect(objectivesOutsideGeofence(objectives, [near, far])).toEqual([]);
	});

	it("reports only the outside indices across a mixed list", () => {
		const objectives = [
			pointObjective(5, 5), // inside
			pointObjective(50, 50), // outside
			{ feature_id: "ref" }, // skipped
			pointObjective(99, 99), // outside
		];
		expect(objectivesOutsideGeofence(objectives, [geofence()])).toEqual([
			1, 3,
		]);
	});

	it("skips inline geometries with no usable coordinates", () => {
		const objectives: MissionGeometry[] = [
			{ geometry: { geometry_type: "Point", coordinates: [] } },
		];
		expect(objectivesOutsideGeofence(objectives, [geofence()])).toEqual([]);
	});

	it("returns empty for null/empty geometries", () => {
		expect(objectivesOutsideGeofence(null, [geofence()])).toEqual([]);
		expect(objectivesOutsideGeofence([], [geofence()])).toEqual([]);
	});
});
