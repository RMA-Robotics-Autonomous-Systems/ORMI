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
import { saveMissionWithGraph, type MissionSaveCalls } from "./mission-save";
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

/** A fake mission store: what was written, in order. */
function store(
	overrides: Partial<{ graphFails: boolean; missionFails: boolean }> = {},
) {
	const written: Record<string, unknown>[] = [];
	const calls: MissionSaveCalls = {
		list: async () => ({ success: true, data: [MISSION] }),
		save: async (doc) => {
			const isGraph = String(doc.mission_id).endsWith(":graph");
			if (
				(isGraph && overrides.graphFails) ||
				(!isGraph && overrides.missionFails)
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
});

describe("one Save mission", () => {
	it("writes the graph first, then the mission that points at it and describes it", async () => {
		setMissionGraph("m-1", graph());
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

	it("compiles with the map's feature types, like the editor: a sweep of a waypoint does not compile", async () => {
		const sweep = graph();
		sweep.nodes[1] = { ...sweep.nodes[1]!, action: "COVERAGE" };
		setMissionGraph("m-1", sweep);
		const { calls, written } = store();
		const result = await saveMissionWithGraph("m-1", {
			...calls,
			featureTypes: { "feat-wp": "waypoint" },
		});
		expect(result.ok).toBe(true);
		expect((written[1] as Record<string, unknown>).graph_compiles).toBe(
			false,
		);
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
