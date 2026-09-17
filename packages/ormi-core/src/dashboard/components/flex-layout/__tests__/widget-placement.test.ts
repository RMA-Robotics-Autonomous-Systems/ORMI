/**
 * Tests for the flex dashboard's widget placement rules.
 *
 * `placeNewTabs` is pure JSON in, JSON out, so the whole split/stack decision
 * is exercised here without a React renderer or a laid-out FlexLayout model —
 * which is the point: a layout rule that is silently wrong looks exactly like a
 * working dashboard.
 *
 * Panel sizes are recomputed independently in `panelSizes` below rather than
 * read back out of the module, so a mistake in the production weight maths
 * cannot hide behind the same mistake in the assertions.
 */

import { describe, test, expect } from "bun:test";
import type {
	IJsonRowNode,
	IJsonTabNode,
	IJsonTabSetNode,
} from "flexlayout-react";
import {
	MIN_SPLIT_HEIGHT,
	MIN_SPLIT_WIDTH,
	placeNewTabs,
	type PanelSize,
} from "../widget-placement";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tab = (id: string): IJsonTabNode => ({
	type: "tab",
	id,
	name: id,
	component: id,
	config: {},
});

const tabset = (
	tabIds: string[],
	attrs: Partial<IJsonTabSetNode> = {},
): IJsonTabSetNode => ({
	type: "tabset",
	children: tabIds.map(tab),
	...attrs,
});

const row = (
	children: (IJsonRowNode | IJsonTabSetNode)[],
	attrs: Partial<IJsonRowNode> = {},
): IJsonRowNode => ({
	type: "row",
	children,
	...attrs,
});

/** A laptop-class viewport: wide enough to split several times. */
const DESKTOP: PanelSize = { width: 1600, height: 900 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MeasuredPanel extends PanelSize {
	tabIds: string[];
}

/**
 * Independent re-implementation of FlexLayout's weight-based sizing, used to
 * check what the produced layout would actually render as.
 */
const panelSizes = (
	layout: IJsonRowNode,
	viewport: PanelSize,
	rootHorizontal = true,
): MeasuredPanel[] => {
	const out: MeasuredPanel[] = [];

	const walk = (
		node: IJsonRowNode,
		size: PanelSize,
		horizontal: boolean,
	): void => {
		const weights = node.children.map((child) =>
			typeof child.weight === "number" ? child.weight : 100,
		);
		const total = weights.reduce((sum, weight) => sum + weight, 0);

		node.children.forEach((child, index) => {
			const share = (weights[index] ?? 0) / total;
			const childSize: PanelSize = horizontal
				? { width: size.width * share, height: size.height }
				: { width: size.width, height: size.height * share };

			if (child.type === "tabset") {
				out.push({
					...childSize,
					tabIds: (child as IJsonTabSetNode).children.map(
						(t) => t.id as string,
					),
				});
			} else {
				walk(child as IJsonRowNode, childSize, !horizontal);
			}
		});
	};

	walk(layout, viewport, rootHorizontal);
	return out;
};

const tabsetsOf = (node: IJsonRowNode): IJsonTabSetNode[] => {
	const out: IJsonTabSetNode[] = [];
	for (const child of node.children) {
		if (child.type === "tabset") out.push(child as IJsonTabSetNode);
		else out.push(...tabsetsOf(child as IJsonRowNode));
	}
	return out;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("placeNewTabs", () => {
	test("puts the first widget in the empty panel a fresh layout carries", () => {
		const layout = row([tabset([], { id: "ts1" })], { id: "root" });

		const result = placeNewTabs(layout, [tab("w1")], {
			sizes: { root: DESKTOP, ts1: DESKTOP },
		});

		expect(result.children).toHaveLength(1);
		const panels = tabsetsOf(result);
		expect(panels).toHaveLength(1);
		expect(panels[0]!.children.map((t) => t.id)).toEqual(["w1"]);
		expect(panels[0]!.selected).toBe(0);
	});

	test("creates a panel when the layout has none", () => {
		const result = placeNewTabs(row([], { id: "root" }), [tab("w1")], {
			sizes: { root: DESKTOP },
		});

		expect(
			tabsetsOf(result).map((p) => p.children.map((t) => t.id)),
		).toEqual([["w1"]]);
	});

	test("splits a wide panel side by side for the second widget", () => {
		const layout = row([tabset(["w1"], { id: "ts1" })], { id: "root" });

		const result = placeNewTabs(layout, [tab("w2")], {
			sizes: { root: DESKTOP, ts1: DESKTOP },
		});

		// Two panels in the root row means left | right, not a tab strip.
		expect(result.children).toHaveLength(2);
		expect(result.children.every((child) => child.type === "tabset")).toBe(
			true,
		);
		expect(result.children.map((child) => child.weight)).toEqual([50, 50]);

		expect(panelSizes(result, DESKTOP)).toEqual([
			{ width: 800, height: 900, tabIds: ["w1"] },
			{ width: 800, height: 900, tabIds: ["w2"] },
		]);
	});

	test("splits a tall panel top to bottom", () => {
		const portrait: PanelSize = { width: 600, height: 1200 };
		const layout = row([tabset(["w1"], { id: "ts1" })], { id: "root" });

		const result = placeNewTabs(layout, [tab("w2")], {
			sizes: { root: portrait, ts1: portrait },
		});

		// The root row runs horizontally, so a top/bottom split has to nest a
		// row that runs the other way.
		expect(result.children).toHaveLength(1);
		expect(result.children[0]!.type).toBe("row");
		expect(panelSizes(result, portrait)).toEqual([
			{ width: 600, height: 600, tabIds: ["w1"] },
			{ width: 600, height: 600, tabIds: ["w2"] },
		]);
	});

	test("the third and fourth widgets fill out an L and then a grid", () => {
		const layout = row([tabset(["w1"], { id: "ts1" })], { id: "root" });
		const sizes = { root: DESKTOP, ts1: DESKTOP };

		const three = placeNewTabs(layout, [tab("w2"), tab("w3")], { sizes });
		expect(panelSizes(three, DESKTOP)).toEqual([
			{ width: 800, height: 450, tabIds: ["w1"] },
			{ width: 800, height: 450, tabIds: ["w3"] },
			{ width: 800, height: 900, tabIds: ["w2"] },
		]);

		const four = placeNewTabs(layout, [tab("w2"), tab("w3"), tab("w4")], {
			sizes,
		});
		expect(panelSizes(four, DESKTOP)).toEqual([
			{ width: 800, height: 450, tabIds: ["w1"] },
			{ width: 800, height: 450, tabIds: ["w3"] },
			{ width: 800, height: 450, tabIds: ["w2"] },
			{ width: 800, height: 450, tabIds: ["w4"] },
		]);
	});

	test("always splits the largest panel, not the first one", () => {
		// A narrow strip beside a large panel: the large one must be the one
		// that gives up half its room.
		const layout = row(
			[
				tabset(["w1"], { id: "small", weight: 20 }),
				tabset(["w2"], { id: "big", weight: 80 }),
			],
			{ id: "root" },
		);

		const result = placeNewTabs(layout, [tab("w3")], {
			sizes: { root: { width: 1000, height: 500 } },
		});

		expect(panelSizes(result, { width: 1000, height: 500 })).toEqual([
			{ width: 200, height: 500, tabIds: ["w1"] },
			{ width: 400, height: 500, tabIds: ["w2"] },
			{ width: 400, height: 500, tabIds: ["w3"] },
		]);
	});

	test("leaves sibling weights untouched when it splits", () => {
		const layout = row(
			[
				tabset(["w1"], { id: "small", weight: 20 }),
				tabset(["w2"], { id: "big", weight: 80 }),
			],
			{ id: "root" },
		);

		const result = placeNewTabs(layout, [tab("w3")], {
			sizes: { root: { width: 1000, height: 500 } },
		});

		expect(result.children.map((child) => child.weight)).toEqual([
			20, 40, 40,
		]);
	});

	test("stacks as a tab once the halves would be too small to read", () => {
		const cramped: PanelSize = { width: 600, height: 400 };
		const layout = row([tabset(["w1"], { id: "ts1" })], { id: "root" });

		const result = placeNewTabs(layout, [tab("w2")], {
			sizes: { root: cramped, ts1: cramped },
		});

		// 600 / 2 = 300, under the 320px width floor.
		expect(MIN_SPLIT_WIDTH).toBeGreaterThan(cramped.width / 2);
		expect(result.children).toHaveLength(1);
		const panels = tabsetsOf(result);
		expect(panels).toHaveLength(1);
		expect(panels[0]!.children.map((t) => t.id)).toEqual(["w1", "w2"]);
		// The new tab has to be the visible one, or adding a widget reads as
		// nothing happening.
		expect(panels[0]!.selected).toBe(1);
	});

	test("still splits a panel that clears the floor by a hair", () => {
		const size: PanelSize = { width: MIN_SPLIT_WIDTH * 2, height: 400 };
		const layout = row([tabset(["w1"], { id: "ts1" })], { id: "root" });

		const result = placeNewTabs(layout, [tab("w2")], {
			sizes: { root: size, ts1: size },
		});

		expect(result.children).toHaveLength(2);
	});

	test("only the axis being split is tested against the floor", () => {
		// A short, very wide strip: halving its width is fine even though its
		// height is already under the height floor, because the split does not
		// make the height any worse.
		const strip: PanelSize = { width: 1600, height: MIN_SPLIT_HEIGHT - 40 };
		const layout = row([tabset(["w1"], { id: "ts1" })], { id: "root" });

		const result = placeNewTabs(layout, [tab("w2")], {
			sizes: { root: strip, ts1: strip },
		});

		expect(result.children).toHaveLength(2);
	});

	test("places several widgets arriving at once without producing slivers", () => {
		const layout = row([tabset(["w1"], { id: "ts1" })], { id: "root" });

		const result = placeNewTabs(
			layout,
			[tab("w2"), tab("w3"), tab("w4"), tab("w5")],
			{ sizes: { root: DESKTOP, ts1: DESKTOP } },
		);

		const panels = panelSizes(result, DESKTOP);

		// Five widgets, five panels: nothing was stacked, and nothing was
		// split off a panel that had already been split in this same pass.
		expect(panels).toHaveLength(5);
		expect(panels.flatMap((panel) => panel.tabIds).sort()).toEqual([
			"w1",
			"w2",
			"w3",
			"w4",
			"w5",
		]);
		for (const panel of panels) {
			expect(panel.width).toBeGreaterThanOrEqual(MIN_SPLIT_WIDTH);
			expect(panel.height).toBeGreaterThanOrEqual(MIN_SPLIT_HEIGHT);
		}
	});

	test("splits when nothing has been measured yet", () => {
		// Before the first render every rect is zero; refusing to split then
		// would stack the whole dashboard into one panel.
		const layout = row([tabset(["w1"])], { id: "root" });

		const result = placeNewTabs(layout, [tab("w2")]);

		expect(result.children).toHaveLength(2);
	});

	test("honours a vertical root orientation", () => {
		const portrait: PanelSize = { width: 600, height: 1200 };
		const layout = row([tabset(["w1"], { id: "ts1" })], { id: "root" });

		const result = placeNewTabs(layout, [tab("w2")], {
			sizes: { root: portrait, ts1: portrait },
			rootOrientationVertical: true,
		});

		// The root row already runs top to bottom, so the top/bottom split is a
		// plain sibling rather than a nested row.
		expect(result.children).toHaveLength(2);
		expect(result.children.every((child) => child.type === "tabset")).toBe(
			true,
		);
		expect(panelSizes(result, portrait, false)).toEqual([
			{ width: 600, height: 600, tabIds: ["w1"] },
			{ width: 600, height: 600, tabIds: ["w2"] },
		]);
	});

	test("leaves a restored layout exactly as saved when nothing is missing", () => {
		const layout = row(
			[
				tabset(["w1"], { id: "a", weight: 30 }),
				row(
					[
						tabset(["w2"], { id: "b", weight: 70 }),
						tabset(["w3", "w4"], { id: "c", weight: 30 }),
					],
					{ id: "nested", weight: 70 },
				),
			],
			{ id: "root" },
		);
		const before = structuredClone(layout);

		const result = placeNewTabs(layout, [], {
			sizes: { root: DESKTOP },
		});

		expect(result).toEqual(before);
		expect(result).not.toBe(layout);
		expect(layout).toEqual(before);
	});

	test("keeps a restored layout's existing panels in place when adding one", () => {
		const layout = row(
			[
				tabset(["w1"], { id: "a", weight: 30 }),
				tabset(["w2"], { id: "b", weight: 70 }),
			],
			{ id: "root" },
		);
		const before = structuredClone(layout);

		const result = placeNewTabs(layout, [tab("w3")], {
			sizes: {
				root: DESKTOP,
				a: { width: 480, height: 900 },
				b: { width: 1120, height: 900 },
			},
		});

		// The input is never touched...
		expect(layout).toEqual(before);
		// ...and the untouched sibling keeps its tab and its share.
		expect(result.children[0]).toEqual(before.children[0]!);
		expect(
			tabsetsOf(result).map((p) => p.children.map((t) => t.id)),
		).toEqual([["w1"], ["w2"], ["w3"]]);
	});
});

describe("a maximized panel", () => {
	test("is restored, so the widget just added is visible", () => {
		const layout: IJsonRowNode = {
			type: "row",
			weight: 100,
			children: [
				{
					type: "tabset",
					id: "ts-1",
					weight: 50,
					maximized: true,
					children: [tab("w-1")],
				},
				{
					type: "tabset",
					id: "ts-2",
					weight: 50,
					children: [tab("w-2")],
				},
			],
		};

		const next = placeNewTabs(layout, [tab("w-3")], {
			viewport: { width: 1600, height: 900 },
			sizes: {
				"ts-1": { width: 800, height: 900 },
				"ts-2": { width: 800, height: 900 },
			},
		});

		const maximized = JSON.stringify(next).includes('"maximized"');
		expect(maximized).toBe(false);
	});

	test("is left alone when nothing is being added", () => {
		const layout: IJsonRowNode = {
			type: "row",
			weight: 100,
			children: [
				{
					type: "tabset",
					id: "ts-1",
					weight: 100,
					maximized: true,
					children: [tab("w-1")],
				},
			],
		};

		// Restoring a layout must not disturb it: the early return for an empty
		// tab list is what guarantees a reload does not un-maximize the panel
		// the operator left maximized.
		expect(placeNewTabs(layout, [])).toEqual(layout);
	});
});
