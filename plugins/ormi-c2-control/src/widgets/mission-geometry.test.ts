import { describe, expect, it } from "bun:test";

import { MissionBehavior, type MissionConfig } from "../types/c2-types";
import {
	inlineGeometryToGeoJSON,
	missionGeometriesToFeatureCollection,
} from "./mission-geometry";

describe("inlineGeometryToGeoJSON", () => {
	it("unwraps a 2-level single-vertex Point [[lng,lat]] to GeoJSON Point", () => {
		expect(inlineGeometryToGeoJSON("Point", [[4.39, 50.84]])).toEqual({
			type: "Point",
			coordinates: [4.39, 50.84],
		});
	});

	it("tolerates a legacy 1-level Point [lng,lat], no swap", () => {
		expect(inlineGeometryToGeoJSON("Point", [4.39, 50.84])).toEqual({
			type: "Point",
			coordinates: [4.39, 50.84],
		});
	});

	it("passes a LineString through (2-level vertex list)", () => {
		expect(
			inlineGeometryToGeoJSON("LineString", [
				[4.39, 50.84],
				[4.4, 50.85],
			]),
		).toEqual({
			type: "LineString",
			coordinates: [
				[4.39, 50.84],
				[4.4, 50.85],
			],
		});
	});

	it("re-wraps a flat Polygon ring into the GeoJSON outer-ring form", () => {
		expect(
			inlineGeometryToGeoJSON("Polygon", [
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 0],
			]),
		).toEqual({
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[1, 1],
					[0, 0],
				],
			],
		});
	});

	it("returns null for an unsupported / malformed geometry", () => {
		expect(inlineGeometryToGeoJSON("Point", [1])).toBeNull();
		expect(inlineGeometryToGeoJSON("LineString", [1, 2])).toBeNull();
		expect(inlineGeometryToGeoJSON("GeometryCollection", [])).toBeNull();
		expect(inlineGeometryToGeoJSON(undefined, [])).toBeNull();
	});
});

describe("missionGeometriesToFeatureCollection", () => {
	const mission: MissionConfig = {
		mission_id: "m-1",
		behavior: MissionBehavior.NAVIGATE,
		vehicles: ["a"],
		objective: {
			geometries: [
				{
					geometry: {
						geometry_type: "LineString",
						coordinates: [
							[4.39, 50.84],
							[4.4, 50.85],
						],
					},
				},
				{ feature_id: "stored-feature-ref" },
				{
					geometry: {
						geometry_type: "Polygon",
						coordinates: [
							[0, 0],
							[1, 0],
							[1, 1],
							[0, 0],
						],
					},
				},
			],
		},
	};

	it("projects only inline geometries, tagging each with its source index", () => {
		const fc = missionGeometriesToFeatureCollection(mission);
		expect(fc.type).toBe("FeatureCollection");
		expect(fc.features).toHaveLength(2);
		expect(fc.features[0]?.properties.index).toBe(0);
		expect(fc.features[0]?.geometry.type).toBe("LineString");
		// index 1 is a pure feature_id reference — skipped
		expect(fc.features[1]?.properties.index).toBe(2);
		expect(fc.features[1]?.geometry.type).toBe("Polygon");
	});

	it("tolerates a null / empty mission", () => {
		expect(missionGeometriesToFeatureCollection(null).features).toEqual([]);
		expect(
			missionGeometriesToFeatureCollection({
				behavior: MissionBehavior.NAVIGATE,
				vehicles: [],
				objective: { geometries: [] },
			}).features,
		).toEqual([]);
	});
});
