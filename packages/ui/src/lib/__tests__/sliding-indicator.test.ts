import { describe, expect, it } from "bun:test";

import {
	indicatorGeometry,
	indicatorTransform,
	parseTranslate,
	shouldSlide,
} from "../sliding-indicator";

/** A list at (100, 50), 300px wide, unscaled, no border. */
const measure = (
	item: { left: number; top: number; width: number; height: number },
	overrides: Partial<Parameters<typeof indicatorGeometry>[0]> = {},
) => ({
	listRect: { left: 100, top: 50, width: 300 },
	listOffsetWidth: 300,
	listClientLeft: 0,
	listClientTop: 0,
	itemRect: item,
	itemOffsetWidth: item.width,
	itemOffsetHeight: item.height,
	itemTranslateX: 0,
	itemTranslateY: 0,
	...overrides,
});

describe("indicatorGeometry", () => {
	it("covers the item relative to the list's padding edge", () => {
		expect(
			indicatorGeometry(
				measure({ left: 103, top: 53, width: 80, height: 29 }),
			),
		).toEqual({ x: 3, y: 3, width: 80, height: 29 });
	});

	it("keeps a half-pixel position that offsetTop would round away", () => {
		expect(
			indicatorGeometry(
				measure({ left: 103, top: 53.5, width: 80, height: 29 }),
			),
		).toEqual({ x: 3, y: 3.5, width: 80, height: 29 });
	});

	it("measures inside the list's border", () => {
		expect(
			indicatorGeometry(
				measure(
					{ left: 104, top: 54, width: 80, height: 29 },
					{ listClientLeft: 1, listClientTop: 1 },
				),
			),
		).toEqual({ x: 3, y: 3, width: 80, height: 29 });
	});

	it("undoes the list's scale (an overlay still scaling in)", () => {
		// The list renders at 0.98: 294px on screen for 300px of layout, and
		// everything inside it is scaled about its origin by the same factor.
		const s = 0.98;
		expect(
			indicatorGeometry(
				measure(
					{
						left: 100 + 90 * s,
						top: 50 + 3 * s,
						width: 80 * s,
						height: 29 * s,
					},
					{
						listRect: { left: 100, top: 50, width: 300 * s },
						itemOffsetWidth: 80,
						itemOffsetHeight: 29,
					},
				),
			),
		).toEqual({ x: 90, y: 3, width: 80, height: 29 });
	});

	it("ignores the item's own press scale (placed by its centre)", () => {
		// 80x29 at (90, 3), pressed to 0.98 about its centre.
		const w = 80 * 0.98;
		const h = 29 * 0.98;
		expect(
			indicatorGeometry(
				measure(
					{
						left: 100 + 90 + (80 - w) / 2,
						top: 50 + 3 + (29 - h) / 2,
						width: w,
						height: h,
					},
					{ itemOffsetWidth: 80, itemOffsetHeight: 29 },
				),
			),
		).toEqual({ x: 90, y: 3, width: 80, height: 29 });
	});

	it("subtracts the item's own translate (the indicator copies it)", () => {
		expect(
			indicatorGeometry(
				measure(
					{ left: 105, top: 55, width: 80, height: 29 },
					{ itemTranslateX: 2, itemTranslateY: 2 },
				),
			),
		).toEqual({ x: 3, y: 3, width: 80, height: 29 });
	});

	it("follows a vertical or grid list the same way", () => {
		expect(
			indicatorGeometry(
				measure({ left: 103, top: 117, width: 120, height: 32 }),
			),
		).toEqual({ x: 3, y: 67, width: 120, height: 32 });
	});

	it("refuses an item or list with no size (hidden, closed overlay)", () => {
		expect(
			indicatorGeometry(
				measure({ left: 0, top: 0, width: 0, height: 29 }),
			),
		).toBeNull();
		expect(
			indicatorGeometry(
				measure(
					{ left: 0, top: 0, width: 80, height: 29 },
					{ listOffsetWidth: 0 },
				),
			),
		).toBeNull();
	});

	it("refuses non-finite measurements", () => {
		expect(
			indicatorGeometry(
				measure({ left: Number.NaN, top: 0, width: 10, height: 10 }),
			),
		).toBeNull();
	});
});

describe("parseTranslate", () => {
	it("reads none, one and two values", () => {
		expect(parseTranslate("none")).toEqual([0, 0]);
		expect(parseTranslate("2px")).toEqual([2, 0]);
		expect(parseTranslate("2px 3px")).toEqual([2, 3]);
		expect(parseTranslate("-1.5px 0px")).toEqual([-1.5, 0]);
	});

	it("reads what it cannot parse as no offset", () => {
		expect(parseTranslate("")).toEqual([0, 0]);
		expect(parseTranslate(undefined)).toEqual([0, 0]);
		expect(parseTranslate("10%")).toEqual([0, 0]);
	});
});

describe("shouldSlide", () => {
	const a = {};
	const b = {};

	it("slides from one placed item to another", () => {
		expect(shouldSlide(a, b, true)).toBe(true);
	});

	it("snaps on first placement", () => {
		expect(shouldSlide(null, b, false)).toBe(false);
		expect(shouldSlide(null, b, true)).toBe(false);
		expect(shouldSlide(a, b, false)).toBe(false);
	});

	it("snaps when the item is unchanged (a resize, a theme switch)", () => {
		expect(shouldSlide(a, a, true)).toBe(false);
	});

	it("does not slide to nothing", () => {
		expect(shouldSlide(a, null, true)).toBe(false);
	});
});

describe("indicatorTransform", () => {
	it("is a pure translate; size is set as lengths, not a scale", () => {
		expect(indicatorTransform({ x: 3, y: 4, width: 80, height: 29 })).toBe(
			"translate(3px, 4px)",
		);
	});
});
