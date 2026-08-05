import { describe, expect, it } from "bun:test";

import {
	normalizeMapFeatures,
	normalizeMaps,
	normalizePlannerGraph,
	normalizePlannerStatus,
} from "./map-registry";

describe("normalizeMaps", () => {
	it("normalizes a wrapped registry response", () => {
		const maps = normalizeMaps({
			maps: [
				{
					name: "Zone A",
					collection: "map_zone_a",
					crs: "EPSG:4326",
					bounds: {
						minLon: 4.3,
						minLat: 50.8,
						maxLon: 4.4,
						maxLat: 50.9,
					},
					feature_count: 7,
					updated_at: "2026-01-01T00:00:00Z",
				},
			],
		});
		expect(maps).toHaveLength(1);
		expect(maps[0]).toEqual({
			name: "Zone A",
			collection: "map_zone_a",
			crs: "EPSG:4326",
			bounds: { minLon: 4.3, minLat: 50.8, maxLon: 4.4, maxLat: 50.9 },
			feature_count: 7,
			updated_at: "2026-01-01T00:00:00Z",
		});
	});

	it("accepts a bare array and defaults feature_count to 0", () => {
		const maps = normalizeMaps([{ name: "Bare" }]);
		expect(maps).toEqual([
			{
				name: "Bare",
				collection: undefined,
				crs: undefined,
				bounds: null,
				feature_count: 0,
				updated_at: undefined,
			},
		]);
	});

	it("returns null bounds when incomplete", () => {
		const maps = normalizeMaps({
			maps: [{ name: "Partial", bounds: { minLon: 4.3, minLat: 50.8 } }],
		});
		expect(maps[0]?.bounds).toBeNull();
	});

	it("drops entries without a usable name and tolerates null", () => {
		expect(normalizeMaps(null)).toEqual([]);
		expect(
			normalizeMaps({ maps: [{ name: "" }, { crs: "x" }, 5] }),
		).toEqual([]);
	});
});

describe("normalizeMapFeatures", () => {
	it("reads a FeatureCollection and keeps only geometry-bearing entries", () => {
		const features = normalizeMapFeatures({
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					geometry: { type: "Point", coordinates: [0, 0] },
				},
				{ type: "Feature", properties: {} },
				null,
			],
		});
		expect(features).toHaveLength(1);
		expect(features[0]?.geometry?.type).toBe("Point");
	});

	it("accepts a bare array and tolerates null", () => {
		expect(normalizeMapFeatures(null)).toEqual([]);
		expect(
			normalizeMapFeatures([
				{ geometry: { type: "LineString", coordinates: [] } },
			]),
		).toHaveLength(1);
	});
});

describe("normalizePlannerStatus", () => {
	it("normalizes a full status", () => {
		expect(
			normalizePlannerStatus({
				loaded_map: "Zone A",
				mode: "ready",
				agent_count: 3,
				graph_nodes: 120,
				error: null,
				updated_at: "2026-01-01T00:00:00Z",
			}),
		).toEqual({
			loaded_map: "Zone A",
			mode: "ready",
			agent_count: 3,
			graph_nodes: 120,
			error: null,
			note: undefined,
			updated_at: "2026-01-01T00:00:00Z",
		});
	});

	it("tolerates the pre-report shape", () => {
		const status = normalizePlannerStatus({
			loaded_map: null,
			note: "planner has not reported yet",
		});
		expect(status?.loaded_map).toBeNull();
		expect(status?.note).toBe("planner has not reported yet");
		expect(status?.graph_nodes).toBeUndefined();
	});

	it("returns null for a non-object payload", () => {
		expect(normalizePlannerStatus("oops")).toBeNull();
		expect(normalizePlannerStatus(null)).toBeNull();
	});
});

describe("normalizePlannerGraph", () => {
	it("extracts a populated featureCollection (nodes + edges)", () => {
		const graph = normalizePlannerGraph({
			loaded_map: "Zone A",
			node_count: 2,
			featureCollection: {
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						geometry: { type: "Point", coordinates: [4.3, 50.8] },
						properties: {},
					},
					{
						type: "Feature",
						geometry: {
							type: "LineString",
							coordinates: [
								[4.3, 50.8],
								[4.4, 50.9],
							],
						},
						properties: { length: 1, risk: 0 },
					},
				],
			},
			updated_at: "2026-06-26T00:00:00Z",
		});
		expect(graph.type).toBe("FeatureCollection");
		expect(graph.features).toHaveLength(2);
	});

	it("returns an empty FeatureCollection for the pre-report (note) shape", () => {
		const graph = normalizePlannerGraph({
			loaded_map: null,
			node_count: 0,
			featureCollection: { type: "FeatureCollection", features: [] },
			note: "planner has not reported a graph yet",
		});
		expect(graph.type).toBe("FeatureCollection");
		expect(graph.features).toEqual([]);
	});

	it("accepts a bare FeatureCollection at the top level", () => {
		const graph = normalizePlannerGraph({
			type: "FeatureCollection",
			features: [{ type: "Feature", geometry: null, properties: {} }],
		});
		expect(graph.features).toHaveLength(1);
	});

	it("tolerates a malformed / missing featureCollection", () => {
		expect(normalizePlannerGraph(null).features).toEqual([]);
		expect(normalizePlannerGraph("oops").features).toEqual([]);
		expect(normalizePlannerGraph({}).features).toEqual([]);
		expect(
			normalizePlannerGraph({ featureCollection: { features: "no" } })
				.features,
		).toEqual([]);
	});
});
