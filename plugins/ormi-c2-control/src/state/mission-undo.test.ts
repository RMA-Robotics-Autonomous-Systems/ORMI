import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetMissionAssetsStore,
	commitSavedAssets,
	editMissionAssets,
	getMissionAssets,
	isMissionAssetsDirty,
	missionAssetsSignature,
	placeMissionAssets,
	setMissionAssets,
} from "./mission-assets-store";
import {
	__resetMissionDraftStore,
	editMissionDraft,
	getMissionDraft,
	isMissionDraftDirty,
	setMissionDraft,
} from "./mission-draft-store";
import {
	__resetMissionGraphStore,
	editMissionGraph,
	getMissionGraph,
	isMissionGraphDirty,
	setMissionGraph,
} from "./mission-graph-store";
import {
	__resetMissionHistoryStore,
	canRedoMission,
	canUndoMission,
	clearMissionHistory,
	getMissionHistory,
	missionRedoLabel,
	missionUndoLabel,
} from "./mission-history-store";
import { editMission, redoMission, undoMission } from "./mission-undo";
import { MissionBehavior } from "../types/c2-types";
import type { MissionAssets } from "../widgets/mission-assets";
import type { MissionDraft } from "../widgets/mission-editor-helpers";
import type { MissionGraph, MissionGraphNode } from "../widgets/mission-graph";

const M = "m-1";

function draft(name = "Recon"): MissionDraft {
	return {
		mission_id: M,
		name,
		behavior: MissionBehavior.NAVIGATE,
		objective: { geometries: [] },
		vehicles: [],
	};
}

function graph(): MissionGraph {
	return { version: 3, nodes: [], edges: [] };
}

function node(id: string): MissionGraphNode {
	return { id, kind: "condition", label: id, position: { x: 0, y: 0 } };
}

const addNode =
	(id: string) =>
	(g: MissionGraph): MissionGraph => ({
		...g,
		nodes: [...g.nodes, node(id)],
	});

function asset(id: string) {
	return {
		type: "Feature" as const,
		properties: { feature_id: id, name: id, feature_type: "waypoint" },
		geometry: { type: "Point" as const, coordinates: [4.4, 50.8] },
	};
}

const addAsset =
	(id: string) =>
	(a: MissionAssets): MissionAssets =>
		({ ...a, features: [...a.features, asset(id)] }) as MissionAssets;

beforeEach(() => {
	__resetMissionDraftStore();
	__resetMissionGraphStore();
	__resetMissionAssetsStore();
	__resetMissionHistoryStore();
	setMissionDraft(draft());
	setMissionGraph(M, graph());
	setMissionAssets(M, { map: "RMA", features: [] }, true);
});

describe("one history across the mission's parts", () => {
	it("an asset imported, then a node added: undo takes the node, then the asset", () => {
		editMissionAssets(M, addAsset("gate"), { label: "Import gate" });
		editMissionGraph(M, addNode("n1"), { label: "Add node" });
		expect(missionUndoLabel(M)).toBe("Add node");

		expect(undoMission(M)).toBe("Add node");
		expect(getMissionGraph(M)?.nodes).toHaveLength(0);
		expect(getMissionAssets(M)?.features).toHaveLength(1);

		expect(undoMission(M)).toBe("Import gate");
		expect(getMissionAssets(M)?.features).toHaveLength(0);
		expect(canUndoMission(M)).toBe(false);

		// Both parts are back where they were loaded: nothing is unsaved.
		expect(isMissionGraphDirty(M)).toBe(false);
		expect(isMissionAssetsDirty(M)).toBe(false);

		expect(missionRedoLabel(M)).toBe("Import gate");
		redoMission(M);
		redoMission(M);
		expect(getMissionGraph(M)?.nodes).toHaveLength(1);
		expect(getMissionAssets(M)?.features).toHaveLength(1);
		expect(canRedoMission(M)).toBe(false);
	});

	it("editMission records a change to several parts as ONE step", () => {
		const changed = editMission(M, "Import and target", {
			assets: addAsset("gate"),
			graph: addNode("n1"),
		});
		expect(changed).toBe(true);
		expect(getMissionHistory(M).past).toHaveLength(1);
		undoMission(M);
		expect(getMissionGraph(M)?.nodes).toHaveLength(0);
		expect(getMissionAssets(M)?.features).toHaveLength(0);
	});

	it("editMission with nothing changed records nothing", () => {
		expect(
			editMission(M, "Nothing", { assets: (a) => a, graph: (g) => g }),
		).toBe(false);
		expect(canUndoMission(M)).toBe(false);
	});

	it("editMission leaves out a part that is not loaded", () => {
		editMission("m-2", "Nowhere", { graph: addNode("n1") });
		expect(canUndoMission("m-2")).toBe(false);
	});

	it("a draft write DERIVED from the graph is part of the graph's step", () => {
		editMissionGraph(M, addNode("n1"), { label: "Add node" });
		const derivedFrom = { graph: getMissionGraph(M) };
		editMissionDraft(M, (d) => ({ ...d, vehicles: ["robot-a"] }), {
			derivedFrom,
		});
		expect(getMissionHistory(M).past).toHaveLength(1);
		undoMission(M);
		expect(getMissionDraft(M)?.vehicles).toEqual([]);
		expect(isMissionDraftDirty(M)).toBe(false);
		expect(isMissionGraphDirty(M)).toBe(false);
		redoMission(M);
		expect(getMissionDraft(M)?.vehicles).toEqual(["robot-a"]);
	});

	it("a draft write derived from a LOADED graph records nothing", () => {
		editMissionAssets(M, addAsset("gate"));
		editMissionDraft(M, (d) => ({ ...d, vehicles: ["robot-a"] }), {
			derivedFrom: { graph: getMissionGraph(M) },
		});
		const last = getMissionHistory(M).past.at(-1);
		expect(last?.after.draft).toBeUndefined();
	});

	it("each mission keeps its own history", () => {
		setMissionGraph("m-2", graph());
		editMissionGraph(M, addNode("a"));
		editMissionGraph("m-2", addNode("b"));
		undoMission("m-2");
		expect(getMissionGraph(M)?.nodes).toHaveLength(1);
		expect(canUndoMission(M)).toBe(true);
		expect(canUndoMission("m-2")).toBe(false);
	});

	it("the history survives a save; an undo then makes the mission unsaved", () => {
		editMissionAssets(M, addAsset("gate"));
		const saved = getMissionAssets(M)!;
		commitSavedAssets(M, missionAssetsSignature(saved));
		expect(isMissionAssetsDirty(M)).toBe(false);
		undoMission(M);
		expect(isMissionAssetsDirty(M)).toBe(true);
		redoMission(M);
		expect(isMissionAssetsDirty(M)).toBe(false);
	});

	it("placing a mission on a map is no step", () => {
		setMissionAssets("m-3", { map: "", features: [] }, false);
		placeMissionAssets("m-3", "RMA");
		expect(canUndoMission("m-3")).toBe(false);
		expect(isMissionAssetsDirty("m-3")).toBe(false);
	});

	it("a reload with different content forgets the steps", () => {
		editMissionAssets(M, addAsset("gate"));
		setMissionAssets(M, { map: "RMA", features: [asset("remote")] }, true);
		expect(canUndoMission(M)).toBe(false);
	});

	it("a deleted mission's history is cleared", () => {
		editMissionGraph(M, addNode("n1"));
		clearMissionHistory(M);
		expect(undoMission(M)).toBeNull();
	});
});
