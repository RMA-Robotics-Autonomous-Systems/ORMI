import { describe, expect, it } from "bun:test";

import {
	createAccumulator,
	drawEmissions,
	MAX_BATCH_PER_TOPIC,
	MAX_CATCHUP_MS,
	resetAccumulator,
} from "../loadgen-scheduler";

describe("drawEmissions fractional accumulator", () => {
	/**
	 * Drive a steady dt over simulated time and sum the emissions. The fractional
	 * remainder carried across passes must keep the total within ±1 of the ideal
	 * `rateHz * seconds`, independent of the tick period.
	 */
	const simulateSteady = (
		rateHz: number,
		dtMs: number,
		seconds: number,
	): number => {
		const acc = createAccumulator();
		const passes = Math.round((seconds * 1000) / dtMs);
		let total = 0;
		for (let i = 0; i < passes; i++) {
			total += drawEmissions(acc, rateHz, dtMs);
		}
		return total;
	};

	for (const rateHz of [0.1, 20, 60]) {
		it(`total emissions ≈ rateHz*seconds within ±1 (rate ${rateHz} Hz)`, () => {
			const seconds = 100;
			const dtMs = 16;
			const total = simulateSteady(rateHz, dtMs, seconds);
			const ideal = rateHz * seconds;
			expect(Math.abs(total - ideal)).toBeLessThanOrEqual(1);
		});
	}

	it("converges under jittery dt as well as steady dt", () => {
		const acc = createAccumulator();
		const rateHz = 45;
		let elapsed = 0;
		let total = 0;
		// Random dt in [8, 40] ms for ~60 s of simulated time.
		while (elapsed < 60_000) {
			const dt = 8 + Math.floor(Math.random() * 33);
			total += drawEmissions(acc, rateHz, dt);
			elapsed += dt;
		}
		const ideal = (rateHz * elapsed) / 1000;
		// Within one message plus the sub-1 fraction still owed at the edge.
		expect(Math.abs(total - ideal)).toBeLessThanOrEqual(1);
	});
});

describe("drawEmissions clamps and guards", () => {
	it("clamps a single huge dt to MAX_CATCHUP_MS worth of catch-up", () => {
		const acc = createAccumulator();
		const rateHz = 60;
		// A 10 s stall must NOT dump 600 messages; it is clamped to the ceiling.
		const n = drawEmissions(acc, rateHz, 10_000);
		const maxAllowed = Math.floor((rateHz * MAX_CATCHUP_MS) / 1000);
		expect(n).toBe(maxAllowed);
		expect(n).toBeLessThan(rateHz * 10); // far below the un-clamped backlog
	});

	it("caps a pathological draw at MAX_BATCH_PER_TOPIC", () => {
		const acc = createAccumulator();
		// Absurd rate: rateHz * clampedDt/1000 far exceeds the batch cap.
		const n = drawEmissions(acc, 1_000_000, 10_000);
		expect(n).toBe(MAX_BATCH_PER_TOPIC);
	});

	it("returns 0 for non-positive rate or dt", () => {
		const acc = createAccumulator();
		expect(drawEmissions(acc, 0, 16)).toBe(0);
		expect(drawEmissions(acc, -5, 16)).toBe(0);
		expect(drawEmissions(acc, 60, 0)).toBe(0);
		expect(drawEmissions(acc, 60, -16)).toBe(0);
		expect(acc.owed).toBe(0);
	});
});

describe("burst-closed reset", () => {
	it("resetAccumulator drops the backlog so no burst dump on reopen", () => {
		const acc = createAccumulator();
		const rateHz = 60;
		// Accrue a fractional backlog (dt=105ms → owed = 6.3, emits 6, keeps 0.3),
		// representing owed that built up before the burst window closed.
		drawEmissions(acc, rateHz, 105);
		expect(acc.owed).toBeGreaterThan(0);
		resetAccumulator(acc);
		expect(acc.owed).toBe(0);

		// First pass after reopen with a normal dt emits only that pass's worth,
		// not a suppressed backlog.
		const n = drawEmissions(acc, rateHz, 16);
		expect(n).toBe(Math.floor((rateHz * 16) / 1000));
	});
});
