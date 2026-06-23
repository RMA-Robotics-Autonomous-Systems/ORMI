import { describe, test, expect, beforeEach } from "bun:test";
import { Metrics, metrics } from "../metrics/metrics-core";

describe("Metrics counters", () => {
	let m: Metrics;

	beforeEach(() => {
		m = new Metrics();
	});

	test("counter() is idempotent — same name returns same id", () => {
		const a = m.counter("wire.x.delivered");
		const b = m.counter("wire.x.delivered");
		expect(b).toBe(a);
		expect(m.counter("wire.y.delivered")).not.toBe(a);
	});

	test("add() increments by 1 by default and by delta when given", () => {
		const id = m.counter("c");
		m.add(id);
		m.add(id);
		m.add(id, 5);
		const snap = m.snapshot();
		expect(snap.counters.names).toEqual(["c"]);
		expect(snap.counters.values).toEqual([7]);
	});

	test("set() overwrites the value and marks the id as a gauge", () => {
		const counterId = m.counter("c");
		const gaugeId = m.counter("g");
		m.add(counterId, 3);
		m.set(gaugeId, 42);
		m.set(gaugeId, 10);
		const snap = m.snapshot();
		expect(snap.counters.values).toEqual([3, 10]);
		expect(snap.counters.gauges).toEqual([false, true]);
	});

	test("a counter later set() becomes a gauge permanently", () => {
		const id = m.counter("c");
		m.add(id);
		expect(m.snapshot().counters.gauges).toEqual([false]);
		m.set(id, 99);
		expect(m.snapshot().counters.gauges).toEqual([true]);
	});

	test("storage grows by doubling past the initial capacity, preserving values", () => {
		const ids: number[] = [];
		for (let i = 0; i < 40; i++) {
			const id = m.counter(`c${i}`);
			ids.push(id);
			m.add(id, i);
		}
		const snap = m.snapshot();
		expect(snap.counters.names.length).toBe(40);
		for (let i = 0; i < 40; i++) {
			expect(ids[i]).toBe(i);
			expect(snap.counters.values[i]).toBe(i);
		}
	});
});

describe("Metrics rings", () => {
	let m: Metrics;

	beforeEach(() => {
		m = new Metrics();
	});

	test("ring() is idempotent — same name returns same id", () => {
		const a = m.ring("r", 8);
		const b = m.ring("r", 64);
		expect(b).toBe(a);
	});

	test("snapshot exposes only valid entries before the ring is full", () => {
		const id = m.ring("r", 4);
		m.observe(id, 1);
		m.observe(id, 2);
		const snap = m.snapshot();
		expect(snap.rings.names).toEqual(["r"]);
		expect(Array.from(snap.rings.values[0]!)).toEqual([1, 2]);
	});

	test("observe() overwrites oldest beyond capacity", () => {
		const id = m.ring("r", 4);
		for (let i = 1; i <= 6; i++) m.observe(id, i);
		const values = Array.from(m.snapshot().rings.values[0]!);
		expect(values.length).toBe(4);
		// 1 and 2 were overwritten by 5 and 6; order is unspecified.
		expect([...values].sort((a, b) => a - b)).toEqual([3, 4, 5, 6]);
	});

	test("snapshot ring values are copies, not live buffers", () => {
		const id = m.ring("r", 4);
		m.observe(id, 1);
		const snap = m.snapshot();
		m.observe(id, 2);
		expect(Array.from(snap.rings.values[0]!)).toEqual([1]);
	});
});

describe("metrics singleton", () => {
	test("reset() clears registrations, values, and the heavy flag", () => {
		const id = metrics.counter("tmp");
		metrics.add(id);
		metrics.ring("tmp.ring");
		metrics.heavy = true;
		metrics.reset();
		expect(metrics.heavy).toBe(false);
		const snap = metrics.snapshot();
		expect(snap.counters.names).toEqual([]);
		expect(snap.rings.names).toEqual([]);
		// Re-registering after reset starts a fresh id space.
		expect(metrics.counter("tmp")).toBe(0);
		metrics.reset();
	});
});
