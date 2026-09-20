import { describe, test, expect } from "bun:test";
import {
	DISTANCE_RANGE_RELEASE,
	MIN_DISTANCE_RANGE,
	observePointRange,
	RANGE_SAMPLE_BUDGET,
	relaxDistanceRange,
} from "../streamed-geometry";

/** Pack `count` points on the +x axis, the last one at `farthest` metres. */
const rampAlongX = (count: number, farthest: number): Float32Array => {
	const points = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		points[i * 3] = (farthest * (i + 1)) / count;
	}
	return points;
};

describe("observePointRange", () => {
	test("an empty cloud has no range", () => {
		expect(observePointRange(new Float32Array(0), 0)).toBe(0);
	});

	test("measures from the cloud's own origin, in every direction", () => {
		// (3, 4, 0) and (0, 0, -12): the second is the farther one.
		const points = new Float32Array([3, 4, 0, 0, 0, -12]);
		expect(observePointRange(points, 2)).toBeCloseTo(12, 6);
	});

	test("reads only pointCount points, not the whole buffer", () => {
		// Capacity is grow-only, so the tail is stale data from a larger cloud.
		const points = new Float32Array([1, 0, 0, 999, 0, 0]);
		expect(observePointRange(points, 1)).toBeCloseTo(1, 6);
	});

	test("stays within the sample budget on a large cloud", () => {
		const count = RANGE_SAMPLE_BUDGET * 40;
		const points = rampAlongX(count, 100);
		let reads = 0;
		const counted = new Proxy(points, {
			get(target, key, receiver) {
				if (typeof key === "string" && /^\d+$/.test(key)) reads++;
				return Reflect.get(target, key, receiver);
			},
		}) as Float32Array;
		observePointRange(counted, count);
		expect(reads).toBeLessThanOrEqual(RANGE_SAMPLE_BUDGET * 3);
	});

	test("sampling never over-estimates the extent", () => {
		// The farthest point is the last one, which a stride may well skip: the
		// shader clamps those to the far colour, which is what they are.
		const count = RANGE_SAMPLE_BUDGET * 10;
		const observed = observePointRange(rampAlongX(count, 100), count);
		expect(observed).toBeGreaterThan(0);
		expect(observed).toBeLessThanOrEqual(100);
	});
});

describe("relaxDistanceRange", () => {
	test("rises to the observed range at once", () => {
		// Clamping a point beyond the range would report it as no further than
		// the current far edge, so growth can never lag.
		expect(relaxDistanceRange(10, 80)).toBe(80);
	});

	test("falls only a fraction of the way per message", () => {
		const next = relaxDistanceRange(100, 50);
		expect(next).toBeCloseTo(100 + (50 - 100) * DISTANCE_RANGE_RELEASE, 6);
		expect(next).toBeLessThan(100);
		expect(next).toBeGreaterThan(50);
	});

	test("a sustained shorter range is reached eventually", () => {
		let range = 100;
		for (let i = 0; i < 500; i++) range = relaxDistanceRange(range, 20);
		expect(range).toBeCloseTo(20, 3);
	});

	test("never normalizes over less than the floor", () => {
		// A first partial scan sitting inside a few centimetres must not be
		// stretched across the whole gradient.
		expect(relaxDistanceRange(MIN_DISTANCE_RANGE, 0)).toBe(
			MIN_DISTANCE_RANGE,
		);
		expect(relaxDistanceRange(MIN_DISTANCE_RANGE, 0.02)).toBe(
			MIN_DISTANCE_RANGE,
		);
		let range = 100;
		for (let i = 0; i < 1000; i++) range = relaxDistanceRange(range, 0);
		expect(range).toBeGreaterThanOrEqual(MIN_DISTANCE_RANGE);
	});

	test("a non-finite running range is replaced, not propagated", () => {
		expect(relaxDistanceRange(Number.NaN, 30)).toBe(30);
	});
});
