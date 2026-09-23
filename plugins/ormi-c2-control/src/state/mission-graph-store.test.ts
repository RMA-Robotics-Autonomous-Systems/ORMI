import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetMissionGraphStore,
	commitSavedGraph,
	editMissionGraph,
	getMissionGraph,
	hasMissionGraph,
	isMissionGraphDirty,
	missionGraphSignature,
	setMissionGraph,
	subscribe,
} from "./mission-graph-store";
import { emptyMissionGraph, type MissionGraph } from "../widgets/mission-graph";

/** A graph with one agent node. */
function graph(label = "Agent"): MissionGraph {
	return {
		version: 2,
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
			version: 2,
			nodes: graph().nodes,
			edges: [
				{
					id: "e",
					source: "a",
					source_port: "next",
					target: "gone",
					target_port: "in",
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
