/**
 * 1 Hz cold-path derivation over the {@link metrics} registry.
 *
 * The reporter loop starts when the first subscriber arrives and stops when
 * the last one leaves — zero timers while nobody is listening. Each tick
 * snapshots the registry, derives rates (counter delta / dt) and ring
 * percentiles, publishes one frozen-identity {@link MetricsReport}, and
 * chains the next tick. Derivation runs inside `requestIdleCallback` when
 * available (with a 500 ms timeout) so it yields to real work.
 *
 * `subscribeMetricsReport` + `getLastMetricsReport` form a
 * `useSyncExternalStore`-compatible pair: the report reference is stable
 * between ticks, so memoized consumers see a genuinely fresh dependency
 * exactly once per tick.
 *
 * SSR-safe: importing this module never touches browser globals; on the
 * server (`typeof window === "undefined"`) subscribing registers the callback
 * but starts no timers.
 */

import { metrics, type MetricsSnapshot } from "./metrics-core";

/** One derived report, published at most once per second. */
export interface MetricsReport {
	/** `Date.now()` of the underlying snapshot. */
	time: number;
	/** Elapsed ms since the previous snapshot (the rate denominator). */
	intervalMs: number;
	/**
	 * One entry per registered counter/gauge. `ratePerSec` is `null` for
	 * gauges (ids ever written via `metrics.set`) and on the first tick after
	 * the loop starts, when no previous value exists to diff against.
	 */
	counters: Array<{ name: string; value: number; ratePerSec: number | null }>;
	/**
	 * One entry per registered ring: sample count plus nearest-rank
	 * percentiles and max. All zero when the ring is empty.
	 */
	rings: Array<{
		name: string;
		count: number;
		p50: number;
		p95: number;
		p99: number;
		max: number;
	}>;
}

/** Interval between report ticks. */
const TICK_MS = 1000;

/** Upper bound on how long derivation may sit in the idle queue. */
const IDLE_TIMEOUT_MS = 500;

/** Nearest-rank percentile over an ascending-sorted array. */
function percentile(sorted: Float32Array, p: number): number {
	const n = sorted.length;
	if (n === 0) return 0;
	const rank = Math.max(1, Math.ceil((p / 100) * n));
	return sorted[rank - 1]!;
}

/**
 * Pure rate/percentile derivation — the testable core of the reporter.
 *
 * Counters are matched to the previous snapshot positionally (registration is
 * append-only, so index `i` names the same counter in both snapshots; a name
 * mismatch or a counter that did not exist previously yields `ratePerSec:
 * null`, as does any gauge). Ring values are copied and sorted ascending for
 * nearest-rank percentiles.
 *
 * @param prevSnapshot - Snapshot from the previous tick, or `null` on the
 *   first tick (all rates are then `null`).
 * @param snapshot - Current snapshot.
 * @param dtMs - Elapsed ms between the two snapshots; non-positive values
 *   also yield `null` rates.
 */
export function deriveReport(
	prevSnapshot: MetricsSnapshot | null,
	snapshot: MetricsSnapshot,
	dtMs: number,
): MetricsReport {
	const counters = snapshot.counters.names.map((name, i) => {
		const value = snapshot.counters.values[i]!;
		let ratePerSec: number | null = null;
		if (
			!snapshot.counters.gauges[i] &&
			prevSnapshot !== null &&
			dtMs > 0 &&
			prevSnapshot.counters.names[i] === name
		) {
			ratePerSec =
				(value - prevSnapshot.counters.values[i]!) / (dtMs / 1000);
		}
		return { name, value, ratePerSec };
	});

	const rings = snapshot.rings.names.map((name, i) => {
		const sorted = snapshot.rings.values[i]!.slice().sort((a, b) => a - b);
		const count = sorted.length;
		return {
			name,
			count,
			p50: percentile(sorted, 50),
			p95: percentile(sorted, 95),
			p99: percentile(sorted, 99),
			max: count === 0 ? 0 : sorted[count - 1]!,
		};
	});

	return { time: snapshot.time, intervalMs: dtMs, counters, rings };
}

type ReportCallback = (report: MetricsReport) => void;

const subscribers = new Set<ReportCallback>();

let lastReport: MetricsReport | null = null;
let prevSnapshot: MetricsSnapshot | null = null;
/** Loop-start time; rate denominator for the first tick's `intervalMs`. */
let loopStartedAt = 0;
let running = false;
let tickTimer: ReturnType<typeof setTimeout> | null = null;
let idleHandle: number | null = null;

function runDerivation(): void {
	idleHandle = null;
	if (!running) return;
	const snapshot = metrics.snapshot();
	const dtMs = snapshot.time - (prevSnapshot?.time ?? loopStartedAt);
	const report = deriveReport(prevSnapshot, snapshot, dtMs);
	prevSnapshot = snapshot;
	lastReport = report;
	subscribers.forEach((cb) => cb(report));
	scheduleTick();
}

function onTick(): void {
	tickTimer = null;
	if (!running) return;
	// Yield derivation to idle time when the platform supports it; the
	// timeout bounds staleness so a busy main thread still reports.
	if (typeof requestIdleCallback === "function") {
		idleHandle = requestIdleCallback(runDerivation, {
			timeout: IDLE_TIMEOUT_MS,
		});
	} else {
		runDerivation();
	}
}

function scheduleTick(): void {
	tickTimer = setTimeout(onTick, TICK_MS);
}

function startLoop(): void {
	running = true;
	loopStartedAt = Date.now();
	prevSnapshot = null;
	scheduleTick();
}

function stopLoop(): void {
	running = false;
	prevSnapshot = null;
	if (tickTimer !== null) {
		clearTimeout(tickTimer);
		tickTimer = null;
	}
	if (idleHandle !== null) {
		if (typeof cancelIdleCallback === "function")
			cancelIdleCallback(idleHandle);
		idleHandle = null;
	}
}

/**
 * Subscribe to 1 Hz metric reports.
 *
 * The first subscriber starts the report loop; removing the last one stops
 * it (no idle timers). On the server the callback is registered but no loop
 * starts, so it is never invoked until hydration resubscribes in the browser.
 *
 * @returns Unsubscribe function (idempotent).
 */
export function subscribeMetricsReport(cb: ReportCallback): () => void {
	const wasEmpty = subscribers.size === 0;
	subscribers.add(cb);
	if (wasEmpty && typeof window !== "undefined") startLoop();
	let released = false;
	return () => {
		if (released) return;
		released = true;
		subscribers.delete(cb);
		if (subscribers.size === 0) stopLoop();
	};
}

/**
 * Latest derived report, or `null` before the first tick.
 *
 * Identity-stable between ticks: the same object reference is returned until
 * the next tick replaces it, making this safe as a `useSyncExternalStore`
 * snapshot under the React Compiler.
 */
export function getLastMetricsReport(): MetricsReport | null {
	return lastReport;
}
