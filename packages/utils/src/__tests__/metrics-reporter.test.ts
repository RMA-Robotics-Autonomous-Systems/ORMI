import { describe, test, expect } from "bun:test";
import type { MetricsSnapshot } from "../metrics/metrics-core";
import {
	deriveReport,
	subscribeMetricsReport,
	getLastMetricsReport,
} from "../metrics/metrics-reporter";

function makeSnapshot(
	time: number,
	counters: Array<{ name: string; value: number; gauge?: boolean }>,
	rings: Array<{ name: string; values: number[] }> = [],
): MetricsSnapshot {
	return {
		time,
		counters: {
			names: counters.map((c) => c.name),
			values: counters.map((c) => c.value),
			gauges: counters.map((c) => c.gauge === true),
		},
		rings: {
			names: rings.map((r) => r.name),
			values: rings.map((r) => Float32Array.from(r.values)),
		},
	};
}

describe("deriveReport rates", () => {
	test("computes counter rate as delta / seconds", () => {
		const prev = makeSnapshot(1000, [{ name: "c", value: 10 }]);
		const next = makeSnapshot(3000, [{ name: "c", value: 50 }]);
		const report = deriveReport(prev, next, 2000);
		expect(report.time).toBe(3000);
		expect(report.intervalMs).toBe(2000);
		expect(report.counters).toEqual([
			{ name: "c", value: 50, ratePerSec: 20 },
		]);
	});

	test("first tick (no previous snapshot) yields null rates", () => {
		const next = makeSnapshot(1000, [{ name: "c", value: 50 }]);
		const report = deriveReport(null, next, 1000);
		expect(report.counters[0]!.ratePerSec).toBeNull();
	});

	test("gauges always have null rate", () => {
		const prev = makeSnapshot(1000, [{ name: "g", value: 1, gauge: true }]);
		const next = makeSnapshot(2000, [{ name: "g", value: 9, gauge: true }]);
		const report = deriveReport(prev, next, 1000);
		expect(report.counters).toEqual([
			{ name: "g", value: 9, ratePerSec: null },
		]);
	});

	test("counters registered since the previous snapshot get null rate", () => {
		const prev = makeSnapshot(1000, [{ name: "a", value: 5 }]);
		const next = makeSnapshot(2000, [
			{ name: "a", value: 8 },
			{ name: "b", value: 4 },
		]);
		const report = deriveReport(prev, next, 1000);
		expect(report.counters[0]!.ratePerSec).toBe(3);
		expect(report.counters[1]!.ratePerSec).toBeNull();
	});

	test("non-positive dt yields null rates", () => {
		const prev = makeSnapshot(1000, [{ name: "c", value: 1 }]);
		const next = makeSnapshot(1000, [{ name: "c", value: 2 }]);
		expect(deriveReport(prev, next, 0).counters[0]!.ratePerSec).toBeNull();
	});
});

describe("deriveReport percentiles", () => {
	test("nearest-rank p50/p95/p99 and max over ring samples", () => {
		const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
		const next = makeSnapshot(1000, [], [{ name: "r", values }]);
		const report = deriveReport(null, next, 1000);
		expect(report.rings).toEqual([
			{ name: "r", count: 100, p50: 50, p95: 95, p99: 99, max: 100 },
		]);
	});

	test("small unordered sample", () => {
		const next = makeSnapshot(1000, [], [{ name: "r", values: [7, 1, 5] }]);
		const ring = deriveReport(null, next, 1000).rings[0]!;
		expect(ring.count).toBe(3);
		expect(ring.p50).toBe(5); // ceil(0.5 * 3) = 2nd of [1, 5, 7]
		expect(ring.p95).toBe(7);
		expect(ring.p99).toBe(7);
		expect(ring.max).toBe(7);
	});

	test("empty ring reports zeros", () => {
		const next = makeSnapshot(1000, [], [{ name: "r", values: [] }]);
		expect(deriveReport(null, next, 1000).rings[0]).toEqual({
			name: "r",
			count: 0,
			p50: 0,
			p95: 0,
			p99: 0,
			max: 0,
		});
	});
});

describe("reporter loop (server environment)", () => {
	test("subscribe is loop-less without a window and unsubscribe is idempotent", () => {
		expect(getLastMetricsReport()).toBeNull();
		const unsubscribe = subscribeMetricsReport(() => {
			throw new Error("must not tick on the server");
		});
		expect(getLastMetricsReport()).toBeNull();
		unsubscribe();
		unsubscribe();
	});
});
