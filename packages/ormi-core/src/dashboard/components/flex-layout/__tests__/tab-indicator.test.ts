/**
 * Tests for the pure half of the tab strip indicator (tab-indicator.ts), and
 * the stylesheet rules it relies on.
 *
 * A wrong plan plays the active-tab shape from the wrong place, or animates
 * when nothing moved; a wrong read-back makes a second click snap the shape
 * back to the tab it left. The stylesheet half pins that the slide is drawn
 * by `transform` alone and that at rest the selected button still draws the
 * folder shape itself.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
	planTabSlide,
	tabSlideKeyframes,
	visualTabRect,
	type TabRect,
} from "../tab-indicator";

const rect = (x: number, width: number): TabRect => ({
	x,
	y: 0,
	width,
	height: 32,
});

describe("planTabSlide", () => {
	test("slides right to a wider tab", () => {
		expect(planTabSlide(rect(0, 80), rect(80, 120))).toEqual({
			dx: -80,
			sx: 80 / 120,
		});
	});

	test("slides left to a narrower tab", () => {
		expect(planTabSlide(rect(200, 100), rect(40, 50))).toEqual({
			dx: 160,
			sx: 2,
		});
	});

	test("nothing moved: no slide", () => {
		expect(planTabSlide(rect(40, 80), rect(40.3, 80.2))).toBeUndefined();
	});

	test("a missing or empty rect is never animated", () => {
		expect(planTabSlide(undefined, rect(0, 80))).toBeUndefined();
		expect(planTabSlide(rect(0, 80), undefined)).toBeUndefined();
		expect(planTabSlide(rect(0, 0), rect(80, 80))).toBeUndefined();
		expect(
			planTabSlide(rect(0, 80), { x: 80, y: 0, width: 80, height: 0 }),
		).toBeUndefined();
		expect(planTabSlide(rect(Number.NaN, 80), rect(0, 80))).toBeUndefined();
	});
});

describe("tabSlideKeyframes", () => {
	test("transform only, ending at rest", () => {
		const frames = tabSlideKeyframes({ dx: -80, sx: 0.5 });
		expect(frames).toEqual([
			{ transform: "translateX(-80px) scaleX(0.5)" },
			{ transform: "none" },
		]);
		for (const frame of frames) {
			expect(Object.keys(frame)).toEqual(["transform"]);
		}
	});
});

describe("visualTabRect", () => {
	const to = rect(100, 60);

	test("reads a running slide back from its computed matrix", () => {
		expect(visualTabRect(to, "matrix(0.5, 0, 0, 1, -40, 0)")).toEqual({
			...to,
			x: 60,
			width: 30,
		});
	});

	test("at rest the stand-in is where it is parked", () => {
		expect(visualTabRect(to, "none")).toEqual(to);
	});

	test("an unreadable value falls back to the parked rect", () => {
		expect(visualTabRect(to, "")).toEqual(to);
		expect(visualTabRect(to, "matrix(1, 0, 0)")).toEqual(to);
		expect(
			visualTabRect(to, "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)"),
		).toEqual(to);
		expect(visualTabRect(to, "matrix(0, 0, 0, 1, 5, 0)")).toEqual(to);
	});

	test("round-trips a planned slide at its first frame", () => {
		const from = rect(10, 90);
		const slide = planTabSlide(from, to)!;
		const matrix = `matrix(${slide.sx}, 0, 0, 1, ${slide.dx}, 0)`;
		const seen = visualTabRect(to, matrix);
		expect(seen.x).toBeCloseTo(from.x, 6);
		expect(seen.width).toBeCloseTo(from.width, 6);
	});
});

describe("stylesheet contract", () => {
	const CSS = readFileSync(
		join(import.meta.dir, "..", "flex-layout-theme.css"),
		"utf8",
	);
	const block = (selector: string) => {
		const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return CSS.match(
			new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`),
		)?.[1];
	};

	test("at rest the selected button draws the folder shape itself", () => {
		const selected = block(".flexlayout__tab_button--selected");
		expect(selected).toContain(
			"background-color: var(--tab-active-background);",
		);
		expect(selected).toContain("border-color: var(--panel-border-color);");
	});

	test("the stand-in draws the same shape, below the titles, parked by the custom properties", () => {
		const before = block(
			".flexlayout__tabset_tabbar_inner_tab_container[data-ormi-tab-slide]::before",
		);
		expect(before).toBeDefined();
		expect(before).toContain(
			"background-color: var(--tab-active-background);",
		);
		expect(before).toContain(
			"border: var(--panel-border-width) solid var(--panel-border-color);",
		);
		expect(before).toContain("z-index: -1;");
		expect(before).toContain("left: var(--ormi-tab-x);");
		expect(before).toContain("width: var(--ormi-tab-w);");
		expect(before).toContain("transform-origin: 0 0;");
		expect(before).not.toMatch(/transition/);
	});

	test("tab buttons never fade the folder shape", () => {
		const button = block(".flexlayout__tab_button");
		const transition = button?.match(/transition:([^;]*);/)?.[1] ?? "";
		expect(transition).not.toMatch(/background|border|\ball\b/);
	});

	test("the slide is timed by --motion-base and --motion-ease", () => {
		const metrics = block(".ormi-motion-metrics");
		expect(metrics).toMatch(/animation-duration: var\(\s*--motion-base,/);
		expect(metrics).toContain(
			"animation-timing-function: var(--motion-ease,",
		);
	});
});
