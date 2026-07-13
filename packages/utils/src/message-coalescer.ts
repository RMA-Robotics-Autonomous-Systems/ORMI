/**
 * Coalesce-then-dispatch buffer for high-rate message streams.
 *
 * A datasource that parses/decodes each incoming frame at wire rate can
 * saturate the main thread on high-rate topics. This class stashes the **raw**
 * payload per key on arrival (O(1), no byte copies) and defers the expensive
 * decode+dispatch to a fixed-rate drain tick, so a 200 Hz topic then costs at
 * most ~30 decodes/s. It is transport-agnostic: the Foxglove and rosbridge
 * datasource plugins share this one engine and supply only their own
 * decode/convert callback.
 *
 * Two modes per key (a key identifies one topic subscription):
 *
 * - **lossy-latest** (`lossless: false`): only the newest undrained payload is
 *   kept; an arrival that replaces an undrained one is counted as an overwrite.
 *   Correct for state-like topics where the latest sample supersedes older ones
 *   (poses, images, point clouds, battery, ...).
 * - **lossless-queue** (`lossless: true`): arrivals append to a bounded FIFO
 *   that the tick drains fully, in arrival order. Required for delta streams
 *   (TF, multi-publisher DiagnosticArray) where last-wins coalescing would
 *   silently lose messages. If the queue reaches its cap (e.g. timers clamped
 *   in a hidden tab) the queued payloads are drained synchronously instead of
 *   dropped — losslessness always wins over deferral.
 *
 * Two structural guards keep a heavy-decode burst from monopolising the event
 * loop (the `ws://` main-thread failure mode — several heavy point clouds plus
 * a full TF queue decoded in one un-yielding long task starves the render
 * loop):
 *
 * - **Per-tick time budget**: each drain pass decodes only until a wall-clock
 *   budget is exceeded, then returns and yields the event loop. The remaining
 *   queued work is picked up by an immediate catch-up tick (`setTimeout(0)`, a
 *   macrotask so rAF and downstream pumps run between chunks) or the next
 *   interval. Per-topic FIFO ordering and lossy latest-wins are preserved
 *   across the yield, and no payload is decoded twice.
 * - **Per-topic decode-rate cap** (lossy only): a key may carry a minimum
 *   decode interval so an expensive payload (e.g. PointCloud2) decodes at most
 *   ~N Hz regardless of arrival rate. A capped slot that decoded too recently
 *   is left holding its newest payload for a later tick; bursts coalesce to
 *   LATEST and the newest frame is never dropped. Frames superseded before they
 *   decode are counted as overwrites, so the produced-vs-delivered drop ratio
 *   stays honest.
 *
 * Every dispatch is wrapped in try/catch inside the drain loop, so one throwing
 * payload cannot abort the pass mid-drain or starve the other keys; the error
 * is routed to {@link MessageCoalescerOptions.onError}.
 */

import { metrics, type CounterId, type RingId } from "./metrics/metrics-core";

/** Key type identifying an independent stream (one per topic subscription). */
export type CoalescerKey = string | number;

/**
 * Metric ids for a coalescer instance. All fields are optional; a field left
 * undefined skips that metric entirely. Register the ids once (they are
 * idempotent per name) and pass them in {@link MessageCoalescerOptions.metrics}.
 */
export interface CoalescerMetrics {
	/** Counter incremented on every lossy overwrite (includes cap-shed frames). */
	overwrites?: CounterId;
	/** Counter incremented on every dispatched (decoded) payload. */
	decoded?: CounterId;
	/**
	 * Ring of dispatch durations in ms. Sampled only on the heavy tier
	 * ({@link metrics}.`heavy`), so it costs nothing when diagnostics are off.
	 */
	dispatchMs?: RingId;
}

/** Options for {@link MessageCoalescer}. */
export interface MessageCoalescerOptions {
	/** Drain tick period in milliseconds. Defaults to 33 (~30 Hz). */
	intervalMs?: number;
	/**
	 * Max entries a lossless queue may hold before it is drained synchronously
	 * on push. Defaults to 200.
	 */
	losslessCap?: number;
	/**
	 * Wall-clock budget in milliseconds for a single drain pass. Once a pass has
	 * spent this long decoding it stops and defers the rest to a catch-up tick,
	 * yielding the event loop. Defaults to {@link DEFAULT_BUDGET_MS}.
	 */
	budgetMs?: number;
	/**
	 * Monotonic clock, injectable for tests. Defaults to `performance.now`. Used
	 * for the per-tick time budget, the per-topic decode cap, and dispatch-time
	 * sampling.
	 */
	now?: () => number;
	/**
	 * Metric ids to emit into the shared {@link metrics} registry. Omit to do
	 * zero metric work.
	 */
	metrics?: CoalescerMetrics;
	/**
	 * Invoked when a dispatch throws, with the error and the offending key.
	 * Defaults to `console.error`. A throw never aborts the drain pass.
	 */
	onError?: (error: unknown, key: CoalescerKey) => void;
}

/**
 * Mutable wrapper for the newest undrained lossy payload of a key. Kept across
 * drains and mutated in place so steady-state pushes allocate nothing.
 */
interface LossySlot<T> {
	value: T | undefined;
	/**
	 * Minimum ms between decodes for this key (0 = uncapped). Set on push from
	 * the caller's per-topic hint; a constant per topic, so pushing it every
	 * arrival allocates nothing.
	 */
	minDecodeIntervalMs: number;
	/** Clock value at the last decode of this key; drives the decode-rate cap. */
	lastDecodeAt: number;
}

const DEFAULT_INTERVAL_MS = 33;
const DEFAULT_LOSSLESS_CAP = 200;
/**
 * Default per-tick decode budget (ms). Sized so one pass cannot synchronously
 * decode several heavy point clouds plus a full TF queue in a single long task;
 * the remainder yields to downstream pumps and rAF render between chunks.
 */
const DEFAULT_BUDGET_MS = 5;

/**
 * Per-key raw-payload stash with a shared drain tick.
 *
 * @typeParam T - Raw payload type (stored as-is, never copied).
 * @typeParam K - Key type; defaults to `number`. Foxglove keys by numeric
 *   subscription id, rosbridge by topic-name string.
 */
export class MessageCoalescer<T, K extends CoalescerKey = number> {
	private readonly dispatch: (entry: T, key: K) => void;
	private readonly intervalMs: number;
	private readonly losslessCap: number;
	private readonly budgetMs: number;
	private readonly now: () => number;
	private readonly metricIds?: CoalescerMetrics;
	private readonly onError: (error: unknown, key: K) => void;

	/** key → newest undrained payload (lossy-latest mode). */
	private readonly lossy = new Map<K, LossySlot<T>>();
	/** key → bounded FIFO of undrained payloads (lossless-queue mode). */
	private readonly lossless = new Map<K, T[]>();

	private timer: ReturnType<typeof setInterval> | null = null;
	/** Pending catch-up macrotask when a pass yielded with work remaining. */
	private catchUpTimer: ReturnType<typeof setTimeout> | null = null;
	private overwrites = 0;

	/**
	 * @param dispatch Decode+dispatch callback invoked once per drained payload,
	 *   with the payload and its key. A throw is caught and routed to `onError`.
	 * @param options See {@link MessageCoalescerOptions}.
	 */
	constructor(
		dispatch: (entry: T, key: K) => void,
		options?: MessageCoalescerOptions,
	) {
		this.dispatch = dispatch;
		this.intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
		this.losslessCap = options?.losslessCap ?? DEFAULT_LOSSLESS_CAP;
		this.budgetMs = options?.budgetMs ?? DEFAULT_BUDGET_MS;
		this.now = options?.now ?? (() => performance.now());
		this.metricIds = options?.metrics;
		this.onError =
			options?.onError ??
			((error, key) =>
				console.error(`Message dispatch failed (key ${key}):`, error));
	}

	/**
	 * Total lossy payloads replaced before they were drained. Includes frames
	 * shed by the per-topic decode-rate cap (a capped slot holds its newest
	 * payload; a later arrival that supersedes it before it decodes is an
	 * overwrite), so this is the honest lossy drop count.
	 */
	get overwriteCount(): number {
		return this.overwrites;
	}

	/**
	 * Stash a raw payload for `key`. O(1) and allocation-free in steady state
	 * (lossy mode reuses its slot; lossless mode appends to an existing array). A
	 * lossless push onto a full queue first drains that queue synchronously so
	 * nothing is dropped.
	 *
	 * @param key Stream identifier.
	 * @param entry Raw payload, stored as-is.
	 * @param lossless `true` → lossless-queue mode; `false` → lossy-latest.
	 * @param minDecodeIntervalMs Minimum ms between decodes for a lossy key
	 *   (0 = uncapped). Ignored for lossless keys. Pass a per-topic constant.
	 */
	push(key: K, entry: T, lossless: boolean, minDecodeIntervalMs = 0): void {
		if (lossless) {
			let queue = this.lossless.get(key);
			if (queue === undefined) {
				queue = [];
				this.lossless.set(key, queue);
			}
			if (queue.length >= this.losslessCap) {
				this.drainQueue(queue, key);
			}
			queue.push(entry);
		} else {
			const slot = this.lossy.get(key);
			if (slot === undefined) {
				this.lossy.set(key, {
					value: entry,
					minDecodeIntervalMs,
					lastDecodeAt: Number.NEGATIVE_INFINITY,
				});
			} else {
				if (slot.value !== undefined) this.countOverwrite();
				slot.value = entry;
				slot.minDecodeIntervalMs = minDecodeIntervalMs;
			}
		}
	}

	/**
	 * Drain within one time budget: lossless queues (in arrival order) before
	 * lossy entries (latest only). Stops once the budget is exceeded, leaving the
	 * untouched remainder in place for the next pass — per-topic FIFO and lossy
	 * latest-wins are preserved and nothing is decoded twice.
	 *
	 * @returns `true` when all budget-eligible work drained; `false` when the
	 *   budget forced an early exit with work still queued (the tick then
	 *   schedules a catch-up). Cap-deferred lossy slots are not "remaining work"
	 *   for this purpose — they wait for the next interval, not a busy-loop
	 *   catch-up.
	 */
	drainAll(): boolean {
		const start = this.now();
		let yielded = false;

		// Lossless first: dispatch each queue head-to-tail, removing the
		// dispatched prefix on an early exit so the FIFO remainder survives.
		for (const [key, queue] of this.lossless) {
			if (queue.length === 0) continue;
			let i = 0;
			while (i < queue.length) {
				this.dispatchOne(queue[i]!, key);
				i++;
				if (this.now() - start >= this.budgetMs) {
					queue.splice(0, i);
					yielded = true;
					break;
				}
			}
			if (yielded) break;
			queue.length = 0;
		}

		// Lossy: newest per key, honouring the per-topic decode-rate cap.
		if (!yielded) {
			for (const [key, slot] of this.lossy) {
				const value = slot.value;
				if (value === undefined) continue;

				const t = this.now();
				// Decode-rate cap: decoded too recently → keep the newest
				// payload for a later tick. Never dropped; a fresh arrival
				// simply overwrites it (counted above) and the latest wins.
				if (
					slot.minDecodeIntervalMs > 0 &&
					t - slot.lastDecodeAt < slot.minDecodeIntervalMs
				) {
					continue;
				}

				// Clear before dispatching so a push re-entering during
				// dispatch is kept for the next drain instead of being wiped
				// afterwards.
				slot.value = undefined;
				slot.lastDecodeAt = t;
				this.dispatchOne(value, key);

				if (this.now() - start >= this.budgetMs) {
					yielded = true;
					break;
				}
			}
		}

		// A yield only needs a catch-up if work the budget skipped is still
		// decodable now. Cap-deferred slots are excluded — they wait for the
		// next interval, not a busy-loop catch-up.
		return yielded ? !this.hasDecodableWork(this.now()) : true;
	}

	/**
	 * True when a payload could be decoded at clock `t` right now: any non-empty
	 * lossless queue, or any lossy slot whose newest payload is past its
	 * decode-rate cap. Scanned only after a budget yield.
	 */
	private hasDecodableWork(t: number): boolean {
		for (const queue of this.lossless.values()) {
			if (queue.length > 0) return true;
		}
		for (const slot of this.lossy.values()) {
			if (slot.value === undefined) continue;
			if (
				slot.minDecodeIntervalMs > 0 &&
				t - slot.lastDecodeAt < slot.minDecodeIntervalMs
			) {
				continue;
			}
			return true;
		}
		return false;
	}

	/** Start the drain tick. Idempotent. */
	start(): void {
		if (this.timer !== null) return;
		this.timer = setInterval(() => this.tick(), this.intervalMs);
	}

	/** Stop the drain tick and discard all undrained payloads. Idempotent. */
	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		if (this.catchUpTimer !== null) {
			clearTimeout(this.catchUpTimer);
			this.catchUpTimer = null;
		}
		this.lossy.clear();
		this.lossless.clear();
	}

	/**
	 * Drop the stash for `key`.
	 *
	 * @param key Stream identifier.
	 * @param flush When `false` (default) undrained payloads are discarded; when
	 *   `true` they are drained (dispatched) before the key is removed, so a
	 *   lossless topic never loses queued messages on unsubscribe.
	 */
	remove(key: K, flush = false): void {
		if (flush) {
			const queue = this.lossless.get(key);
			if (queue !== undefined && queue.length > 0) {
				this.drainQueue(queue, key);
			}
			const slot = this.lossy.get(key);
			if (slot !== undefined && slot.value !== undefined) {
				const value = slot.value;
				slot.value = undefined;
				this.dispatchOne(value, key);
			}
		}
		this.lossy.delete(key);
		this.lossless.delete(key);
	}

	/**
	 * One scheduled drain pass. When the budget forced an early exit with work
	 * still queued, schedule an immediate catch-up so the remainder drains on the
	 * next macrotask (yielding to rAF/downstream pumps between chunks) rather
	 * than waiting a full interval.
	 */
	private tick(): void {
		const finished = this.drainAll();
		if (!finished) this.scheduleCatchUp();
	}

	/** Queue a single catch-up macrotask; coalesced so passes never stack. */
	private scheduleCatchUp(): void {
		if (this.catchUpTimer !== null) return;
		this.catchUpTimer = setTimeout(() => {
			this.catchUpTimer = null;
			this.tick();
		}, 0);
	}

	/** Dispatch all entries of a lossless queue in order, then empty it. */
	private drainQueue(queue: T[], key: K): void {
		for (let i = 0; i < queue.length; i++) {
			this.dispatchOne(queue[i]!, key);
		}
		queue.length = 0;
	}

	/**
	 * Dispatch one payload with error isolation and optional metrics. A throw is
	 * routed to `onError` and never propagates, so it cannot abort a drain pass.
	 */
	private dispatchOne(entry: T, key: K): void {
		const ids = this.metricIds;
		const timed = ids?.dispatchMs !== undefined && metrics.heavy;
		const startedAt = timed ? this.now() : 0;

		try {
			this.dispatch(entry, key);
		} catch (error) {
			this.onError(error, key);
		}

		if (ids !== undefined) {
			if (ids.decoded !== undefined) metrics.add(ids.decoded);
			if (timed) metrics.observe(ids.dispatchMs!, this.now() - startedAt);
		}
	}

	/** Record a lossy overwrite in the local counter and the metrics registry. */
	private countOverwrite(): void {
		this.overwrites++;
		if (this.metricIds?.overwrites !== undefined) {
			metrics.add(this.metricIds.overwrites);
		}
	}
}
