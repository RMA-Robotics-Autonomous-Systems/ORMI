/**
 * Fractional catch-up scheduler shared by both loadgen transports.
 *
 * The old design gave every subscribed topic its own `setInterval(1000/rateHz)`.
 * With dozens of topics that collapses: browsers keep at most one pending
 * callback per `setInterval`, so under load each per-topic timer fires only once
 * per event-loop pass and every topic converges on a common ~13 Hz service
 * ceiling — independent of its configured rate. Aggregate output then caps at
 * roughly the pass rate × topic count, far below the configured total.
 *
 * This module replaces the per-topic timers with a SINGLE driver loop per
 * generator instance / worker. Each pass, a topic emits `floor(owed)` messages
 * where `owed` accumulates `rateHz * dt/1000` and carries its fractional
 * remainder across passes. Because the emission count is derived from the
 * MEASURED elapsed time `dt`, the achieved rate is decoupled from how often the
 * timer actually services us: if the single timer drifts to 50 ms, a 60 Hz topic
 * emits ~3 messages that pass and the running AVERAGE still equals 60 Hz. Over
 * any window the total emitted is `rateHz * elapsedSeconds ± 1` (the ±1 is the
 * fraction still owed at the window edge). The only ceiling left is the thread's
 * real CPU limit for produce + decode — exactly the knee a load benchmark wants
 * to find, not a timer artifact.
 *
 * The module is intentionally pure and free of worker/DOM globals (no `self`,
 * no `postMessage`), mirroring `loadgen-generators.ts`, so the worker transport
 * and the main-thread React provider both import the identical accumulator math
 * instead of duplicating it.
 */

/**
 * Nominal driver period (~62 Hz). Fine-grained so `floor(owed)` distributes
 * emissions smoothly rather than in coarse clumps; the loop self-corrects on the
 * measured `dt`, so the exact period only affects smoothness, never the rate.
 */
export const SCHEDULER_TICK_MS = 16;

/**
 * Upper clamp applied to a pass's measured `dt` before accumulating owed
 * messages. A long stall (background-tab timer throttling, GC pause) would
 * otherwise credit a huge backlog that dumps as one burst when the tab wakes.
 * We generate live load, we do not replay history, so a stalled pass is capped
 * to at most `MAX_CATCHUP_MS` worth of catch-up.
 */
export const MAX_CATCHUP_MS = 250;

/**
 * Safety cap on messages emitted for one topic in one pass. Never reached at
 * sane rates (60 Hz × 250 ms clamp = 15), it only bounds pathological configs /
 * runaway accumulators so a single pass can never spiral into an unbounded loop.
 */
export const MAX_BATCH_PER_TOPIC = 256;

/**
 * Per-topic fractional emission accumulator. `owed` is the running count of
 * messages the topic still owes given its configured rate and elapsed time;
 * only its whole part is emitted each pass, the fraction is carried forward.
 */
export interface EmitAccumulator {
	/** Fractional count of messages owed but not yet emitted. */
	owed: number;
}

/** Create a fresh accumulator (owes nothing yet). */
export function createAccumulator(): EmitAccumulator {
	return { owed: 0 };
}

/**
 * Reset an accumulator's backlog to zero. Call this while a burst generator's
 * duty-cycle is CLOSED: without it, `owed` keeps accruing across the closed
 * window and dumps the entire suppressed backlog the instant the burst reopens,
 * defeating the point of the duty cycle.
 */
export function resetAccumulator(acc: EmitAccumulator): void {
	acc.owed = 0;
}

/**
 * Compute how many messages a topic should emit this pass and advance its
 * accumulator.
 *
 * Adds `rateHz * min(dtMs, MAX_CATCHUP_MS) / 1000` to `owed`, emits the whole
 * part (capped at {@link MAX_BATCH_PER_TOPIC}), and keeps the fractional
 * remainder in `owed` for the next pass. Because the fraction is preserved, the
 * total over many passes converges on `rateHz * totalSeconds` regardless of how
 * irregular the individual `dt` values are.
 *
 * @param acc - The topic's mutable accumulator (advanced in place).
 * @param rateHz - Configured publish rate in Hz; `<= 0` emits nothing.
 * @param dtMs - Measured elapsed time since the previous pass; `<= 0` emits nothing.
 * @returns The whole number of messages to emit this pass.
 */
export function drawEmissions(
	acc: EmitAccumulator,
	rateHz: number,
	dtMs: number,
): number {
	if (rateHz <= 0 || dtMs <= 0) return 0;
	acc.owed += (rateHz * Math.min(dtMs, MAX_CATCHUP_MS)) / 1000;
	const n = Math.min(Math.floor(acc.owed), MAX_BATCH_PER_TOPIC);
	acc.owed -= n;
	return n;
}
