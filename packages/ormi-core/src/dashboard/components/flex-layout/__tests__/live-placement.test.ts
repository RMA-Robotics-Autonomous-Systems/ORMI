/**
 * Adding a widget must not replace the FlexLayout model.
 *
 * FlexLayout renders a tab's content only once its node has a measured size,
 * and every node of a freshly built model starts unmeasured, so a rebuilt
 * model drops every existing panel for a render and remounts every widget. A
 * WebRTC viewer then closes its peer connection and negotiates again each
 * time any widget is added. These tests pin the property that prevents it:
 * the nodes that existed before an add are the same objects after it.
 */
import { describe, expect, test } from "bun:test";
import { Model } from "flexlayout-react";
import type { IJsonModel, IJsonTabNode, TabSetNode } from "flexlayout-react";

import { addTabsToModel } from "../live-placement";
import { placeNewTabs } from "../widget-placement";

const tab = (id: string): IJsonTabNode => ({
	type: "tab",
	id,
	name: id,
	component: id,
	config: {},
});

const modelWith = (ids: string[]): Model =>
	Model.fromJson({
		global: {},
		layout: {
			type: "row",
			id: "root",
			weight: 100,
			children: [
				{
					type: "tabset",
					id: "ts1",
					weight: 100,
					children: ids.map(tab),
				},
			],
		},
	} as IJsonModel);

/** Tab ids per tabset, in document order, with each tabset's weight. */
const shape = (model: Model) => {
	const out: { tabs: string[]; weight: number }[] = [];
	model.visitNodes((node) => {
		if (node.getType() !== "tabset") return;
		out.push({
			tabs: node.getChildren().map((child) => child.getId()),
			weight: (node as TabSetNode).getWeight(),
		});
	});
	return out;
};

/** The same reduction over a layout JSON, for comparing with `placeNewTabs`. */
const jsonShape = (
	node: any,
	out: { tabs: string[]; weight: number }[] = [],
) => {
	if (node.type === "tabset") {
		out.push({
			tabs: (node.children ?? []).map((child: any) => child.id),
			weight: node.weight ?? 100,
		});
	} else {
		for (const child of node.children ?? []) jsonShape(child, out);
	}
	return out;
};

const WIDE = {
	root: { width: 1600, height: 900 },
	ts1: { width: 1600, height: 900 },
};

describe("addTabsToModel", () => {
	test("keeps every existing node when a widget is added", () => {
		const model = modelWith(["w1"]);
		const tabBefore = model.getNodeById("w1");
		const tabsetBefore = model.getNodeById("ts1");

		const left = addTabsToModel(model, [tab("w2")], WIDE);

		expect(left).toEqual([]);
		expect(model.getNodeById("w1")).toBe(tabBefore!);
		expect(model.getNodeById("ts1")).toBe(tabsetBefore!);
		expect(model.getNodeById("w2")).toBeDefined();
	});

	test("splits a wide panel side by side", () => {
		const model = modelWith(["w1"]);
		addTabsToModel(model, [tab("w2")], WIDE);
		expect(shape(model)).toEqual([
			{ tabs: ["w1"], weight: 50 },
			{ tabs: ["w2"], weight: 50 },
		]);
	});

	test("keeps the existing node when the split wraps it in a new row", () => {
		const model = modelWith(["w1"]);
		const tabBefore = model.getNodeById("w1");
		// A tall panel splits top/bottom, across the root row's axis.
		const sizes = {
			root: { width: 600, height: 1200 },
			ts1: { width: 600, height: 1200 },
		};

		addTabsToModel(model, [tab("w2")], sizes);

		expect(model.getNodeById("w1")).toBe(tabBefore!);
		expect(shape(model).map((entry) => entry.tabs)).toEqual([
			["w1"],
			["w2"],
		]);
	});

	test("stacks and selects when the halves would be too small", () => {
		const model = modelWith(["w1"]);
		const sizes = {
			root: { width: 400, height: 300 },
			ts1: { width: 400, height: 300 },
		};

		addTabsToModel(model, [tab("w2")], sizes);

		const tabset = model.getNodeById("ts1") as TabSetNode;
		expect(shape(model)).toEqual([{ tabs: ["w1", "w2"], weight: 100 }]);
		expect(tabset.getSelectedNode()?.getId()).toBe("w2");
	});

	test("fills an empty panel instead of splitting", () => {
		const model = modelWith([]);
		const left = addTabsToModel(model, [tab("w1")], WIDE);
		expect(left).toEqual([]);
		expect(shape(model).map((entry) => entry.tabs)).toEqual([["w1"]]);
	});

	test("restores a maximized panel so the new widget is visible", () => {
		const model = modelWith(["w1"]);
		const tabset = model.getNodeById("ts1") as TabSetNode;
		addTabsToModel(model, [tab("w2")], WIDE);
		model.doAction(
			// Maximize the first panel, then add a third widget.
			{ type: "FlexLayout_MaximizeToggle", data: { node: "ts1" } } as any,
		);
		expect(model.getMaximizedTabset()).toBe(tabset);

		addTabsToModel(model, [tab("w3")], WIDE);

		expect(model.getMaximizedTabset()).toBeUndefined();
	});

	test("places several tabs like placeNewTabs does", () => {
		const added = [tab("w2"), tab("w3"), tab("w4")];

		const live = modelWith(["w1"]);
		addTabsToModel(live, added, WIDE);

		const json = placeNewTabs(
			modelWith(["w1"]).toJson().layout as any,
			added,
			{ sizes: WIDE },
		);

		expect(shape(live)).toEqual(jsonShape(json));
	});

	test("does nothing for an empty list", () => {
		const model = modelWith(["w1"]);
		const before = JSON.stringify(model.toJson());
		expect(addTabsToModel(model, [], WIDE)).toEqual([]);
		expect(JSON.stringify(model.toJson())).toBe(before);
	});
});
