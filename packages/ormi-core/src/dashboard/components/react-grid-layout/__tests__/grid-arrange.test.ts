import { describe, expect, it } from "bun:test";
import type { LayoutItem } from "react-grid-layout";

import {
	arrangeGrid,
	distribute,
	GRID_COLS,
	GRID_CONTAINER_PADDING_Y,
	GRID_MARGIN,
	GRID_ROW_HEIGHT,
	MIN_TILE_COLS,
	MIN_TILE_ROWS,
	resolveGridBreakpoint,
	rowsForHeight,
	type ArrangePreset,
} from "../grid-arrange";

const PRESETS: ArrangePreset[] = ["grid", "columns", "rows", "focus"];
const COLUMN_COUNTS = Object.values(GRID_COLS);
const SIZES = [
	{ width: 1920, height: 1000 },
	{ width: 1280, height: 700 },
	{ width: 800, height: 600 },
	{ width: 400, height: 700 },
	// Too short for a single minimum-height tile.
	{ width: 1280, height: 120 },
];

const ids = (count: number) =>
	Array.from({ length: count }, (_, index) => `w${index + 1}`);

const overlaps = (a: LayoutItem, b: LayoutItem) =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const bottomOf = (layout: LayoutItem[]) =>
	Math.max(...layout.map((item) => item.y + item.h));

/** Pixel height react-grid-layout gives a container of `rows` rows. */
const heightOfRows = (rows: number) =>
	rows * GRID_ROW_HEIGHT +
	(rows - 1) * GRID_MARGIN +
	2 * GRID_CONTAINER_PADDING_Y;

describe("rowsForHeight", () => {
	it("matches hand-computed pixel heights", () => {
		// N rows occupy 30N + 2(N - 1) + 4 = 32N + 2 pixels.
		expect(rowsForHeight(34)).toBe(1);
		expect(rowsForHeight(65)).toBe(1);
		expect(rowsForHeight(66)).toBe(2);
		expect(rowsForHeight(322)).toBe(10);
		expect(rowsForHeight(321)).toBe(9);
		expect(rowsForHeight(1000)).toBe(31);
		expect(rowsForHeight(700)).toBe(21);
	});

	it("is the inverse of the container height formula", () => {
		for (let rows = 1; rows <= 60; rows++) {
			expect(rowsForHeight(heightOfRows(rows))).toBe(rows);
			expect(rowsForHeight(heightOfRows(rows) + 31)).toBe(rows);
			expect(rowsForHeight(heightOfRows(rows + 1) - 1)).toBe(rows);
		}
	});

	it("never goes below one row", () => {
		expect(rowsForHeight(0)).toBe(1);
		expect(rowsForHeight(-50)).toBe(1);
		expect(rowsForHeight(Number.NaN)).toBe(1);
	});
});

describe("resolveGridBreakpoint", () => {
	it("switches strictly above each minimum width", () => {
		expect(resolveGridBreakpoint(0)).toBe("xxs");
		expect(resolveGridBreakpoint(480)).toBe("xxs");
		expect(resolveGridBreakpoint(481)).toBe("xs");
		expect(resolveGridBreakpoint(768)).toBe("xs");
		expect(resolveGridBreakpoint(769)).toBe("sm");
		expect(resolveGridBreakpoint(996)).toBe("sm");
		expect(resolveGridBreakpoint(997)).toBe("md");
		expect(resolveGridBreakpoint(1200)).toBe("md");
		expect(resolveGridBreakpoint(1201)).toBe("lg");
		expect(resolveGridBreakpoint(3840)).toBe("lg");
	});
});

describe("distribute", () => {
	it("sums exactly to the total with spans at most one apart", () => {
		for (let total = 1; total <= 40; total++) {
			for (let parts = 1; parts <= total; parts++) {
				const spans = distribute(total, parts);
				expect(spans).toHaveLength(parts);
				expect(spans.reduce((sum, span) => sum + span, 0)).toBe(total);
				expect(Math.max(...spans) - Math.min(...spans)).toBeLessThan(2);
				expect(Math.min(...spans)).toBeGreaterThanOrEqual(1);
			}
		}
	});

	it("spreads the remainder over the leading spans", () => {
		expect(distribute(12, 5)).toEqual([3, 3, 2, 2, 2]);
		expect(distribute(10, 3)).toEqual([4, 3, 3]);
		expect(distribute(31, 2)).toEqual([16, 15]);
	});

	it("returns nothing for no parts", () => {
		expect(distribute(12, 0)).toEqual([]);
	});
});

describe("arrangeGrid", () => {
	for (const preset of PRESETS) {
		it(`${preset}: tiles the grid for every count, column count and size`, () => {
			for (const cols of COLUMN_COUNTS) {
				for (const { width, height } of SIZES) {
					for (let count = 1; count <= 13; count++) {
						const widgetIds = ids(count);
						const layout = arrangeGrid({
							preset,
							widgetIds,
							layout: [],
							cols,
							width,
							height,
						});
						const where = `${preset} n=${count} cols=${cols} ${width}x${height}`;
						const budget = rowsForHeight(height);

						// Every widget exactly once.
						expect(layout.map((item) => item.i).sort()).toEqual(
							[...widgetIds].sort(),
						);

						for (const item of layout) {
							expect(Number.isInteger(item.x), where).toBe(true);
							expect(Number.isInteger(item.y), where).toBe(true);
							expect(item.x, where).toBeGreaterThanOrEqual(0);
							expect(item.y, where).toBeGreaterThanOrEqual(0);
							expect(item.x + item.w, where).toBeLessThanOrEqual(
								cols,
							);
							expect(item.w, where).toBeGreaterThanOrEqual(
								Math.min(MIN_TILE_COLS, cols),
							);
							// The minimum height holds forced or not.
							expect(item.h, where).toBeGreaterThanOrEqual(
								MIN_TILE_ROWS,
							);
						}

						for (let a = 0; a < layout.length; a++) {
							for (let b = a + 1; b < layout.length; b++) {
								expect(
									overlaps(layout[a]!, layout[b]!),
									where,
								).toBe(false);
							}
						}

						const bottom = bottomOf(layout);
						const area = layout.reduce(
							(sum, item) => sum + item.w * item.h,
							0,
						);
						// No preset stacks more bands than there are tiles,
						// so this budget gives every tile the minimum.
						if (budget >= count * MIN_TILE_ROWS) {
							expect(bottom, where).toBe(budget);
							// In bounds, no overlap and full area: no gap.
							expect(area, where).toBe(cols * budget);
						} else {
							expect(bottom, where).toBeGreaterThanOrEqual(
								budget,
							);
						}

						if (preset !== "focus") {
							// Each band spans the full width.
							const bands = new Map<number, number>();
							for (const item of layout) {
								bands.set(
									item.y,
									(bands.get(item.y) ?? 0) + item.w,
								);
							}
							for (const span of bands.values()) {
								expect(span, where).toBe(cols);
							}
							expect(area, where).toBe(cols * bottom);
						}
					}
				}
			}
		});
	}

	it("grid: column count follows the container aspect ratio", () => {
		const columnsOf = (width: number, height: number, count: number) =>
			arrangeGrid({
				preset: "grid",
				widgetIds: ids(count),
				layout: [],
				cols: 12,
				width,
				height,
			}).filter((item) => item.y === 0).length;

		expect(columnsOf(1920, 1000, 4)).toBe(2);
		expect(columnsOf(1920, 1000, 6)).toBe(3);
		expect(columnsOf(1920, 1000, 9)).toBe(3);
		// A wide, short strip goes side by side; a tall one stacks.
		expect(columnsOf(1920, 300, 4)).toBe(4);
		expect(columnsOf(1300, 2400, 4)).toBe(1);
	});

	it("grid: a short last band stretches to the full width", () => {
		const layout = arrangeGrid({
			preset: "grid",
			widgetIds: ids(5),
			layout: [],
			cols: 12,
			width: 1920,
			height: 1000,
		});
		expect(layout.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
			{ x: 0, y: 0, w: 4, h: 16 },
			{ x: 4, y: 0, w: 4, h: 16 },
			{ x: 8, y: 0, w: 4, h: 16 },
			{ x: 0, y: 16, w: 6, h: 15 },
			{ x: 6, y: 16, w: 6, h: 15 },
		]);
	});

	it("columns: full height side by side, wrapping into balanced bands", () => {
		const one = arrangeGrid({
			preset: "columns",
			widgetIds: ids(5),
			layout: [],
			cols: 12,
			width: 1920,
			height: 1000,
		});
		expect(one.every((item) => item.y === 0 && item.h === 31)).toBe(true);
		expect(one.map((item) => item.w)).toEqual([3, 3, 2, 2, 2]);

		const wrapped = arrangeGrid({
			preset: "columns",
			widgetIds: ids(7),
			layout: [],
			cols: 12,
			width: 1920,
			height: 1000,
		});
		expect(wrapped.filter((item) => item.y === 0)).toHaveLength(4);
		expect(wrapped.filter((item) => item.y === 16)).toHaveLength(3);
	});

	it("rows: full width, heights sharing the budget", () => {
		const layout = arrangeGrid({
			preset: "rows",
			widgetIds: ids(3),
			layout: [],
			cols: 10,
			width: 1100,
			height: 1000,
		});
		expect(layout.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
			{ x: 0, y: 0, w: 10, h: 11 },
			{ x: 0, y: 11, w: 10, h: 10 },
			{ x: 0, y: 21, w: 10, h: 10 },
		]);
	});

	it("focus: large first tile beside a strip on a wide grid", () => {
		const layout = arrangeGrid({
			preset: "focus",
			widgetIds: ids(4),
			layout: [],
			cols: 12,
			width: 1920,
			height: 1000,
		});
		expect(layout.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
			{ x: 0, y: 0, w: 8, h: 31 },
			{ x: 8, y: 0, w: 4, h: 11 },
			{ x: 8, y: 11, w: 4, h: 10 },
			{ x: 8, y: 21, w: 4, h: 10 },
		]);
	});

	it("focus: large tile on top on a narrow grid", () => {
		const layout = arrangeGrid({
			preset: "focus",
			widgetIds: ids(3),
			layout: [],
			cols: 4,
			width: 600,
			height: 1000,
		});
		expect(layout.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
			{ x: 0, y: 0, w: 4, h: 19 },
			{ x: 0, y: 19, w: 4, h: 6 },
			{ x: 0, y: 25, w: 4, h: 6 },
		]);
	});

	it("focus: a single widget fills everything", () => {
		for (const cols of COLUMN_COUNTS) {
			const [only] = arrangeGrid({
				preset: "focus",
				widgetIds: ids(1),
				layout: [],
				cols,
				width: 1000,
				height: 1000,
			});
			expect(only).toMatchObject({ x: 0, y: 0, w: cols, h: 31 });
		}
	});

	it("keeps the minimum height and extends when the budget is short", () => {
		// 21 rows cannot hold 5 bands of 6.
		const layout = arrangeGrid({
			preset: "rows",
			widgetIds: ids(5),
			layout: [],
			cols: 12,
			width: 1280,
			height: 700,
		});
		expect(layout.every((item) => item.h === MIN_TILE_ROWS)).toBe(true);
		expect(bottomOf(layout)).toBe(30);
	});

	it("follows the reading order of the current layout", () => {
		const current: LayoutItem[] = [
			{ i: "c", x: 6, y: 4, w: 2, h: 2 },
			{ i: "a", x: 0, y: 0, w: 2, h: 2 },
			{ i: "d", x: 0, y: 9, w: 2, h: 2 },
			{ i: "b", x: 3, y: 4, w: 2, h: 2 },
		];
		const order = (layout: LayoutItem[]) => layout.map((item) => item.i);
		for (const preset of PRESETS) {
			const once = arrangeGrid({
				preset,
				// Dashboard order differs from reading order on purpose.
				widgetIds: ["d", "c", "b", "a"],
				layout: current,
				cols: 12,
				width: 1920,
				height: 1000,
			});
			expect(order(once)).toEqual(["a", "b", "c", "d"]);

			// Applying a preset to its own result keeps the order.
			const twice = arrangeGrid({
				preset,
				widgetIds: ["d", "c", "b", "a"],
				layout: once,
				cols: 12,
				width: 1920,
				height: 1000,
			});
			expect(twice).toEqual(once);
		}
	});

	it("appends widgets that have no layout item", () => {
		const layout = arrangeGrid({
			preset: "rows",
			widgetIds: ["new1", "a", "new2", "b"],
			layout: [
				{ i: "b", x: 0, y: 5, w: 2, h: 2 },
				{ i: "a", x: 0, y: 0, w: 2, h: 2 },
			],
			cols: 12,
			width: 1920,
			height: 1000,
		});
		expect(layout.map((item) => item.i)).toEqual([
			"a",
			"b",
			"new1",
			"new2",
		]);
	});

	it("drops layout items of widgets that no longer exist", () => {
		const layout = arrangeGrid({
			preset: "grid",
			widgetIds: ["a"],
			layout: [
				{ i: "gone", x: 0, y: 0, w: 2, h: 2 },
				{ i: "a", x: 4, y: 0, w: 2, h: 2 },
			],
			cols: 12,
			width: 1920,
			height: 1000,
		});
		expect(layout).toEqual([{ i: "a", x: 0, y: 0, w: 12, h: 31 }]);
	});

	it("keeps the other properties of a layout item", () => {
		const [item] = arrangeGrid({
			preset: "columns",
			widgetIds: ["a"],
			layout: [{ i: "a", x: 3, y: 3, w: 1, h: 1, minW: 2, static: true }],
			cols: 6,
			width: 900,
			height: 700,
		});
		expect(item).toEqual({
			i: "a",
			x: 0,
			y: 0,
			w: 6,
			h: 21,
			minW: 2,
			static: true,
		});
	});

	it("returns nothing for an empty dashboard", () => {
		expect(
			arrangeGrid({
				preset: "grid",
				widgetIds: [],
				layout: [{ i: "gone", x: 0, y: 0, w: 2, h: 2 }],
				cols: 12,
				width: 1920,
				height: 1000,
			}),
		).toEqual([]);
	});
});
