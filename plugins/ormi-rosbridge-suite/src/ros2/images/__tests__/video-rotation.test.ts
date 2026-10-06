import { describe, expect, it } from "bun:test";

import { readRotation, rotateBy } from "../video-rotation";

describe("readRotation", () => {
	it("reads a missing or malformed setting as upright", () => {
		expect(readRotation(undefined)).toBe(0);
		expect(readRotation(null)).toBe(0);
		expect(readRotation("90")).toBe(0);
		expect(readRotation(Number.NaN)).toBe(0);
		expect(readRotation(45)).toBe(0);
	});

	it("keeps the four quarter turns", () => {
		for (const value of [0, 90, 180, 270]) {
			expect(readRotation(value)).toBe(value);
		}
	});

	it("folds out-of-range quarter turns into one turn", () => {
		expect(readRotation(360)).toBe(0);
		expect(readRotation(450)).toBe(90);
		expect(readRotation(-90)).toBe(270);
	});
});

describe("rotateBy", () => {
	it("wraps clockwise past a full turn", () => {
		expect(rotateBy(270, 1)).toBe(0);
	});

	it("wraps counter-clockwise below upright", () => {
		expect(rotateBy(0, -1)).toBe(270);
	});

	it("returns to the start after four steps either way", () => {
		let cw = 90;
		let ccw = 90;
		for (let i = 0; i < 4; i++) {
			cw = rotateBy(cw, 1);
			ccw = rotateBy(ccw, -1);
		}
		expect(cw).toBe(90);
		expect(ccw).toBe(90);
	});
});
