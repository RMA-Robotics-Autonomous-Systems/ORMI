import { describe, expect, it } from "bun:test";
import {
	PICK_TOLERANCE_PX,
	choosePick,
	rankingArea,
	startsNewDrawing,
} from "./map-pick";

const square = (size: number) => ({
	type: "Polygon",
	coordinates: [
		[
			[0, 0],
			[size, 0],
			[size, size],
			[0, size],
			[0, 0],
		],
	],
});

const geofence = {
	id: "geofence",
	featureType: "geofence",
	geometry: square(10),
};
const risk = { id: "danger1", featureType: "risk", geometry: square(1) };
const road = {
	id: "road",
	featureType: "road",
	geometry: {
		type: "LineString",
		coordinates: [
			[0, 0],
			[5, 5],
		],
	},
};
const waypoint = {
	id: "wp",
	featureType: "waypoint",
	geometry: { type: "Point", coordinates: [1, 1] },
};

describe("choosePick", () => {
	it("picks the smaller area over the geofence that contains it", () => {
		// Usability test 2026-11-12: clicks inside a risk zone picked the
		// geofence drawn on top of it.
		expect(choosePick([geofence, risk])).toBe("danger1");
		expect(choosePick([risk, geofence])).toBe("danger1");
	});

	it("picks a line over the areas around it", () => {
		expect(choosePick([geofence, road, risk])).toBe("road");
	});

	it("picks a point over everything", () => {
		expect(choosePick([geofence, road, waypoint, risk])).toBe("wp");
	});

	it("never picks a locked layer", () => {
		expect(choosePick([geofence, risk], new Set(["risk"]))).toBe(
			"geofence",
		);
		expect(choosePick([geofence], new Set(["geofence"]))).toBeNull();
	});

	it("returns null for nothing under the pointer", () => {
		expect(choosePick([])).toBeNull();
	});

	it("looks a few pixels around the click", () => {
		expect(PICK_TOLERANCE_PX).toBeGreaterThanOrEqual(4);
		expect(PICK_TOLERANCE_PX).toBeLessThanOrEqual(10);
	});
});

describe("rankingArea", () => {
	it("measures a polygon's outer ring", () => {
		expect(rankingArea(square(2))).toBe(4);
	});

	it("is infinite for no geometry", () => {
		expect(rankingArea(null)).toBe(Number.POSITIVE_INFINITY);
	});
});

describe("startsNewDrawing", () => {
	it("is true when a draw mode creates a feature", () => {
		for (const mode of ["point", "linestring", "polygon", "rectangle"])
			expect(startsNewDrawing("create", mode)).toBe(true);
	});

	it("ignores the select mode creating its handles", () => {
		expect(startsNewDrawing("create", "select")).toBe(false);
	});

	it("ignores updates, deletes and the static mode", () => {
		expect(startsNewDrawing("update", "polygon")).toBe(false);
		expect(startsNewDrawing("delete", "linestring")).toBe(false);
		expect(startsNewDrawing("create", "static")).toBe(false);
	});

	it("ignores a feature added through the API (opened for editing)", () => {
		expect(startsNewDrawing("create", "polygon", { origin: "api" })).toBe(
			false,
		);
		expect(startsNewDrawing("create", "polygon", {})).toBe(true);
	});
});
