import { describe, expect, it } from "bun:test";

import type { EditorSelection, SelItem } from "../state/editor-selection-store";
import type { MissionGraph } from "./mission-graph";
import { relatedItems } from "./related-items";

const M = "m1";
const MAP = "site";

/** Navigate to the gate, sweep the yard, wait until the pond holds. */
const GRAPH = {
	version: 3,
	nodes: [
		{ id: "agent", kind: "agent", label: "UGV", position: { x: 0, y: 0 } },
		{
			id: "nav",
			kind: "action",
			action: "NAVIGATE",
			label: "Navigate",
			feature_id: "gate",
			position: { x: 0, y: 0 },
		},
		{
			id: "sweep",
			kind: "action",
			action: "COVERAGE",
			label: "Coverage",
			feature_id: "yard",
			position: { x: 0, y: 0 },
		},
		{
			id: "when",
			kind: "condition",
			label: "When",
			condition: { key: "gate" },
			position: { x: 0, y: 0 },
		},
		{
			id: "lib",
			kind: "asset",
			label: "Road",
			feature_id: "road-7",
			position: { x: 0, y: 0 },
		},
	],
	edges: [],
} as unknown as MissionGraph;

const ASSETS = new Set(["gate", "yard"]);

function sel(
	items: SelItem[],
	owner: EditorSelection["owner"],
): EditorSelection {
	return { items, owner, group: false };
}

const related = (selection: EditorSelection) =>
	relatedItems(selection, M, GRAPH, ASSETS, MAP);

describe("relatedItems", () => {
	it("a selected node relates to the asset it targets", () => {
		expect(
			related(sel([{ kind: "node", missionId: M, id: "nav" }], "graph")),
		).toEqual([{ kind: "asset", missionId: M, id: "gate" }]);
	});

	it("several nodes relate to each asset once", () => {
		expect(
			related(
				sel(
					[
						{ kind: "node", missionId: M, id: "nav" },
						{ kind: "node", missionId: M, id: "when" },
						{ kind: "node", missionId: M, id: "sweep" },
					],
					"graph",
				),
			),
		).toEqual([
			{ kind: "asset", missionId: M, id: "gate" },
			{ kind: "asset", missionId: M, id: "yard" },
		]);
	});

	it("a target that is not a mission asset is a feature of the mission's map", () => {
		expect(
			related(sel([{ kind: "node", missionId: M, id: "lib" }], "graph")),
		).toEqual([{ kind: "map-feature", map: MAP, id: "road-7" }]);
	});

	it("a selected asset relates to every node that targets it", () => {
		expect(
			related(sel([{ kind: "asset", missionId: M, id: "gate" }], "map")),
		).toEqual([
			{ kind: "node", missionId: M, id: "nav" },
			{ kind: "node", missionId: M, id: "when" },
		]);
		expect(
			related(
				sel([{ kind: "map-feature", map: MAP, id: "road-7" }], "map"),
			),
		).toEqual([{ kind: "node", missionId: M, id: "lib" }]);
	});

	it("nodes without a target, links and other missions relate to nothing", () => {
		expect(
			related(
				sel([{ kind: "node", missionId: M, id: "agent" }], "graph"),
			),
		).toEqual([]);
		expect(
			related(sel([{ kind: "edge", missionId: M, id: "e1" }], "graph")),
		).toEqual([]);
		expect(
			related(
				sel([{ kind: "node", missionId: "m2", id: "nav" }], "graph"),
			),
		).toEqual([]);
		expect(
			related(
				sel(
					[{ kind: "map-feature", map: "other", id: "road-7" }],
					"map",
				),
			),
		).toEqual([]);
	});

	it("nothing without a mission, a graph or a selection", () => {
		const one = sel([{ kind: "node", missionId: M, id: "nav" }], "graph");
		expect(relatedItems(one, null, GRAPH, ASSETS, MAP)).toEqual([]);
		expect(relatedItems(one, M, null, ASSETS, MAP)).toEqual([]);
		expect(relatedItems(sel([], null), M, GRAPH, ASSETS, MAP)).toEqual([]);
	});
});
