import { describe, expect, it } from "bun:test";

import {
	formatBearing,
	isFlat,
	isNorthUp,
	normalizeBearing,
} from "../map-orientation";

describe("normalizeBearing", () => {
	it("folds MapLibre's signed, unbounded bearing into a heading", () => {
		// The map keeps counting past ±180 as the operator drags.
		expect(normalizeBearing(0)).toBe(0);
		expect(normalizeBearing(90)).toBe(90);
		expect(normalizeBearing(-90)).toBe(270);
		expect(normalizeBearing(450)).toBe(90);
		expect(normalizeBearing(-450)).toBe(270);
		expect(normalizeBearing(720)).toBe(0);
	});

	it("answers 0 rather than NaN for a non-finite angle", () => {
		expect(normalizeBearing(Number.NaN)).toBe(0);
		expect(normalizeBearing(Number.POSITIVE_INFINITY)).toBe(0);
	});
});

describe("formatBearing", () => {
	it("pads to three digits so a column of headings lines up", () => {
		expect(formatBearing(0)).toBe("000°");
		expect(formatBearing(7)).toBe("007°");
		expect(formatBearing(37)).toBe("037°");
		expect(formatBearing(180)).toBe("180°");
	});

	it("rounds before folding, so 359.6 is 000 and never 360", () => {
		// Folding first would print "360°", which is not a heading.
		expect(formatBearing(359.6)).toBe("000°");
		expect(formatBearing(359.4)).toBe("359°");
		expect(formatBearing(-0.4)).toBe("000°");
	});

	it("folds a negative or oversized angle first", () => {
		expect(formatBearing(-90)).toBe("270°");
		expect(formatBearing(450)).toBe("090°");
	});
});

describe("isNorthUp", () => {
	it("treats a hair either side of north as north", () => {
		expect(isNorthUp(0)).toBe(true);
		expect(isNorthUp(0.4)).toBe(true);
		expect(isNorthUp(-0.4)).toBe(true);
		expect(isNorthUp(359.7)).toBe(true);
	});

	it("treats anything an operator could see as rotated", () => {
		expect(isNorthUp(1)).toBe(false);
		expect(isNorthUp(90)).toBe(false);
		expect(isNorthUp(359)).toBe(false);
	});
});

describe("isFlat", () => {
	it("separates tilt from rotation", () => {
		// The standard map opens at pitch 45: a tilt is its normal state,
		// while a rotation is always something the operator did.
		expect(isFlat(0)).toBe(true);
		expect(isFlat(0.3)).toBe(true);
		expect(isFlat(45)).toBe(false);
		expect(isFlat(60)).toBe(false);
	});

	it("reads a non-finite pitch as flat rather than tilting the needle", () => {
		expect(isFlat(Number.NaN)).toBe(true);
	});
});
