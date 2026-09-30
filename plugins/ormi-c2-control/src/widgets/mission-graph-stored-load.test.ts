/**
 * An outdated stored graph is a LOADED STATE OF ITS OWN, never an empty graph.
 *
 * The graph is the sole author of a mission's `vehicles` / `objective.geometries`
 * / `behavior`. Opening a mission whose stored graph this build cannot read used
 * to load an EMPTY graph for it, and because `graph_compiles` is already on the
 * draft of every mission this editor has ever saved, the empty-graph guard did
 * not catch it: the allocation was written away before the operator touched
 * anything, and Save persisted the loss.
 */

import { describe, expect, it } from "bun:test";

import {
	buildGraphDocument,
	compileMissionGraph,
	emptyMissionGraph,
	graphDocId,
	MISSION_GRAPH_VERSION,
	type MissionGraph,
} from "./mission-graph";
import {
	readStoredGraph,
	resolveGraphDraftWrite,
	type GraphDraftView,
} from "./mission-graph-editor-helpers";

const MISSION = "m1";

/** A graph with one allocated agent — something worth not losing. */
function authoredGraph(): MissionGraph {
	return {
		version: MISSION_GRAPH_VERSION,
		nodes: [
			{
				id: "a1",
				kind: "agent",
				label: "Rover",
				agent_id: "rover-1",
				position: { x: 0, y: 0 },
			},
		],
		edges: [],
	};
}

/** A stored document written by an editor of another schema version. */
function outdatedDocument() {
	return {
		mission_id: graphDocId(MISSION),
		kind: "mission_graph",
		mission_ref: MISSION,
		schema_version: 1,
		graph: { version: 1, nodes: [{ id: "old" }], edges: [] },
	};
}

describe("readStoredGraph", () => {
	it("reads a document of this schema version back", () => {
		const load = readStoredGraph(MISSION, {
			missions: [buildGraphDocument(MISSION, authoredGraph())],
		});
		expect(load.kind).toBe("graph");
		if (load.kind !== "graph") return;
		expect(load.graph.nodes.map((node) => node.id)).toEqual(["a1"]);
	});

	it("reports an outdated document as outdated, NOT as an empty graph", () => {
		const load = readStoredGraph(MISSION, {
			missions: [outdatedDocument()],
		});
		expect(load.kind).toBe("outdated");
		// The union is the point: there is no `.graph` to reach for.
		expect("graph" in load).toBe(false);
	});

	it("gives a mission with no graph document an empty canvas", () => {
		const load = readStoredGraph(MISSION, { missions: [] });
		expect(load).toEqual({ kind: "graph", graph: emptyMissionGraph() });
	});

	it("accepts a bare array payload as well as a { missions } envelope", () => {
		expect(readStoredGraph(MISSION, [outdatedDocument()]).kind).toBe(
			"outdated",
		);
		expect(readStoredGraph(MISSION, null).kind).toBe("graph");
	});

	it("does not confuse another mission's graph document with this one", () => {
		const load = readStoredGraph(MISSION, {
			missions: [buildGraphDocument("other", authoredGraph())],
		});
		expect(load).toEqual({ kind: "graph", graph: emptyMissionGraph() });
	});
});

describe("resolveGraphDraftWrite while the stored graph is outdated", () => {
	/** A draft this editor has authored before: `graph_compiles` is on it. */
	const authoredDraft: GraphDraftView = {
		vehicles: ["rover-1"],
		behavior: 0,
		graph_compiles: true,
		objective: { geometries: [] },
	};

	it("writes NOTHING, so a stored allocation survives merely opening the editor", () => {
		const empty = emptyMissionGraph();
		expect(
			resolveGraphDraftWrite(
				empty,
				compileMissionGraph(empty),
				authoredDraft,
				"outdated",
			),
		).toBeNull();
	});

	it("refuses even when the graph handed in is a real one", () => {
		const graph = authoredGraph();
		expect(
			resolveGraphDraftWrite(
				graph,
				compileMissionGraph(graph),
				authoredDraft,
				"outdated",
			),
		).toBeNull();
	});

	it("is what stops the empty write: the SAME inputs marked ready DO write", () => {
		const empty = emptyMissionGraph();
		const slice = resolveGraphDraftWrite(
			empty,
			compileMissionGraph(empty),
			authoredDraft,
			"ready",
		);
		// This is the regression, stated: an already-authored draft plus an empty
		// graph clears the allocation. Correct for a graph the operator emptied,
		// catastrophic for one this build simply could not read.
		expect(slice).not.toBeNull();
		expect(slice?.vehicles).toEqual([]);
		expect(slice?.geometries).toEqual([]);
	});
});

describe("resolveGraphDraftWrite on a genuinely new mission", () => {
	it("still writes nothing for an empty graph the operator has never authored", () => {
		const empty = emptyMissionGraph();
		expect(
			resolveGraphDraftWrite(empty, compileMissionGraph(empty), {
				vehicles: [],
				objective: { geometries: [] },
			}),
		).toBeNull();
	});

	it("still writes an authored graph's allocation, defaulting to ready", () => {
		const graph = authoredGraph();
		const slice = resolveGraphDraftWrite(
			graph,
			compileMissionGraph(graph),
			{ vehicles: [], objective: { geometries: [] } },
		);
		expect(slice?.vehicles).toEqual(["rover-1"]);
	});
});
