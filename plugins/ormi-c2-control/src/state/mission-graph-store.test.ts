import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetMissionGraphStore,
	commitSavedGraph,
	editMissionGraph,
	getMissionGraph,
	hasMissionGraph,
	isMissionGraphDirty,
	missionGraphSignature,
	restoreMissionGraph,
	setMissionGraph,
	subscribe,
} from "./mission-graph-store";
import {
	__resetMissionHistoryStore,
	canRedoMission as canRedoMissionGraph,
	canUndoMission as canUndoMissionGraph,
	getMissionHistory,
} from "./mission-history-store";
import { redoMission, undoMission } from "./mission-undo";

const undoMissionGraph = (id: string) => undoMission(id) !== null;
const redoMissionGraph = (id: string) => redoMission(id) !== null;
import { emptyMissionGraph, type MissionGraph } from "../widgets/mission-graph";

/** A graph with one agent node. */
function graph(label = "Agent"): MissionGraph {
	return {
		version: 3,
		nodes: [
			{
				id: "a",
				kind: "agent",
				label,
				position: { x: 0, y: 0 },
				agent_id: "robot-a",
			},
		],
		edges: [],
	};
}

beforeEach(() => {
	__resetMissionGraphStore();
	__resetMissionHistoryStore();
});

describe("loading", () => {
	it("stores a graph clean", () => {
		setMissionGraph("m-1", graph());
		expect(hasMissionGraph("m-1")).toBe(true);
		expect(isMissionGraphDirty("m-1")).toBe(false);
		expect(getMissionGraph("m-1")?.nodes).toHaveLength(1);
	});

	it("is a NO-OP for an identical reload of a clean slot", () => {
		setMissionGraph("m-1", graph());
		const first = getMissionGraph("m-1");
		let notified = 0;
		subscribe(() => {
			notified += 1;
		});
		setMissionGraph("m-1", graph());
		// Reference-stable, and nothing re-rendered: the canvas's derived
		// memos must not churn on a refetch that changed nothing.
		expect(getMissionGraph("m-1")).toBe(first);
		expect(notified).toBe(0);
	});

	it("normalizes on the way in, so a stale document cannot break the canvas", () => {
		setMissionGraph("m-1", {
			version: 3,
			nodes: graph().nodes,
			edges: [
				{
					id: "e",
					source: "a",
					source_port: "agent",
					target: "gone",
					target_port: "agent",
				},
			],
		});
		expect(getMissionGraph("m-1")?.edges).toEqual([]);
	});

	it("counts an edit that changes nothing as no edit", () => {
		// A refused wire hands the same graph back: nothing is unsaved.
		setMissionGraph("m-1", graph());
		editMissionGraph("m-1", (g) => g);
		expect(isMissionGraphDirty("m-1")).toBe(false);
	});

	it("keeps missions apart", () => {
		setMissionGraph("m-1", graph("One"));
		setMissionGraph("m-2", graph("Two"));
		expect(getMissionGraph("m-1")?.nodes[0]?.label).toBe("One");
		expect(getMissionGraph("m-2")?.nodes[0]?.label).toBe("Two");
		expect(getMissionGraph(null)).toBeNull();
	});
});

describe("editing", () => {
	it("marks the slot dirty and yields a fresh object", () => {
		setMissionGraph("m-1", graph());
		const before = getMissionGraph("m-1");
		editMissionGraph("m-1", (current) => ({
			...current,
			nodes: [...current.nodes, current.nodes[0]!],
		}));
		expect(isMissionGraphDirty("m-1")).toBe(true);
		expect(getMissionGraph("m-1")).not.toBe(before);
	});

	it("is a no-op on a mission with no loaded graph", () => {
		editMissionGraph("nope", (current) => current);
		expect(hasMissionGraph("nope")).toBe(false);
	});
});

describe("commitSavedGraph", () => {
	it("clears dirty when nothing raced the save", () => {
		setMissionGraph("m-1", graph());
		editMissionGraph("m-1", (current) => ({
			...current,
			nodes: [...current.nodes],
		}));
		const signature = missionGraphSignature(getMissionGraph("m-1")!);
		expect(commitSavedGraph("m-1", signature)).toBe("committed");
		expect(isMissionGraphDirty("m-1")).toBe(false);
	});

	it("KEEPS a concurrent edit, and says so", () => {
		// The save awaits a round trip. An edit made during it must not have
		// its dirty flag cleared underneath the operator — that is how an edit
		// is lost together with the warning that would have mentioned it.
		setMissionGraph("m-1", graph());
		const signature = missionGraphSignature(getMissionGraph("m-1")!);
		editMissionGraph("m-1", (current) => ({
			...current,
			nodes: [{ ...current.nodes[0]!, label: "edited mid-save" }],
		}));
		expect(commitSavedGraph("m-1", signature)).toBe("kept-dirty");
		expect(isMissionGraphDirty("m-1")).toBe(true);
		expect(getMissionGraph("m-1")?.nodes[0]?.label).toBe("edited mid-save");
	});

	it("reports an absent slot rather than creating one", () => {
		expect(
			commitSavedGraph("m-1", missionGraphSignature(emptyMissionGraph())),
		).toBe("absent");
		expect(hasMissionGraph("m-1")).toBe(false);
	});
});

describe("undo and redo", () => {
	const relabel = (label: string) => (g: MissionGraph) => ({
		...g,
		nodes: g.nodes.map((n) => ({ ...n, label })),
	});
	const moveTo = (x: number) => (g: MissionGraph) => ({
		...g,
		nodes: g.nodes.map((n) => ({ ...n, position: { x, y: 0 } })),
	});

	it("takes edits back one by one, and does them again", () => {
		setMissionGraph("m-1", graph("A"));
		expect(canUndoMissionGraph("m-1")).toBe(false);
		editMissionGraph("m-1", relabel("B"));
		editMissionGraph("m-1", relabel("C"));
		expect(undoMissionGraph("m-1")).toBe(true);
		expect(getMissionGraph("m-1")?.nodes[0]?.label).toBe("B");
		expect(undoMissionGraph("m-1")).toBe(true);
		expect(getMissionGraph("m-1")?.nodes[0]?.label).toBe("A");
		expect(undoMissionGraph("m-1")).toBe(false);
		expect(redoMissionGraph("m-1")).toBe(true);
		expect(getMissionGraph("m-1")?.nodes[0]?.label).toBe("B");
		expect(canRedoMissionGraph("m-1")).toBe(true);
		// A new edit drops what could have been redone.
		editMissionGraph("m-1", relabel("D"));
		expect(canRedoMissionGraph("m-1")).toBe(false);
		expect(isMissionGraphDirty("m-1")).toBe(true);
	});

	it("takes a whole drag back in one step", () => {
		setMissionGraph("m-1", graph());
		for (const x of [10, 20, 30])
			editMissionGraph("m-1", moveTo(x), { gesture: "move:1" });
		editMissionGraph("m-1", moveTo(99), { gesture: "move:2" });
		undoMissionGraph("m-1");
		expect(getMissionGraph("m-1")?.nodes[0]?.position.x).toBe(30);
		undoMissionGraph("m-1");
		expect(getMissionGraph("m-1")?.nodes[0]?.position.x).toBe(0);
	});

	it("starts afresh when a graph is loaded", () => {
		setMissionGraph("m-1", graph("A"));
		editMissionGraph("m-1", relabel("B"));
		setMissionGraph("m-1", graph("Z"));
		expect(canUndoMissionGraph("m-1")).toBe(false);
	});

	it("an undo back to the saved graph leaves it clean, and a redo unsaved", () => {
		setMissionGraph("m-1", graph("A"));
		editMissionGraph("m-1", relabel("B"));
		expect(isMissionGraphDirty("m-1")).toBe(true);
		undoMissionGraph("m-1");
		expect(isMissionGraphDirty("m-1")).toBe(false);
		redoMissionGraph("m-1");
		expect(isMissionGraphDirty("m-1")).toBe(true);
	});

	it("an undo after a save makes the graph unsaved again", () => {
		setMissionGraph("m-1", graph("A"));
		editMissionGraph("m-1", relabel("B"));
		const saved = getMissionGraph("m-1")!;
		expect(commitSavedGraph("m-1", missionGraphSignature(saved))).toBe(
			"committed",
		);
		expect(isMissionGraphDirty("m-1")).toBe(false);
		expect(canUndoMissionGraph("m-1")).toBe(true);
		undoMissionGraph("m-1");
		expect(getMissionGraph("m-1")?.nodes[0]?.label).toBe("A");
		expect(isMissionGraphDirty("m-1")).toBe(true);
		redoMissionGraph("m-1");
		expect(isMissionGraphDirty("m-1")).toBe(false);
	});

	it("an edit that is not recorded is no step", () => {
		setMissionGraph("m-1", graph("A"));
		editMissionGraph("m-1", relabel("B"), { record: false });
		expect(canUndoMissionGraph("m-1")).toBe(false);
		expect(isMissionGraphDirty("m-1")).toBe(true);
	});

	it("restoring records nothing", () => {
		setMissionGraph("m-1", graph("A"));
		const before = getMissionHistory("m-1");
		restoreMissionGraph("m-1", graph("Q"));
		expect(getMissionGraph("m-1")?.nodes[0]?.label).toBe("Q");
		expect(getMissionHistory("m-1")).toBe(before);
		expect(isMissionGraphDirty("m-1")).toBe(true);
	});

	it("a first load keeps the steps another part recorded", () => {
		// A step recorded on another part (an asset imported on the map)
		// before the graph editor loaded the graph.
		setMissionGraph("m-2", graph("A"));
		editMissionGraph("m-2", relabel("B"));
		setMissionGraph("m-1", graph("A"));
		expect(canUndoMissionGraph("m-2")).toBe(true);
	});
});
