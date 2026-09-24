import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetMissionDraftStore,
	editMissionDraft,
	getMissionDraft,
	isMissionDraftDirty,
} from "./mission-draft-store";
import {
	__resetMissionGraphStore,
	editMissionGraph,
	isMissionGraphDirty,
	setMissionGraph,
} from "./mission-graph-store";
import {
	__resetMissionAssetsStore,
	editMissionAssets,
	isMissionAssetsDirty,
	isMissionAssetsStored,
	setMissionAssets,
} from "./mission-assets-store";
import { saveMissionWithGraph, type MissionSaveCalls } from "./mission-save";
import { type MissionAssets, upsertAsset } from "../widgets/mission-assets";
import type { MissionGraph } from "../widgets/mission-graph";

const MISSION = {
	mission_id: "m-1",
	name: "Alpha",
	behavior: 0,
	objective: { geometries: [] },
	vehicles: [],
	// A field this build has no UI for: the save must not drop it.
	operator_notes: "keep me",
};

/** Es navigates to one waypoint. */
function graph(): MissionGraph {
	const at = { x: 0, y: 0 };
	return {
		version: 2,
		nodes: [
			{
				id: "es",
				kind: "agent",
				label: "Es",
				position: at,
				agent_id: "robot-es",
			},
			{
				id: "go",
				kind: "action",
				label: "Go",
				position: at,
				action: "NAVIGATE",
			},
			{
				id: "wp",
				kind: "asset",
				label: "Hold",
				position: at,
				feature_id: "feat-wp",
			},
		],
		edges: [
			{
				id: "es-go",
				source: "es",
				source_port: "next",
				target: "go",
				target_port: "in",
			},
			{
				id: "wp-go",
				source: "wp",
				source_port: "value",
				target: "go",
				target_port: "target",
			},
		],
	};
}

/** The mission's map and its one waypoint (or a zone under the same id). */
function assets(type = "waypoint"): MissionAssets {
	return {
		map: "RMA",
		features: [
			{
				type: "Feature",
				properties: {
					feature_id: "feat-wp",
					feature_type: type,
					name: "Hold",
				},
				geometry:
					type === "zone"
						? {
								type: "Polygon",
								coordinates: [
									[
										[0, 0],
										[1, 0],
										[1, 1],
										[0, 0],
									],
								],
							}
						: { type: "Point", coordinates: [4.39, 50.84] },
			},
		],
	};
}

/** A fake mission store: what was written, in order. */
function store(
	overrides: Partial<{
		assetsFail: boolean;
		graphFails: boolean;
		missionFails: boolean;
	}> = {},
) {
	const written: Record<string, unknown>[] = [];
	const calls: MissionSaveCalls = {
		list: async () => ({ success: true, data: [MISSION] }),
		save: async (doc) => {
			const id = String(doc.mission_id);
			const isGraph = id.endsWith(":graph");
			const isAssets = id.endsWith(":assets");
			if (
				(isAssets && overrides.assetsFail) ||
				(isGraph && overrides.graphFails) ||
				(!isGraph && !isAssets && overrides.missionFails)
			) {
				return { success: false, error: "boom" };
			}
			written.push(doc);
			return { success: true };
		},
	};
	return { calls, written };
}

beforeEach(() => {
	__resetMissionDraftStore();
	__resetMissionGraphStore();
	__resetMissionAssetsStore();
});

describe("one Save mission", () => {
	it("writes the graph first, then the mission that points at it and describes it", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", assets(), true); // stored and clean: not rewritten
		editMissionGraph("m-1", (g) => ({ ...g })); // an unsaved edit
		const { calls, written } = store();

		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(true);
		expect(written.map((d) => d.mission_id)).toEqual(["m-1:graph", "m-1"]);
		const mission = written[1] as Record<string, unknown>;
		expect(mission.graph_ref).toBe("m-1:graph");
		expect(mission.vehicles).toEqual(["robot-es"]);
		expect(mission.graph_compiles).toBe(true);
		expect(mission.operator_notes).toBe("keep me"); // stored fields survive
		expect(isMissionGraphDirty("m-1")).toBe(false);
		expect(isMissionDraftDirty("m-1")).toBe(false);
	});

	it("loads the draft itself when no panel has, e.g. only the graph editor is open", async () => {
		setMissionGraph("m-1", graph());
		const { calls } = store();
		expect(getMissionDraft("m-1")).toBeNull();
		expect((await saveMissionWithGraph("m-1", calls)).ok).toBe(true);
		expect(getMissionDraft("m-1")?.name).toBe("Alpha");
	});

	it("writes no mission when the graph fails, and says nothing was written", async () => {
		setMissionGraph("m-1", graph());
		const { calls, written } = store({ graphFails: true });
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.stage).toBe("graph");
			expect(result.error).toContain("Nothing was written");
		}
		expect(written).toHaveLength(0);
	});

	it("says the graph was saved when the mission then fails", async () => {
		setMissionGraph("m-1", graph());
		const { calls } = store({ missionFails: true });
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.stage).toBe("mission");
			expect(result.graphSaved).toBe(true);
			expect(result.error).toContain("graph was saved");
		}
	});

	it("keeps an edit made while the save was in flight, and reports it", async () => {
		setMissionGraph("m-1", graph());
		const { calls } = store();
		const slowSave: MissionSaveCalls = {
			list: calls.list,
			save: async (doc) => {
				if (doc.mission_id === "m-1") {
					editMissionDraft("m-1", (d) => ({ ...d, name: "Bravo" }));
				}
				return calls.save(doc);
			},
		};
		const result = await saveMissionWithGraph("m-1", slowSave);
		expect(result.ok && result.keptDirty).toBe(true);
		expect(isMissionDraftDirty("m-1")).toBe(true);
		expect(getMissionDraft("m-1")?.name).toBe("Bravo");
	});

	it("compiles against the mission's assets, like the editor: a sweep of a waypoint does not compile", async () => {
		const sweep = graph();
		sweep.nodes[1] = { ...sweep.nodes[1]!, action: "COVERAGE" };
		setMissionGraph("m-1", sweep);
		setMissionAssets("m-1", assets("waypoint"), true);
		const { calls, written } = store();
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(true);
		expect((written[1] as Record<string, unknown>).graph_compiles).toBe(
			false,
		);
	});

	it("a target that is not one of the mission's assets does not compile", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", { map: "RMA", features: [] }, true);
		const { calls, written } = store();
		await saveMissionWithGraph("m-1", calls);
		expect((written[1] as Record<string, unknown>).graph_compiles).toBe(
			false,
		);
	});

	it("writes the map and assets first when they are not stored yet, then the graph and the mission", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", assets(), false);
		const { calls, written } = store();
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok && result.assetsSaved).toBe(true);
		expect(written.map((d) => d.mission_id)).toEqual([
			"m-1:assets",
			"m-1:graph",
			"m-1",
		]);
		expect(written[0]).toMatchObject({ map: "RMA", mission_ref: "m-1" });
		expect(isMissionAssetsStored("m-1")).toBe(true);
		expect((written[2] as Record<string, unknown>).graph_compiles).toBe(
			true,
		);
	});

	it("does not rewrite stored, unedited assets; writes edited ones", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", assets(), true);
		const first = store();
		await saveMissionWithGraph("m-1", first.calls);
		expect(
			first.written.some((d) => String(d.mission_id).endsWith(":assets")),
		).toBe(false);

		editMissionAssets("m-1", (a) =>
			upsertAsset(a, {
				...a.features[0]!,
				properties: { ...a.features[0]!.properties, name: "Hold 2" },
			}),
		);
		const second = store();
		await saveMissionWithGraph("m-1", second.calls);
		expect(second.written[0]!.mission_id).toBe("m-1:assets");
		expect(isMissionAssetsDirty("m-1")).toBe(false);
	});

	it("a save from the map alone re-derives graph_compiles from the stored graph", async () => {
		// Only the map is open: the graph is not loaded here. A target removed
		// from the assets must not leave the mission saying it compiles.
		setMissionAssets("m-1", { map: "RMA", features: [] }, true);
		editMissionAssets("m-1", (a) => ({ ...a, features: [] as never[] }));
		const written: Record<string, unknown>[] = [];
		const result = await saveMissionWithGraph("m-1", {
			list: async () => ({
				success: true,
				data: [
					{
						...MISSION,
						graph_ref: "m-1:graph",
						graph_compiles: true,
					},
					{ mission_id: "m-1:graph", graph: graph() },
				],
			}),
			save: async (doc) => {
				written.push(doc);
				return { success: true };
			},
		});
		expect(result.ok).toBe(true);
		const mission = written.find((d) => d.mission_id === "m-1");
		expect(mission?.graph_compiles).toBe(false);
		// The stored graph was only read, not rewritten.
		expect(written.some((d) => d.mission_id === "m-1:graph")).toBe(false);
	});

	it("refuses assets that are on no map, and writes nothing", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", { ...assets(), map: "" }, false);
		editMissionAssets("m-1", (a) => ({ ...a }));
		const { calls, written } = store();
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.stage).toBe("assets");
		expect(written).toEqual([]);
	});

	it("writes nothing else when the assets fail, and says so", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", assets(), false);
		const { calls, written } = store({ assetsFail: true });
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.stage).toBe("assets");
		expect(written).toEqual([]);
		expect(isMissionAssetsStored("m-1")).toBe(false);
	});

	it("does not save an empty canvas as the mission's graph", async () => {
		setMissionGraph("m-1", { version: 2, nodes: [], edges: [] });
		const { calls, written } = store();
		await saveMissionWithGraph("m-1", calls);
		// (The mission itself is refused: it has no vehicles yet.)
		expect(
			written.some((d) => String(d.mission_id).endsWith(":graph")),
		).toBe(false);
		expect(
			(getMissionDraft("m-1") as unknown as Record<string, unknown>)
				.graph_ref,
		).toBeUndefined();
	});

	it("marks a written graph saved even when the mission then fails", async () => {
		setMissionGraph("m-1", graph());
		editMissionGraph("m-1", (g) => ({ ...g }));
		const { calls } = store({ missionFails: true });
		await saveMissionWithGraph("m-1", calls);
		expect(isMissionGraphDirty("m-1")).toBe(false);
	});

	it("refuses a mission that is not in the store", async () => {
		const result = await saveMissionWithGraph("m-404", store().calls);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.stage).toBe("load");
	});
});
