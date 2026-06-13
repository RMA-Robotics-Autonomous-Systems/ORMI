import { describe, test, expect } from "bun:test";
import { RingPointBuffer } from "../ring-point-buffer";

/** Build packed test arrays for `count` points where point i = (i, i, i). */
function makePoints(count: number, base = 0) {
	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	const intensities = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		positions[i * 3] = base + i;
		positions[i * 3 + 1] = base + i;
		positions[i * 3 + 2] = base + i;
		colors[i * 3] = 1;
		colors[i * 3 + 1] = 1;
		colors[i * 3 + 2] = 1;
		intensities[i] = base + i;
	}
	return { positions, colors, intensities };
}

describe("RingPointBuffer", () => {
	test("stores points and wraps at capacity", () => {
		const ring = new RingPointBuffer(4);
		const a = makePoints(3, 10);
		ring.push(a.positions, a.colors, a.intensities, 3, 1);
		const b = makePoints(2, 20);
		ring.push(b.positions, b.colors, b.intensities, 2, 2);

		const { positions, timestamps } = ring.getData();
		// Slots 0..2 from first push, slot 3 + wrapped slot 0 from second push.
		expect(positions[0]).toBe(20 + 1); // overwritten by wrap
		expect(positions[3]).toBe(11);
		expect(positions[9]).toBe(20); // slot 3
		expect(timestamps[0]).toBe(2);
		expect(timestamps[1]).toBe(1);
	});

	describe("fill count", () => {
		test("starts at zero", () => {
			expect(new RingPointBuffer(8).getFillCount()).toBe(0);
		});

		test("grows with pushes and saturates at capacity", () => {
			const ring = new RingPointBuffer(5);
			const a = makePoints(3);
			ring.push(a.positions, a.colors, a.intensities, 3, 1);
			expect(ring.getFillCount()).toBe(3);
			ring.push(a.positions, a.colors, a.intensities, 3, 2);
			expect(ring.getFillCount()).toBe(5);
			ring.push(a.positions, a.colors, a.intensities, 3, 3);
			expect(ring.getFillCount()).toBe(5);
		});

		test("ignores empty pushes", () => {
			const ring = new RingPointBuffer(5);
			const a = makePoints(1);
			ring.push(a.positions, a.colors, a.intensities, 0, 1);
			expect(ring.getFillCount()).toBe(0);
			expect(ring.drainWriteSpans()).toEqual([]);
		});
	});

	describe("write spans", () => {
		test("single non-wrapping push yields one span", () => {
			const ring = new RingPointBuffer(10);
			const a = makePoints(4);
			ring.push(a.positions, a.colors, a.intensities, 4, 1);
			expect(ring.drainWriteSpans()).toEqual([{ start: 0, count: 4 }]);
		});

		test("drain resets pending spans", () => {
			const ring = new RingPointBuffer(10);
			const a = makePoints(4);
			ring.push(a.positions, a.colors, a.intensities, 4, 1);
			ring.drainWriteSpans();
			expect(ring.drainWriteSpans()).toEqual([]);
		});

		test("accumulates spans across pushes until drained", () => {
			const ring = new RingPointBuffer(20);
			const a = makePoints(3);
			ring.push(a.positions, a.colors, a.intensities, 3, 1);
			ring.push(a.positions, a.colors, a.intensities, 3, 2);
			expect(ring.drainWriteSpans()).toEqual([
				{ start: 0, count: 3 },
				{ start: 3, count: 3 },
			]);
		});

		test("wrapping push yields tail and head spans", () => {
			const ring = new RingPointBuffer(10);
			const a = makePoints(7);
			ring.push(a.positions, a.colors, a.intensities, 7, 1);
			ring.drainWriteSpans();
			const b = makePoints(5);
			ring.push(b.positions, b.colors, b.intensities, 5, 2);
			expect(ring.drainWriteSpans()).toEqual([
				{ start: 7, count: 3 },
				{ start: 0, count: 2 },
			]);
		});

		test("writes covering the whole buffer collapse to one full span", () => {
			const ring = new RingPointBuffer(6);
			const a = makePoints(4);
			ring.push(a.positions, a.colors, a.intensities, 4, 1);
			ring.push(a.positions, a.colors, a.intensities, 4, 2);
			expect(ring.drainWriteSpans()).toEqual([{ start: 0, count: 6 }]);
		});

		test("a single push larger than capacity collapses to one full span", () => {
			const ring = new RingPointBuffer(4);
			const a = makePoints(9);
			ring.push(a.positions, a.colors, a.intensities, 9, 1);
			expect(ring.drainWriteSpans()).toEqual([{ start: 0, count: 4 }]);
			expect(ring.getFillCount()).toBe(4);
		});

		test("shiftTimestamps marks the full buffer pending", () => {
			const ring = new RingPointBuffer(8);
			const a = makePoints(2);
			ring.push(a.positions, a.colors, a.intensities, 2, 5);
			ring.drainWriteSpans();
			ring.shiftTimestamps(5);
			expect(ring.drainWriteSpans()).toEqual([{ start: 0, count: 8 }]);
			expect(ring.getData().timestamps[0]).toBe(0);
		});
	});
});
