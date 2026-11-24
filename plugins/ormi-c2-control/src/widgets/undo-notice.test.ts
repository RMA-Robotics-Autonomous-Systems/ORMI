import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetMissionGraphStore,
	editMissionGraph,
	getMissionGraph,
	setMissionGraph,
} from "../state/mission-graph-store";
import {
	__resetMissionHistoryStore,
	missionUndoDepth,
	missionUndoLabel,
} from "../state/mission-history-store";
import { undoMission } from "../state/mission-undo";
import type { MissionGraph } from "./mission-graph";
import { deleteFromGraph } from "./mission-graph-editor-helpers";
import {
	graphDeletionText,
	isUndoNoticeLive,
	undoNoticeFor,
} from "./undo-notice";

const M = "m-1";

/** Agent → Navigate → Coverage, and a lone Condition. */
function chain(): MissionGraph {
	const node = (id: string, label: string) => ({
		id,
		kind: "action" as const,
		label,
		position: { x: 0, y: 0 },
	});
	return {
		version: 3,
		nodes: [
			node("a", "Agent"),
			node("n", "Navigate"),
			node("c", "Coverage"),
			node("k", "Condition"),
		],
		edges: [
			{
				id: "e1",
				source: "a",
				source_port: "out",
				target: "n",
				target_port: "in",
			},
			{
				id: "e2",
				source: "n",
				source_port: "out",
				target: "c",
				target_port: "in",
			},
		],
	};
}

const live = () => ({
	depth: missionUndoDepth(M),
	undoLabel: missionUndoLabel(M),
});

beforeEach(() => {
	__resetMissionGraphStore();
	__resetMissionHistoryStore();
	setMissionGraph(M, chain());
});

describe("deleteFromGraph", () => {
	it("takes a node's links with it and counts each link once", () => {
		const gone = deleteFromGraph(chain(), ["n"], ["e1"]);
		expect(gone.nodeLabels).toEqual(["Navigate"]);
		expect(gone.links).toBe(2);
		expect(gone.graph.nodes.map((n) => n.id)).toEqual(["a", "c", "k"]);
		expect(gone.graph.edges).toEqual([]);
	});

	it("deletes selected links alone", () => {
		const gone = deleteFromGraph(chain(), [], ["e2"]);
		expect(gone.nodeLabels).toEqual([]);
		expect(gone.links).toBe(1);
		expect(gone.graph.edges.map((e) => e.id)).toEqual(["e1"]);
	});

	it("returns the same graph when nothing matches", () => {
		const graph = chain();
		expect(deleteFromGraph(graph, ["x"], ["y"]).graph).toBe(graph);
	});
});

describe("graphDeletionText", () => {
	it("names one node, counts several as steps, and adds the links", () => {
		expect(graphDeletionText(["Navigate"], 0)).toBe("Deleted “Navigate”");
		expect(graphDeletionText(["Navigate"], 2)).toBe(
			"Deleted “Navigate” and 2 links",
		);
		expect(graphDeletionText(["A", "B", "C"], 0)).toBe("Deleted 3 steps");
		expect(graphDeletionText(["A", "B"], 1)).toBe(
			"Deleted 2 steps and 1 link",
		);
		expect(graphDeletionText([], 3)).toBe("Deleted 3 links");
	});
});

describe("the undo notice", () => {
	it("offers the deletion while it is the step on top, and Undo puts it back", () => {
		editMissionGraph(M, (g) => deleteFromGraph(g, ["n", "c"], []).graph, {
			label: "Delete nodes",
		});
		const notice = undoNoticeFor(M, "Deleted 2 steps");
		expect(notice).toEqual({
			missionId: M,
			text: "Deleted 2 steps",
			depth: 1,
			label: "Delete nodes",
		});
		expect(isUndoNoticeLive(notice, M, live())).toBe(true);

		undoMission(M);
		expect(getMissionGraph(M)?.nodes).toHaveLength(4);
		expect(getMissionGraph(M)?.edges).toHaveLength(2);
		// Taken back: the notice has nothing left to offer.
		expect(isUndoNoticeLive(notice, M, live())).toBe(false);
	});

	it("goes once anything else is done to the mission", () => {
		editMissionGraph(M, (g) => deleteFromGraph(g, ["k"], []).graph, {
			label: "Delete node",
		});
		const notice = undoNoticeFor(M, "Deleted “Condition”");
		editMissionGraph(M, (g) => ({ ...g, nodes: g.nodes.slice(1) }), {
			label: "Delete node",
		});
		// Same label, deeper history: not the deletion it offered.
		expect(isUndoNoticeLive(notice, M, live())).toBe(false);
	});

	it("is not shown for another mission, nor without a recorded step", () => {
		editMissionGraph(M, (g) => deleteFromGraph(g, ["k"], []).graph, {
			label: "Delete node",
		});
		const notice = undoNoticeFor(M, "Deleted “Condition”");
		expect(isUndoNoticeLive(notice, "m-2", live())).toBe(false);
		expect(undoNoticeFor("m-2", "Deleted")).toBeNull();
		expect(undoNoticeFor(null, "Deleted")).toBeNull();
	});
});
