import { describe, expect, it } from "bun:test";

import { MissionBehavior } from "../types/c2-types";
import {
	duplicateMission,
	duplicateMissionDocuments,
	generateMissionId,
	newMissionStub,
	normalizeMissions,
} from "./mission-list";

describe("normalizeMissions (mission-browser list normalization)", () => {
	it("returns [] for null / non-array / unwrapped junk", () => {
		expect(normalizeMissions(null)).toEqual([]);
		expect(normalizeMissions(undefined)).toEqual([]);
		expect(normalizeMissions(42)).toEqual([]);
		expect(normalizeMissions({})).toEqual([]);
	});

	it("normalizes a bare array of missions", () => {
		const rows = normalizeMissions([
			{ mission_id: "m1", name: "Alpha", behavior: 1 },
			{ mission_id: "m2", name: "Bravo" },
		]);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			mission_id: "m1",
			name: "Alpha",
			behavior: MissionBehavior.COVERAGE,
		});
		expect(rows[1]).toMatchObject({ mission_id: "m2", name: "Bravo" });
		expect(rows[1]?.behavior).toBeUndefined();
	});

	it("unwraps a { missions: [...] } response", () => {
		const rows = normalizeMissions({
			missions: [{ mission_id: "m3", name: "Charlie" }],
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.mission_id).toBe("m3");
	});

	it("falls back to _id / id, and to the id as the name", () => {
		const rows = normalizeMissions([
			{ _id: "mongo-1" },
			{ id: "legacy-2", name: "" },
		]);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			mission_id: "mongo-1",
			name: "mongo-1",
		});
		expect(rows[1]).toMatchObject({
			mission_id: "legacy-2",
			name: "legacy-2",
		});
	});

	it("drops entries without a usable id", () => {
		const rows = normalizeMissions([
			{ name: "no id" },
			null,
			"string",
			{ mission_id: "" },
			{ mission_id: "ok" },
		]);
		expect(rows.map((r) => r.mission_id)).toEqual(["ok"]);
	});

	it("keeps the raw object for duplicate", () => {
		const raw = { mission_id: "m1", name: "Alpha", extra: { foo: 1 } };
		const rows = normalizeMissions([raw]);
		expect(rows[0]?.raw).toEqual(raw);
	});
});

describe("newMissionStub (minimal create)", () => {
	it("builds a minimal valid mission with a fresh id by default", () => {
		const stub = newMissionStub("My mission");
		expect(stub.name).toBe("My mission");
		expect(stub.behavior).toBe(MissionBehavior.NAVIGATE);
		expect(stub.objective).toEqual({ geometries: [] });
		expect(stub.vehicles).toEqual([]);
		expect(typeof stub.mission_id).toBe("string");
		expect(stub.mission_id.length).toBeGreaterThan(0);
	});

	it("honors an explicit behavior and id", () => {
		const stub = newMissionStub(
			"Cov",
			MissionBehavior.COVERAGE,
			"fixed-id",
		);
		expect(stub.behavior).toBe(MissionBehavior.COVERAGE);
		expect(stub.mission_id).toBe("fixed-id");
	});
});

describe("duplicateMission (save-a-copy)", () => {
	it("clones under a fresh id + new name, dropping Mongo _id", () => {
		const source = {
			_id: "mongo-internal",
			mission_id: "m1",
			name: "Alpha",
			behavior: 0,
			objective: { geometries: [{ feature_id: "f1" }] },
			vehicles: ["v1"],
		};
		const copy = duplicateMission(source, "Alpha (copy)");
		expect(copy._id).toBeUndefined();
		expect(copy.name).toBe("Alpha (copy)");
		expect(copy.mission_id).not.toBe("m1");
		expect(typeof copy.mission_id).toBe("string");
		// preserves the rest of the config
		expect(copy.objective).toEqual({ geometries: [{ feature_id: "f1" }] });
		expect(copy.vehicles).toEqual(["v1"]);
		// the source is not mutated
		expect(source.mission_id).toBe("m1");
		expect(source._id).toBe("mongo-internal");
	});
});

describe("duplicateMissionDocuments", () => {
	const source = {
		mission_id: "m1",
		name: "Alpha",
		graph_ref: "m1:graph",
		graph_compiles: true,
	};

	it("copies the graph under the copy's id and points the copy at it", () => {
		const graphDoc = {
			mission_id: "m1:graph",
			graph: {
				version: 3,
				nodes: [
					{
						id: "a",
						kind: "agent",
						label: "Es",
						position: { x: 0, y: 0 },
						agent_id: "robot-es",
					},
				],
				edges: [],
			},
		};
		const { mission, graph } = duplicateMissionDocuments(
			source,
			graphDoc,
			null,
			"Alpha (copy)",
		);
		expect(mission.mission_id).not.toBe("m1");
		// It used to keep "m1:graph": the fog, which looks the graph up by the
		// copy's own id, found none.
		expect(mission.graph_ref).toBe(`${String(mission.mission_id)}:graph`);
		expect(graph?.mission_id).toBe(`${String(mission.mission_id)}:graph`);
		expect((graph?.graph as { nodes: unknown[] }).nodes).toHaveLength(1);
	});

	it("drops the stale graph fields when the source has no graph", () => {
		const { mission, graph, assets } = duplicateMissionDocuments(
			source,
			null,
			null,
			"x",
		);
		expect(graph).toBeNull();
		expect(assets).toBeNull();
		expect(mission.graph_ref).toBeUndefined();
		expect(mission.graph_compiles).toBeUndefined();
	});

	it("copies the map and assets under the copy's id, keeping the asset ids", () => {
		const assetsDoc = {
			mission_id: "m1:assets",
			map: "RMA",
			features: [
				{
					type: "Feature",
					properties: { feature_id: "wp", feature_type: "waypoint" },
					geometry: { type: "Point", coordinates: [4.39, 50.84] },
				},
			],
		};
		const { mission, assets } = duplicateMissionDocuments(
			source,
			null,
			assetsDoc,
			"x",
		);
		expect(assets?.mission_id).toBe(`${String(mission.mission_id)}:assets`);
		expect(assets?.mission_ref).toBe(mission.mission_id);
		expect(assets?.map).toBe("RMA");
		expect(
			(assets?.features as { properties: { feature_id: string } }[])[0]
				?.properties.feature_id,
		).toBe("wp");
	});
});

describe("generateMissionId", () => {
	it("produces unique non-empty ids", () => {
		const a = generateMissionId();
		const b = generateMissionId();
		expect(a).not.toBe(b);
		expect(a.length).toBeGreaterThan(0);
	});
});
