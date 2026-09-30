import { afterEach, describe, expect, it } from "bun:test";

import {
	__resetAssetFocusStore,
	focusAsset,
	getSelectedAsset,
	selectAsset,
	subscribeAssetFocus,
} from "../state/asset-focus-store";
import type { C2Feature } from "../types/c2-types";
import {
	assetCenter,
	assetTree,
	assetUses,
	importableAssets,
	renameAsset,
} from "./mission-asset-tree";
import type { MissionGraph } from "./mission-graph";

function feature(
	id: string,
	type: string,
	name: string,
	geometry: C2Feature["geometry"] = {
		type: "Point",
		coordinates: [4.39, 50.84],
	},
): C2Feature {
	return {
		type: "Feature",
		properties: { feature_id: id, feature_type: type, name },
		geometry,
	};
}

const at = { x: 0, y: 0 };
const graph: MissionGraph = {
	version: 3,
	nodes: [
		{
			id: "a1",
			kind: "asset",
			label: "Hold",
			position: at,
			feature_id: "wp",
		},
		{
			id: "go",
			kind: "action",
			label: "Go",
			position: at,
			action: "NAVIGATE",
			feature_id: "wp",
		},
		{
			id: "a2",
			kind: "asset",
			label: "Field",
			position: at,
			feature_id: "z",
		},
	],
	edges: [],
};

afterEach(() => {
	__resetAssetFocusStore();
});

describe("the asset tree", () => {
	it("groups the mission's assets by type, every group present, sorted by name", () => {
		const tree = assetTree(
			{
				map: "RMA",
				features: [
					feature("z", "zone", "Field"),
					feature("wp", "waypoint", "Hold"),
					feature("wp2", "waypoint", "Alpha"),
				],
			},
			graph,
		);
		expect(tree.map((g) => [g.type, g.leaves.map((l) => l.name)])).toEqual([
			["waypoint", ["Alpha", "Hold"]],
			["zone", ["Field"]],
			["cue", []],
		]);
	});

	it("says which graph nodes use each asset", () => {
		expect(assetUses(graph, "wp")).toEqual(["a1", "go"]);
		// A zone condition keyed on an asset uses it too.
		expect(
			assetUses(
				{
					...graph,
					nodes: [
						...graph.nodes,
						{
							id: "clear",
							kind: "condition",
							label: "Clear",
							position: at,
							condition: {
								op: "ZoneClear",
								key: "z",
								threshold: 1,
								negate: false,
							},
						},
					],
				},
				"z",
			),
		).toEqual(["a2", "clear"]);
		expect(assetUses(graph, "nope")).toEqual([]);
		expect(assetUses(null, "wp")).toEqual([]);
		const tree = assetTree(
			{ map: "RMA", features: [feature("wp", "waypoint", "Hold")] },
			graph,
		);
		expect(tree[0]?.leaves[0]?.usedBy).toEqual(["a1", "go"]);
	});

	it("offers the map's waypoints, zones and cues to import, never its roads", () => {
		const out = importableAssets([
			feature("r", "road", "Main road"),
			feature("z", "zone", "Field"),
			feature("w", "waypoint", "Hold"),
			feature("", "zone", "No id"),
		]);
		expect(out.map((f) => f.properties?.feature_id)).toEqual(["w", "z"]);
	});

	it("renames an asset, and returns the same object when nothing changes", () => {
		const assets = {
			map: "RMA",
			features: [feature("wp", "waypoint", "Hold")],
		};
		expect(renameAsset(assets, "wp", "Hold")).toBe(assets);
		expect(renameAsset(assets, "nope", "X")).toBe(assets);
		expect(
			renameAsset(assets, "wp", "Hold 2").features[0]?.properties?.name,
		).toBe("Hold 2");
	});

	it("finds the middle of a point and of a zone", () => {
		expect(assetCenter(feature("wp", "waypoint", "Hold"))).toEqual([
			4.39, 50.84,
		]);
		expect(
			assetCenter(
				feature("z", "zone", "Field", {
					type: "Polygon",
					coordinates: [
						[
							[4, 50],
							[4.2, 50],
							[4.2, 50.2],
							[4, 50],
						],
					],
				}),
			),
		).toEqual([4.1, 50.1]);
		expect(
			assetCenter(
				feature("x", "zone", "Empty", {
					type: "Polygon",
					coordinates: [],
				}),
			),
		).toBeNull();
	});
});

describe("asset selection, shared by the tree, the map and the graph", () => {
	it("selects without asking anyone to move, and focuses with a request each time", () => {
		const seen: number[] = [];
		subscribeAssetFocus((request) => seen.push(request.seq));
		selectAsset({ missionId: "m1", featureId: "wp" });
		expect(getSelectedAsset()).toEqual({
			missionId: "m1",
			featureId: "wp",
		});
		expect(seen).toEqual([]);
		focusAsset({ missionId: "m1", featureId: "wp" });
		focusAsset({ missionId: "m1", featureId: "wp" });
		expect(seen).toEqual([1, 2]); // the same asset can be asked for again
		selectAsset(null);
		expect(getSelectedAsset()).toBeNull();
	});
});
