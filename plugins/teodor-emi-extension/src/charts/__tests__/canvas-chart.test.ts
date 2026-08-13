/**
 * The chart arithmetic.
 *
 * Small, pure, and the place three separate defects lived before it existed: a
 * hit tolerance derived from the wrong span, a panel split that overflowed its
 * box, and an index search bounded by the wrong length. None of them fail
 * loudly — they draw a plausible picture of the wrong thing.
 */

import { describe, expect, it } from "bun:test";
import {
	decadeTicks,
	LOG_FLOOR,
	lowerBound,
	makeProjection,
	niceTicks,
	shortNum,
	timeGeom,
	PAD,
} from "../canvas-chart";
import { panelHeights } from "../signal-stack";
import { cellNoise } from "../coil-array";
import {
	motionState,
	MIN_TOTAL_H,
	STILL_MS,
	STRAIGHT_DPS,
} from "../motion-chart";

describe("lowerBound", () => {
	const t = new Float64Array([0, 1, 2, 3, 4, 5, 6, 7]);

	it("finds the first index at or after a value", () => {
		expect(lowerBound(t, 0, 8)).toBe(0);
		expect(lowerBound(t, 3, 8)).toBe(3);
		expect(lowerBound(t, 3.5, 8)).toBe(4);
	});

	it("returns n for a value past the end", () => {
		expect(lowerBound(t, 99, 8)).toBe(8);
	});

	it("is bounded by n, not by the buffer", () => {
		// A growing mission over-allocates its columns, so the tail of the
		// array is zeros — searching the whole buffer would return an index
		// inside that padding and read a sample that does not exist.
		const over = new Float64Array(16);
		over.set(t);
		expect(lowerBound(over, 99, 8)).toBe(8);
		expect(lowerBound(over, 4.5, 8)).toBe(5);
	});

	it("handles an empty range", () => {
		expect(lowerBound(t, 3, 0)).toBe(0);
	});
});

describe("panelHeights", () => {
	it("divides the box so the panels plus the axis fit inside it", () => {
		const { coil, coilLast } = panelHeights(500, 5);
		expect(coil * 4 + coilLast).toBeLessThanOrEqual(500);
		expect(coilLast).toBeGreaterThan(coil);
	});

	it("clamps rather than producing an unreadable panel", () => {
		// Below the clamp the total exceeds the box — the widget scrolls rather
		// than shrinking a coil into a smear, and this pins the clamp so that
		// choice stays deliberate.
		const { coil } = panelHeights(80, 5);
		expect(coil).toBe(34);
	});

	it("tolerates a degenerate coil count", () => {
		expect(panelHeights(300, 0).coil).toBeGreaterThan(0);
	});
});

describe("makeProjection", () => {
	it("floors a log axis, because the offset-removed signal goes negative", () => {
		const p = makeProjection(50_000, true);
		expect(p.ymin).toBe(LOG_FLOOR);
		expect(p.proj(-500)).toBe(Math.log10(LOG_FLOOR));
		expect(p.proj(1000)).toBeCloseTo(3, 9);
	});

	it("gives a linear axis a little room below zero", () => {
		const p = makeProjection(1000, false);
		expect(p.ymin).toBeLessThan(0);
		expect(p.proj(250)).toBe(250);
	});

	it("survives a degenerate top", () => {
		expect(makeProjection(0, true).ymax).toBeGreaterThan(LOG_FLOOR);
		expect(makeProjection(NaN, false).ymax).toBe(1);
	});
});

describe("ticks", () => {
	it("puts decades on a log axis", () => {
		expect(decadeTicks(10, 20000)).toEqual([10, 100, 1000, 10000]);
	});

	it("returns nothing for an impossible log range", () => {
		expect(decadeTicks(0, 10)).toEqual([]);
		expect(decadeTicks(100, 10)).toEqual([]);
	});

	it("terminates on a zero-width range", () => {
		expect(niceTicks(5, 5)).toEqual([5]);
		expect(niceTicks(0, 0)).toEqual([0]);
	});

	it("stays round and bounded", () => {
		const ticks = niceTicks(0, 100, 5);
		expect(ticks[0]).toBe(0);
		expect(ticks.length).toBeLessThan(20);
	});
});

describe("timeGeom", () => {
	it("maps the window onto the plot area, not the whole panel", () => {
		const p = makeProjection(100, false);
		const g = timeGeom(800, 10, 100, 10, 20, p);
		expect(g.x0).toBe(PAD.l);
		expect(g.x1).toBe(800 - PAD.r);
		expect(g.X(10)).toBeCloseTo(g.x0, 9);
		expect(g.X(20)).toBeCloseTo(g.x1, 9);
		expect(g.X(15)).toBeCloseTo((g.x0 + g.x1) / 2, 9);
	});

	it("puts the top of the range at the top of the plot", () => {
		const p = makeProjection(100, false);
		const g = timeGeom(800, 10, 100, 0, 1, p);
		expect(g.Y(p.ymax)).toBeCloseTo(g.y0, 6);
		expect(g.Y(p.ymin)).toBeCloseTo(g.y1, 6);
	});

	it("does not divide by zero on a collapsed window", () => {
		const g = timeGeom(800, 10, 100, 5, 5, makeProjection(100, false));
		expect(Number.isFinite(g.X(5))).toBe(true);
	});
});

describe("shortNum", () => {
	it("keeps an axis label short without lying about the magnitude", () => {
		expect(shortNum(450)).toBe("450");
		expect(shortNum(12300)).toBe("12k");
		expect(shortNum(1200)).toBe("1.2k");
		expect(shortNum(2_400_000)).toBe("2.4M");
		expect(shortNum(NaN)).toBe("–");
	});
});

describe("motionState", () => {
	it("calls parked, turning and surveying by the documented limits", () => {
		expect(motionState(STILL_MS - 0.001, 0)).toBe("stationary");
		expect(motionState(1, STRAIGHT_DPS + 1)).toBe("turning");
		expect(motionState(1, -(STRAIGHT_DPS + 1))).toBe("turning");
		expect(motionState(1, 0)).toBe("moving");
	});

	it("ranks parked above turning — a parked robot is not surveying either way", () => {
		expect(motionState(0, 90)).toBe("stationary");
	});
});

describe("MIN_TOTAL_H", () => {
	it("is the height below which the motion panels refuse to draw", () => {
		// Two panels plus the axis. The constant exists so the widget's guard and
		// the drawing agree — a gap between them is a blank canvas with no
		// explanation.
		expect(MIN_TOTAL_H).toBeGreaterThanOrEqual(80);
	});
});

describe("cellNoise — the coil array's ground texture", () => {
	// The speckles are anchored to world cells so that the ground visibly
	// streams astern while the rake is held still. Everything about that rests
	// on one property: a cell's value must depend on the cell and nothing else.
	it("gives a cell the same value every time it is asked", () => {
		for (const [a, b] of [
			[0, 0],
			[7, -3],
			[-1240, 918],
			[2 ** 20, -(2 ** 20)],
		] as Array<[number, number]>) {
			expect(cellNoise(a, b, 1)).toBe(cellNoise(a, b, 1));
		}
	});

	it("stays inside [0, 1)", () => {
		for (let a = -60; a < 60; a += 7) {
			for (let b = -60; b < 60; b += 7) {
				const v = cellNoise(a, b, 0x9e37);
				expect(v).toBeGreaterThanOrEqual(0);
				expect(v).toBeLessThan(1);
			}
		}
	});

	it("separates neighbours, or the texture is stripes rather than ground", () => {
		const a = cellNoise(12, 34, 1);
		expect(a).not.toBe(cellNoise(13, 34, 1));
		expect(a).not.toBe(cellNoise(12, 35, 1));
		// And the salts must not agree, or every speckle sits on its cell's
		// corner and the grid itself becomes visible.
		expect(cellNoise(12, 34, 0x9e37)).not.toBe(cellNoise(12, 34, 0x85eb));
	});

	it("spreads roughly evenly, so no quadrant of ground is bare", () => {
		const buckets = [0, 0, 0, 0];
		for (let a = 0; a < 100; a++) {
			for (let b = 0; b < 100; b++) {
				buckets[Math.floor(cellNoise(a, b, 3) * 4)]!++;
			}
		}
		for (const n of buckets) {
			expect(n).toBeGreaterThan(10000 / 4 / 1.5);
			expect(n).toBeLessThan((10000 / 4) * 1.5);
		}
	});
});
