import { describe, expect, it } from "bun:test";

import {
	canFinishDrawing,
	drawHint,
	drawKeyAction,
	newShapeDiscard,
	nextMapTool,
	placedDrawPoints,
	takesFinishButton,
} from "./map-draw-tool";
import type { DrawShape } from "./mission-editor-helpers";

const SHAPES: DrawShape[] = ["point", "line", "polygon", "rectangle"];

describe("nextMapTool", () => {
	it("Draw toggles between armed and select", () => {
		expect(nextMapTool("select", "toggle")).toBe("draw");
		expect(nextMapTool("draw", "toggle")).toBe("select");
	});

	it("a finished new shape returns the map to select by itself", () => {
		expect(nextMapTool("draw", "finish-new")).toBe("select");
	});

	it("Escape disarms", () => {
		expect(nextMapTool("draw", "escape")).toBe("select");
		expect(nextMapTool("select", "escape")).toBe("select");
	});

	it("an edit of the open shape leaves the tool alone", () => {
		expect(nextMapTool("select", "finish-edit")).toBe("select");
		expect(nextMapTool("draw", "finish-edit")).toBe("draw");
	});
});

describe("drawHint", () => {
	it("states the next step for every shape, in one short line", () => {
		for (const shape of SHAPES) {
			const hint = drawHint(shape);
			expect(hint.length).toBeGreaterThan(0);
			expect(hint.length).toBeLessThanOrEqual(80);
			expect(hint).not.toContain("—");
			expect(hint.endsWith(".")).toBe(true);
		}
	});

	it("names terra-draw's real finish gesture", () => {
		expect(drawHint("point")).toBe("Click to place the point.");
		expect(drawHint("line")).toContain("click the last point to finish");
		expect(drawHint("line")).toContain("Double-click");
		expect(drawHint("polygon")).toContain(
			"click the first corner to finish",
		);
		// The rectangle mode is click-move: two clicks, not a drag.
		expect(drawHint("rectangle")).toBe(
			"Click one corner, then the opposite corner.",
		);
		expect(drawHint("rectangle")).not.toMatch(/drag/i);
	});
});

describe("Finish button", () => {
	it("only a line and a polygon take one", () => {
		expect(SHAPES.filter(takesFinishButton)).toEqual(["line", "polygon"]);
	});

	it("is enabled once the shape has enough points", () => {
		expect(canFinishDrawing("line", 0)).toBe(false);
		expect(canFinishDrawing("line", 1)).toBe(false);
		expect(canFinishDrawing("line", 2)).toBe(true);
		expect(canFinishDrawing("polygon", 2)).toBe(false);
		expect(canFinishDrawing("polygon", 3)).toBe(true);
		expect(canFinishDrawing("polygon", 7)).toBe(true);
	});

	it("never for a shape that finishes on its own click", () => {
		expect(canFinishDrawing("point", 5)).toBe(false);
		expect(canFinishDrawing("rectangle", 5)).toBe(false);
	});
});

describe("placedDrawPoints", () => {
	it("counts a line's points without the live point under the pointer", () => {
		// One click: terra-draw starts the line at two coordinates.
		expect(
			placedDrawPoints({
				geometry: {
					type: "LineString",
					coordinates: [
						[4, 50],
						[4, 50],
					],
				},
				properties: { mode: "linestring", currentlyDrawing: true },
			}),
		).toBe(1);
		expect(
			placedDrawPoints({
				geometry: {
					type: "LineString",
					coordinates: [
						[4, 50],
						[4.1, 50],
						[4.2, 50.1],
					],
				},
				properties: { mode: "linestring", currentlyDrawing: true },
			}),
		).toBe(2);
	});

	it("reads a polygon's own committed count", () => {
		expect(
			placedDrawPoints({
				geometry: { type: "Polygon", coordinates: [] },
				properties: {
					mode: "polygon",
					currentlyDrawing: true,
					committedCoordinateCount: 3,
				},
			}),
		).toBe(3);
	});

	it("a rectangle in progress has its first corner", () => {
		expect(
			placedDrawPoints({
				properties: { mode: "rectangle", currentlyDrawing: true },
			}),
		).toBe(1);
	});

	it("is null for anything not in progress", () => {
		expect(placedDrawPoints(undefined)).toBeNull();
		// Finished: terra-draw clears the flag.
		expect(
			placedDrawPoints({
				geometry: { type: "Polygon", coordinates: [] },
				properties: { mode: "polygon", committedCoordinateCount: 3 },
			}),
		).toBeNull();
		// A closing point (guidance) carries no drawing flag.
		expect(
			placedDrawPoints({
				geometry: { type: "Point", coordinates: [4, 50] },
				properties: { mode: "polygon", closingPoint: true },
			}),
		).toBeNull();
		expect(
			placedDrawPoints({
				properties: { mode: "point", currentlyDrawing: true },
			}),
		).toBeNull();
	});
});

describe("newShapeDiscard", () => {
	it("an unnamed shape goes at once", () => {
		expect(newShapeDiscard("")).toBe("discard");
		expect(newShapeDiscard("   ")).toBe("discard");
	});

	it("a typed name asks first", () => {
		expect(newShapeDiscard("North field")).toBe("ask");
	});
});

describe("drawKeyAction", () => {
	it("Escape disarms", () => {
		expect(drawKeyAction({ key: "Escape" })).toBe("disarm");
	});

	it("Enter is terra-draw's finish key, not the map's", () => {
		expect(drawKeyAction({ key: "Enter" })).toBeNull();
	});

	it("leaves an open list and modified keys alone", () => {
		expect(drawKeyAction({ key: "Escape", inPopup: true })).toBeNull();
		expect(drawKeyAction({ key: "Escape", ctrlKey: true })).toBeNull();
		expect(drawKeyAction({ key: "Delete" })).toBeNull();
	});
});
