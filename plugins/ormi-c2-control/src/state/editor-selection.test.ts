import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetEditorSelectionStore,
	clearEditorSelection,
	EMPTY_SELECTION,
	getEditorSelection,
	idsOfKey,
	requestReveal,
	type RevealRequest,
	sameSelection,
	selectedIdsOf,
	setEditorSelection,
	subscribeEditorSelection,
	subscribeReveal,
} from "./editor-selection-store";
import {
	focusAsset,
	getSelectedAsset,
	selectAsset,
	subscribeAssetFocus,
} from "./asset-focus-store";
import { focusGraphNode } from "./graph-focus-store";

beforeEach(() => {
	__resetEditorSelectionStore();
});

const node = (id: string) => ({ kind: "node" as const, missionId: "m1", id });
const asset = (id: string) => ({ kind: "asset" as const, missionId: "m1", id });
const feature = (id: string) => ({
	kind: "map-feature" as const,
	map: "site",
	id,
});

describe("the editor selection", () => {
	it("has one owner: a selection made in one panel replaces the other's", () => {
		setEditorSelection([node("a"), node("b")], "graph");
		expect(getEditorSelection().owner).toBe("graph");
		setEditorSelection([asset("gate")], "map");
		expect(getEditorSelection()).toEqual({
			items: [asset("gate")],
			owner: "map",
			group: false,
		});
		expect(selectedIdsOf(getEditorSelection(), "node", "m1")).toEqual([]);
	});

	it("replaces the state only on a real change, so snapshots stay stable", () => {
		let changes = 0;
		subscribeEditorSelection(() => changes++);
		setEditorSelection([node("a")], "graph");
		const first = getEditorSelection();
		setEditorSelection([node("a")], "graph");
		expect(getEditorSelection()).toBe(first);
		expect(changes).toBe(1);
		setEditorSelection([node("a")], "graph", { group: true });
		expect(changes).toBe(2);
		setEditorSelection([], "graph");
		expect(getEditorSelection()).toBe(EMPTY_SELECTION);
		setEditorSelection([], "map");
		expect(changes).toBe(3);
	});

	it("a panel letting go of its own selection never clears another's", () => {
		setEditorSelection([node("a")], "graph");
		clearEditorSelection("map");
		expect(getEditorSelection().items).toEqual([node("a")]);
		clearEditorSelection("graph");
		expect(getEditorSelection()).toBe(EMPTY_SELECTION);
		setEditorSelection([feature("road")], "map");
		clearEditorSelection();
		expect(getEditorSelection()).toBe(EMPTY_SELECTION);
	});

	it("reads ids by kind and scope", () => {
		setEditorSelection(
			[
				node("a"),
				{ kind: "edge", missionId: "m1", id: "e" },
				{ kind: "node", missionId: "m2", id: "x" },
			],
			"graph",
		);
		const selection = getEditorSelection();
		expect(selectedIdsOf(selection, "node", "m1")).toEqual(["a"]);
		expect(selectedIdsOf(selection, "edge", "m1")).toEqual(["e"]);
		expect(selectedIdsOf(selection, "node", null)).toEqual([]);
	});

	it("compares selections by owner, group and items in order", () => {
		const a = {
			items: [node("a"), node("b")],
			owner: "graph" as const,
			group: false,
		};
		expect(sameSelection(a, { ...a, items: [node("a"), node("b")] })).toBe(
			true,
		);
		expect(sameSelection(a, { ...a, items: [node("b"), node("a")] })).toBe(
			false,
		);
		expect(sameSelection(a, { ...a, owner: "map" })).toBe(false);
		expect(
			sameSelection(
				{ items: [asset("x")], owner: "map", group: false },
				{ items: [feature("x")], owner: "map", group: false },
			),
		).toBe(false);
	});

	it("splits an id key back, one shared empty array for none", () => {
		expect(idsOfKey("a\u0000b")).toEqual(["a", "b"]);
		expect(idsOfKey("")).toBe(idsOfKey(""));
	});

	it("reveals without selecting", () => {
		const seen: RevealRequest[] = [];
		subscribeReveal((request) => seen.push(request));
		requestReveal(node("a"));
		requestReveal(node("a"));
		expect(seen.map((r) => r.seq)).toEqual([1, 2]);
		expect(getEditorSelection()).toBe(EMPTY_SELECTION);
	});
});

describe("the adapters", () => {
	it("selecting an asset in the Assets panel is the selection; focusing also reveals it", () => {
		const reveals: string[] = [];
		subscribeAssetFocus((request) => reveals.push(request.featureId));
		selectAsset({ missionId: "m1", featureId: "gate" });
		expect(getEditorSelection().owner).toBe("assets");
		expect(getSelectedAsset()).toEqual({
			missionId: "m1",
			featureId: "gate",
		});
		expect(reveals).toEqual([]);
		focusAsset({ missionId: "m1", featureId: "gate" });
		expect(reveals).toEqual(["gate"]);
	});

	it("an asset picked on the map reads as the selected asset", () => {
		setEditorSelection([asset("gate")], "map");
		expect(getSelectedAsset()).toEqual({
			missionId: "m1",
			featureId: "gate",
		});
		setEditorSelection([feature("gate")], "map");
		expect(getSelectedAsset()).toBeNull();
	});

	it("focusing a graph node selects it in the node editor", () => {
		setEditorSelection([asset("gate")], "map");
		focusGraphNode("m1", "go");
		expect(getEditorSelection()).toEqual({
			items: [node("go")],
			owner: "graph",
			group: false,
		});
	});
});
