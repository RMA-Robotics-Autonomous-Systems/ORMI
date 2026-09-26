/**
 * Tests for the pure half of panel motion (panel-motion.ts).
 *
 * These predicates decide what an operator sees move when the layout
 * changes, and they fail silently: a wrong skip rule animates a splitter
 * drag (the panel lands somewhere other than where it was dropped), a wrong
 * geometry plays a panel from the wrong place, a wrong duration parse turns
 * motion on for a preset that asked for none. The CSS half is pinned from
 * the stylesheet at the end: the lift rules that keep the inner-light layer
 * above the content during motion, and the ban on animating size.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Actions } from "flexlayout-react";

import {
	arrivalOrigin,
	arrivalScaleFrom,
	arriveKeyframes,
	isAnimatedLayoutAction,
	isNoopMove,
	isVisibleRect,
	moveGeometry,
	moveKeyframes,
	parseDurationMs,
	planLayoutMotion,
	rectsEqual,
	shouldAnimate,
	visualRectAt,
	type LayoutSnapshot,
	type PanelRect,
} from "../panel-motion";

const r = (x: number, y: number, width: number, height: number): PanelRect => ({
	x,
	y,
	width,
	height,
});

function snapshot(
	tabsets: Record<
		string,
		{ rect: PanelRect; selected?: string; tabs?: string[] }
	>,
): LayoutSnapshot {
	const s: LayoutSnapshot = { tabsets: new Map(), tabOwner: new Map() };
	for (const [id, t] of Object.entries(tabsets)) {
		s.tabsets.set(id, { rect: t.rect, selectedTabId: t.selected });
		for (const tab of t.tabs ?? (t.selected ? [t.selected] : [])) {
			s.tabOwner.set(tab, id);
		}
	}
	return s;
}

const HIDDEN = r(0, 0, 0, 0);

describe("skip rules", () => {
	test("splitter drags and selection never animate", () => {
		expect(isAnimatedLayoutAction(Actions.ADJUST_WEIGHTS)).toBe(false);
		expect(isAnimatedLayoutAction(Actions.ADJUST_BORDER_SPLIT)).toBe(false);
		expect(isAnimatedLayoutAction(Actions.SET_ACTIVE_TABSET)).toBe(false);
		expect(isAnimatedLayoutAction(Actions.SELECT_TAB)).toBe(false);
		expect(isAnimatedLayoutAction(Actions.RENAME_TAB)).toBe(false);
		expect(isAnimatedLayoutAction(Actions.UPDATE_NODE_ATTRIBUTES)).toBe(
			false,
		);
		expect(isAnimatedLayoutAction(Actions.UPDATE_MODEL_ATTRIBUTES)).toBe(
			false,
		);
	});

	test("structural changes animate", () => {
		for (const type of [
			Actions.ADD_NODE,
			Actions.MOVE_NODE,
			Actions.DELETE_TAB,
			Actions.DELETE_TABSET,
			Actions.MAXIMIZE_TOGGLE,
		]) {
			expect(isAnimatedLayoutAction(type)).toBe(true);
		}
	});

	test("zero duration or reduced motion means no motion at all", () => {
		expect(shouldAnimate({ durationMs: 0 }, false)).toBe(false);
		expect(shouldAnimate({ durationMs: 216 }, true)).toBe(false);
		expect(shouldAnimate({ durationMs: 216 }, false)).toBe(true);
	});
});

describe("parseDurationMs", () => {
	test("computed seconds and milliseconds", () => {
		expect(parseDurationMs("0.216s")).toBeCloseTo(216, 6);
		expect(parseDurationMs("216ms")).toBe(216);
		expect(parseDurationMs("0.2s, 0.3s")).toBeCloseTo(200, 6);
	});

	test("anything unparsable or non-positive is 0 (no motion)", () => {
		expect(parseDurationMs("0s")).toBe(0);
		expect(parseDurationMs("")).toBe(0);
		expect(parseDurationMs(undefined)).toBe(0);
		expect(parseDurationMs("calc(120ms * 1.8)")).toBe(0);
		expect(parseDurationMs("-5ms")).toBe(0);
		expect(parseDurationMs("fast")).toBe(0);
	});
});

describe("arrivalScaleFrom", () => {
	test("twice the overlay offset, bounded", () => {
		expect(arrivalScaleFrom(0.98)).toBeCloseTo(0.96, 10);
		expect(arrivalScaleFrom(1)).toBe(1);
		expect(arrivalScaleFrom(0.2)).toBe(0.9);
		expect(arrivalScaleFrom(Number.NaN)).toBeCloseTo(0.96, 10);
	});
});

describe("rects", () => {
	test("equality tolerates sub-pixel noise only", () => {
		expect(rectsEqual(r(0, 0, 100, 100), r(0.3, 0.2, 100.4, 99.6))).toBe(
			true,
		);
		expect(rectsEqual(r(0, 0, 100, 100), r(1, 0, 100, 100))).toBe(false);
	});

	test("a display:none tabset measures as zero and is not visible", () => {
		expect(isVisibleRect(HIDDEN)).toBe(false);
		expect(isVisibleRect(r(-500, -60, 0, 0))).toBe(false);
		expect(isVisibleRect(undefined)).toBe(false);
		expect(isVisibleRect(r(0, 0, 10, 10))).toBe(true);
	});
});

describe("moveGeometry", () => {
	test("growing in place: anchored top-left, the growth revealed by a trailing clip", () => {
		// Closing the right neighbour: the left panel grows to the right.
		const g = moveGeometry(r(0, 0, 500, 400), r(0, 0, 800, 400));
		expect(g).toEqual({ tx: 0, ty: 0, clipRight: 300, clipBottom: 0 });
	});

	test("growing leftward: the leading corner carries the panel, title and all", () => {
		const g = moveGeometry(r(500, 0, 500, 400), r(0, 0, 1000, 400));
		expect(g).toEqual({ tx: 500, ty: 0, clipRight: 500, clipBottom: 0 });
	});

	test("moving without resizing is a pure translate", () => {
		expect(moveGeometry(r(0, 0, 300, 200), r(400, 50, 300, 200))).toEqual({
			tx: -400,
			ty: -50,
			clipRight: 0,
			clipBottom: 0,
		});
	});

	test("shrinking never clips or scales: the size snaps, the corner slides", () => {
		// A new panel lands on the left: the old one is pushed right.
		const g = moveGeometry(r(0, 0, 1000, 400), r(500, 0, 500, 400));
		expect(g).toEqual({ tx: -500, ty: 0, clipRight: 0, clipBottom: 0 });
	});

	test("shrinking away from a held corner is a no-op", () => {
		expect(
			isNoopMove(moveGeometry(r(0, 0, 1000, 400), r(0, 0, 500, 400))),
		).toBe(true);
		expect(
			isNoopMove(moveGeometry(r(0, 0, 500, 400), r(0, 0, 800, 400))),
		).toBe(false);
	});
});

describe("visualRectAt", () => {
	test("a move starts exactly at the old rect when it grows, and ends at the new one", () => {
		const plan = {
			kind: "move" as const,
			tabsetId: "a",
			from: r(500, 0, 500, 400),
			to: r(0, 0, 1000, 400),
		};
		expect(visualRectAt(plan, 0, 0.96)).toEqual(plan.from);
		expect(visualRectAt(plan, 1, 0.96)).toEqual(plan.to);
		expect(visualRectAt(plan, 0.5, 0.96)).toEqual(r(250, 0, 750, 400));
	});

	test("a shrink starts at the new size, placed at the old corner", () => {
		const plan = {
			kind: "move" as const,
			tabsetId: "a",
			from: r(0, 0, 1000, 400),
			to: r(500, 0, 500, 400),
		};
		expect(visualRectAt(plan, 0, 1)).toEqual(r(0, 0, 500, 400));
	});

	test("an arrival scales about its origin", () => {
		const plan = {
			kind: "arrive" as const,
			tabsetId: "a",
			to: r(100, 0, 200, 100),
			origin: { x: 100, y: 50 },
		};
		expect(visualRectAt(plan, 0, 0.9)).toEqual(r(100, 5, 180, 90));
		expect(visualRectAt(plan, 1, 0.9)).toEqual(plan.to);
	});

	test("progress is clamped (a null or overshooting timing never extrapolates)", () => {
		const plan = {
			kind: "move" as const,
			tabsetId: "a",
			from: r(0, 0, 100, 100),
			to: r(100, 0, 100, 100),
		};
		expect(visualRectAt(plan, 1.2, 1)).toEqual(plan.to);
		expect(visualRectAt(plan, -1, 1)).toEqual(plan.from);
	});
});

describe("arrivalOrigin", () => {
	test("a split grows in from the edge it shares with the panel it came out of", () => {
		// The left panel covered everything, now holds the left half.
		const origin = arrivalOrigin(r(500, 0, 500, 400), [
			{ before: r(0, 0, 1000, 400), after: r(0, 0, 500, 400) },
		]);
		expect(origin).toEqual({ x: 500, y: 200 });
	});

	test("a vertical split grows down from the seam", () => {
		const origin = arrivalOrigin(r(0, 300, 600, 300), [
			{ before: r(0, 0, 600, 600), after: r(0, 0, 600, 300) },
		]);
		expect(origin).toEqual({ x: 300, y: 300 });
	});

	test("no neighbour that used to cover it: from the centre", () => {
		expect(
			arrivalOrigin(r(0, 0, 200, 100), [
				{ before: r(500, 0, 100, 100), after: r(500, 0, 100, 100) },
			]),
		).toEqual({ x: 100, y: 50 });
	});
});

describe("planLayoutMotion", () => {
	test("a split: the pushed panel is a no-op shrink, the new one arrives from the seam", () => {
		const before = snapshot({
			a: { rect: r(0, 0, 1000, 400), selected: "t1" },
		});
		const after = snapshot({
			a: { rect: r(0, 0, 500, 400), selected: "t1" },
			b: { rect: r(500, 0, 500, 400), selected: "t2" },
		});
		expect(planLayoutMotion(before, after)).toEqual([
			{
				kind: "arrive",
				tabsetId: "b",
				to: r(500, 0, 500, 400),
				origin: { x: 500, y: 200 },
			},
		]);
	});

	test("a close: neighbours grow into the freed space, the closed one vanishes", () => {
		const before = snapshot({
			a: { rect: r(0, 0, 500, 400), selected: "t1" },
			b: { rect: r(500, 0, 500, 400), selected: "t2" },
		});
		const after = snapshot({
			a: { rect: r(0, 0, 1000, 400), selected: "t1" },
		});
		expect(planLayoutMotion(before, after)).toEqual([
			{
				kind: "move",
				tabsetId: "a",
				from: r(0, 0, 500, 400),
				to: r(0, 0, 1000, 400),
			},
		]);
	});

	test("maximise: the panel opens out, the hidden ones are neither moved nor arrived", () => {
		const before = snapshot({
			a: { rect: r(0, 0, 500, 400), selected: "t1" },
			b: { rect: r(500, 0, 500, 400), selected: "t2" },
		});
		const after = snapshot({
			a: { rect: r(0, 0, 1000, 400), selected: "t1" },
			b: { rect: HIDDEN, selected: "t2" },
		});
		const plans = planLayoutMotion(before, after);
		expect(plans.map((p) => `${p.kind}:${p.tabsetId}`)).toEqual(["move:a"]);
	});

	test("restore: the panels that reappear arrive", () => {
		const before = snapshot({
			a: { rect: r(0, 0, 1000, 400), selected: "t1" },
			b: { rect: HIDDEN, selected: "t2" },
		});
		const after = snapshot({
			a: { rect: r(0, 0, 500, 400), selected: "t1" },
			b: { rect: r(500, 0, 500, 400), selected: "t2" },
		});
		expect(
			planLayoutMotion(before, after).map(
				(p) => `${p.kind}:${p.tabsetId}`,
			),
		).toEqual(["arrive:b"]);
	});

	test("a tab dragged into a stationary tabset grows in there alone", () => {
		const before = snapshot({
			a: { rect: r(0, 0, 500, 400), selected: "t1", tabs: ["t1"] },
			b: {
				rect: r(500, 0, 500, 400),
				selected: "t2",
				tabs: ["t2", "t3"],
			},
		});
		const after = snapshot({
			a: { rect: r(0, 0, 500, 400), selected: "t3", tabs: ["t1", "t3"] },
			b: { rect: r(500, 0, 500, 400), selected: "t2", tabs: ["t2"] },
		});
		expect(planLayoutMotion(before, after)).toEqual([
			{ kind: "tab-arrive", tabsetId: "a", tabId: "t3" },
		]);
	});

	test("switching tabs inside a tabset is not a layout change", () => {
		const before = snapshot({
			a: { rect: r(0, 0, 500, 400), selected: "t1", tabs: ["t1", "t2"] },
		});
		const after = snapshot({
			a: { rect: r(0, 0, 500, 400), selected: "t2", tabs: ["t1", "t2"] },
		});
		expect(planLayoutMotion(before, after)).toEqual([]);
	});

	test("an unchanged layout plans nothing (a stray capture replays nothing)", () => {
		const s = snapshot({ a: { rect: r(0, 0, 500, 400), selected: "t1" } });
		expect(planLayoutMotion(s, s)).toEqual([]);
	});
});

describe("keyframes", () => {
	const metrics = { margin: 3, radius: 8, innerRadius: 7 };

	test("only transform and clip-path move a panel, never its size", () => {
		const { container, tab } = moveKeyframes(
			moveGeometry(r(0, 0, 500, 400), r(0, 0, 800, 400)),
			metrics,
		);
		for (const frame of [...container, ...tab]) {
			expect(Object.keys(frame).sort()).toEqual([
				"clipPath",
				"transform",
			]);
		}
	});

	test("the container's cut sits on the old panel edge, the content's on its inner edge", () => {
		const { container, tab } = moveKeyframes(
			moveGeometry(r(0, 0, 500, 400), r(0, 0, 800, 400)),
			metrics,
		);
		expect(container[0]!.clipPath).toBe(
			"inset(0px 303px 0px 0px round 8px)",
		);
		expect(container[1]!.clipPath).toBe("inset(0px 3px 0px 0px round 8px)");
		expect(tab[0]!.clipPath).toBe(
			"inset(0px 300px 0px 0px round 0 0 7px 7px)",
		);
		expect(tab[1]!.clipPath).toBe(
			"inset(0px 0px 0px 0px round 0 0 7px 7px)",
		);
	});

	test("an unclipped edge keeps the frame's shadow margin", () => {
		const { container } = moveKeyframes(
			moveGeometry(r(0, 0, 300, 200), r(100, 0, 300, 200)),
			metrics,
		);
		expect(container[0]!.transform).toBe("translate(-100px, 0px)");
		expect(container[0]!.clipPath).toBe("inset(0px 0px 0px 0px round 8px)");
	});

	test("arrival: opacity and scale about the origin, in the element's own frame", () => {
		const frames = arriveKeyframes(
			r(100, 50, 200, 100),
			{ x: 100, y: 100 },
			0.96,
		);
		expect(frames).toEqual([
			{
				opacity: 0,
				transform: "scale(0.96)",
				transformOrigin: "0px 50px",
			},
			{ opacity: 1, transform: "scale(1)", transformOrigin: "0px 50px" },
		]);
	});
});

describe("stylesheet contract", () => {
	const CSS = readFileSync(
		join(import.meta.dir, "..", "flex-layout-theme.css"),
		"utf8",
	);
	const section = CSS.slice(
		CSS.indexOf("Panel motion (panel-motion.ts"),
		CSS.indexOf(".flexlayout__tabset_header"),
	);

	test("a moving container is lifted above its content, see-through", () => {
		expect(section).toMatch(
			/\.flexlayout__tabset_container\.ormi-panel-motion \{[^}]*z-index: 1;/,
		);
		expect(section).toMatch(
			/\.flexlayout__tabset_container\.ormi-panel-motion \.flexlayout__tabset_content \{[^}]*background-color: transparent;/,
		);
		expect(section).toMatch(
			/\.flexlayout__tab\.ormi-panel-motion \{[^}]*background-color: var\(--panel-background\);[^}]*transition: none;/,
		);
	});

	test("rows stop clipping a panel translated out of them", () => {
		expect(section).toMatch(
			/\.flexlayout__row:has\(\.ormi-panel-motion\) \{[^}]*overflow: visible;/,
		);
	});

	test("the duration resolves from the layout token, falling back to the base one", () => {
		expect(section).toContain("--motion-layout,");
		expect(section).toContain("calc(var(--motion-duration) * 1.2)");
	});

	test("nothing in the motion rules transitions or animates a size", () => {
		expect(section).not.toMatch(/transition[^;]*\b(width|height)\b/);
	});
});
