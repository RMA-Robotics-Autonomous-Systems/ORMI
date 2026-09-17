/**
 * The decimation is what keeps a chart's repaint cost tied to its width rather
 * than to how much history it holds, so it runs on every frame of every chart
 * on the dashboard. It is also the part that can lie: a wrong bin drops the
 * live end of a trace, or flattens a spike, and the tile still looks plausible.
 */

import { describe, expect, test } from "bun:test";
import {
	MAX_CHART_COLUMNS,
	MIN_CHART_COLUMNS,
	buildColumnGrid,
	decimateSeries,
	firstIndexAtOrAfter,
	resolveColumnCount,
} from "../chart-decimation";

/** Allocate a cleared output buffer for a column count. */
const out = (columns: number): (number | null)[] =>
	new Array<number | null>(2 * columns).fill(null);

describe("resolveColumnCount", () => {
	test("tracks the tile width", () => {
		expect(resolveColumnCount(640)).toBe(640);
		expect(resolveColumnCount(319.4)).toBe(319);
	});

	test("clamps to the supported range", () => {
		expect(resolveColumnCount(1)).toBe(MIN_CHART_COLUMNS);
		expect(resolveColumnCount(100_000)).toBe(MAX_CHART_COLUMNS);
	});

	test("survives the width a tile reports before layout", () => {
		expect(resolveColumnCount(0)).toBe(MIN_CHART_COLUMNS);
		expect(resolveColumnCount(-10)).toBe(MIN_CHART_COLUMNS);
		expect(resolveColumnCount(Number.NaN)).toBe(MIN_CHART_COLUMNS);
	});
});

describe("firstIndexAtOrAfter", () => {
	const times = [10, 20, 30, 40, 50];

	test("finds the first entry at or after the bound", () => {
		expect(firstIndexAtOrAfter(times, 10)).toBe(0);
		expect(firstIndexAtOrAfter(times, 11)).toBe(1);
		expect(firstIndexAtOrAfter(times, 40)).toBe(3);
	});

	test("reports the length when everything is older", () => {
		expect(firstIndexAtOrAfter(times, 51)).toBe(5);
	});

	test("reports zero when everything is newer", () => {
		expect(firstIndexAtOrAfter(times, 0)).toBe(0);
		expect(firstIndexAtOrAfter([], 0)).toBe(0);
	});
});

describe("buildColumnGrid", () => {
	test("emits two strictly increasing positions per column", () => {
		const x = new Array<number>(8).fill(0);
		buildColumnGrid(0, 4, 4, x);

		expect(x).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
		for (let i = 1; i < x.length; i++) {
			expect(x[i]!).toBeGreaterThan(x[i - 1]!);
		}
	});

	test("stays inside the window", () => {
		const x = new Array<number>(6).fill(0);
		buildColumnGrid(100, 130, 3, x);

		expect(x[0]).toBe(100);
		expect(x[5]!).toBeLessThan(130);
	});
});

describe("decimateSeries", () => {
	test("keeps one sample per column at its own value", () => {
		const y = out(4);
		decimateSeries([0, 1, 2, 3], [5, 6, 7, 8], y, {
			tMin: 0,
			tMax: 4,
			columns: 4,
		});

		expect(y).toEqual([5, null, 6, null, 7, null, 8, null]);
	});

	test("collapses a dense column to its min and max", () => {
		const y = out(2);
		// Four samples in the first column, one in the second.
		decimateSeries([0, 0.1, 0.2, 0.3, 1], [3, 9, 1, 4, 7], y, {
			tMin: 0,
			tMax: 2,
			columns: 2,
		});

		// Rising then falling: the max (9) occurred before the min (1).
		expect(y).toEqual([9, 1, 7, null]);
	});

	test("emits min and max in the order they occurred", () => {
		const y = out(1);
		decimateSeries([0, 1], [2, 8], y, { tMin: 0, tMax: 2, columns: 1 });
		expect(y).toEqual([2, 8]);

		const z = out(1);
		decimateSeries([0, 1], [8, 2], z, { tMin: 0, tMax: 2, columns: 1 });
		expect(z).toEqual([8, 2]);
	});

	test("preserves a spike that a sample-skipping decimation would lose", () => {
		const times = Array.from({ length: 100 }, (_, i) => i);
		const values = times.map((t) => (t === 37 ? 1000 : 1));

		const y = out(5);
		decimateSeries(times, values, y, { tMin: 0, tMax: 100, columns: 5 });

		expect(y).toContain(1000);
	});

	test("leaves empty columns null so spanGaps can bridge them", () => {
		const y = out(4);
		decimateSeries([0, 3], [1, 2], y, { tMin: 0, tMax: 4, columns: 4 });

		expect(y).toEqual([1, null, null, null, null, null, 2, null]);
	});

	test("keeps the newest sample even when it is past the window end", () => {
		// A robot clock running ahead of the console: the freshest sample
		// carries a timestamp beyond `tMax` and must still be drawn.
		const y = out(4);
		decimateSeries([0, 1, 2, 9], [1, 2, 3, 42], y, {
			tMin: 0,
			tMax: 4,
			columns: 4,
		});

		expect(y[6]).toBe(42);
	});

	test("drops samples that scrolled out of the window", () => {
		const y = out(2);
		decimateSeries([0, 1, 10, 11], [1, 2, 3, 4], y, {
			tMin: 10,
			tMax: 12,
			columns: 2,
		});

		expect(y).toEqual([3, null, 4, null]);
	});

	test("converts buffer milliseconds to the chart's seconds", () => {
		const y = out(2);
		decimateSeries([1000, 2000], [7, 8], y, {
			tMin: 1,
			tMax: 3,
			columns: 2,
			timeScale: 0.001,
		});

		expect(y).toEqual([7, null, 8, null]);
	});

	test("plots booleans as 0/1 and skips anything with no honest number", () => {
		const y = out(4);
		decimateSeries([0, 1, 2, 3], [true, null, "12", { x: 1 }], y, {
			tMin: 0,
			tMax: 4,
			columns: 4,
		});

		// `Number(null)` is 0 and `Number("12")` is 12; neither may become a
		// value on a robot console.
		expect(y).toEqual([1, null, null, null, null, null, null, null]);
	});

	test("skips non-finite numbers", () => {
		const y = out(2);
		decimateSeries([0, 1], [Number.NaN, Number.POSITIVE_INFINITY], y, {
			tMin: 0,
			tMax: 2,
			columns: 2,
		});

		expect(y).toEqual([null, null, null, null]);
	});

	test("clears the previous frame's output", () => {
		const y: (number | null)[] = [1, 2, 3, 4];
		decimateSeries([], [], y, { tMin: 0, tMax: 2, columns: 2 });

		expect(y).toEqual([null, null, null, null]);
	});

	test("refuses a degenerate window rather than dividing by zero", () => {
		const y = out(2);
		decimateSeries([0, 1], [1, 2], y, { tMin: 5, tMax: 5, columns: 2 });
		expect(y).toEqual([null, null, null, null]);

		const z = out(2);
		decimateSeries([0, 1], [1, 2], z, {
			tMin: Number.NaN,
			tMax: 1,
			columns: 2,
		});
		expect(z).toEqual([null, null, null, null]);
	});
});
