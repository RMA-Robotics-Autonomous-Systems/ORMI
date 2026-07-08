/**
 * Coalesce-then-decode buffer for the main-thread Foxglove message path.
 *
 * On HTTPS deployments talking to `ws://` robots, every message must be
 * handled on the main thread (workers cannot open insecure WebSockets there).
 * Decoding each arrival at wire rate saturates the main thread on high-rate
 * topics, so this class stashes the **raw** payload per topic on arrival
 * (O(1), no byte copies) and defers decode+dispatch to a fixed-rate drain
 * tick: a 200 Hz topic then costs at most ~30 decodes/s.
 *
 * Two modes per key (topic subscription):
 *
 * - **lossy-latest** (default): only the newest undrained payload is kept;
 *   an arrival that replaces an undrained one is counted as an overwrite.
 *   Correct for state-like topics where the latest sample supersedes older
 *   ones (poses, images, point clouds, battery, ...).
 * - **lossless-queue**: arrivals append to a bounded FIFO that the tick
 *   drains fully, in arrival order. Required for TF-like delta streams:
 *   different frame pairs arrive in different messages, so last-wins
 *   coalescing would silently lose transforms. If the queue reaches its cap
 *   (e.g. timers clamped in a hidden tab), the queued payloads are drained
 *   synchronously instead of dropped — losslessness always wins over
 *   deferral.
 *
 * Two structural guards keep a heavy-decode burst from monopolising the event
 * loop (the `ws://` main-thread failure mode — three Livox point clouds plus a
 * full TF queue decoded in one un-yielding long task starved the fanout pump
 * and the render loop):
 *
 * - **Per-tick time budget**: each drain pass decodes only until a wall-clock
 *   budget is exceeded, then returns and yields the event loop. The remaining
 *   queued work is picked up by an immediate catch-up tick (`setTimeout(0)`,
 *   a macrotask so rAF and the fanout pump run between chunks) or the next
 *   interval. Per-topic FIFO ordering and lossy latest-wins are preserved
 *   across the yield, and no payload is decoded twice.
 * - **Per-topic decode-rate cap** (lossy only): a key may carry a minimum
 *   decode interval so an expensive payload (e.g. PointCloud2) decodes at most
 *   ~N Hz regardless of arrival rate. A capped slot that decoded too recently
 *   is left holding its newest payload for a later tick; bursts coalesce to
 *   LATEST and the newest frame is never dropped. Frames superseded before
 *   they decode are counted as overwrites, so the produced-vs-delivered drop
 *   ratio stays honest.
 *
 * Error handling is the dispatcher's responsibility: the dispatch callback
 * is expected to contain its own per-message error handling (the existing
 * decode path does), so one bad message cannot break the drain for other
 * topics.
 */

/** Options for {@link MessageCoalescer}. */
export interface MessageCoalescerOptions {
	/** Drain tick period in milliseconds. Defaults to 33 (~30 Hz). */
	intervalMs?: number;
	/**
	 * Max entries a lossless queue may hold before it is drained
	 * synchronously on push. Defaults to 200.
	 */
	losslessCap?: number;
	/**
	 * Wall-clock budget in milliseconds for a single drain pass. Once a pass
	 * has spent this long decoding it stops and defers the rest to a catch-up
	 * tick, yielding the event loop. Defaults to {@link DEFAULT_BUDGET_MS}.
	 */
	budgetMs?: number;
	/**
	 * Monotonic clock, injectable for tests. Defaults to `performance.now`.
	 * Used for both the per-tick time budget and the per-topic decode cap.
	 */
	now?: () => number;
}

/**
 * Mutable wrapper for the newest undrained lossy payload of a key. Kept
 * across drains and mutated in place so steady-state pushes allocate nothing.
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
 * decode several heavy point clouds plus a full TF queue in a single long
 * task; the remainder yields to the fanout pump and rAF render between chunks.
 */
const DEFAULT_BUDGET_MS = 5;

/**
 * Per-key raw-message stash with a shared drain tick.
 *
 * `T` is the raw payload type (stored as-is, never copied); keys identify
 * independent streams (one per topic subscription).
 */
export class MessageCoalescer<T> {
	private readonly dispatch: (entry: T) => void;
	private readonly intervalMs: number;
	private readonly losslessCap: number;
	private readonly budgetMs: number;
	private readonly now: () => number;

	/** key → newest undrained payload (lossy-latest mode). */
	private readonly lossy = new Map<number, LossySlot<T>>();
	/** key → bounded FIFO of undrained payloads (lossless-queue mode). */
	private readonly lossless = new Map<number, T[]>();

	private timer: ReturnType<typeof setInterval> | null = null;
	/** Pending catch-up macrotask when a pass yielded with work remaining. */
	private catchUpTimer: ReturnType<typeof setTimeout> | null = null;
	private overwrites = 0;

	/**
	 * @param dispatch Decode+dispatch callback invoked once per drained
	 *   payload. Must handle its own per-message errors.
	 */
	constructor(
		dispatch: (entry: T) => void,
		options?: MessageCoalescerOptions,
	) {
		this.dispatch = dispatch;
		this.intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
		this.losslessCap = options?.losslessCap ?? DEFAULT_LOSSLESS_CAP;
		this.budgetMs = options?.budgetMs ?? DEFAULT_BUDGET_MS;
		this.now = options?.now ?? (() => performance.now());
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
	 * (lossy mode reuses its slot; lossless mode appends to an existing
	 * array). A lossless push onto a full queue first drains that queue
	 * synchronously so nothing is dropped.
	 *
	 * @param minDecodeIntervalMs Minimum ms between decodes for a lossy key
	 *   (0 = uncapped). Ignored for lossless keys. Pass a per-topic constant.
	 */
	push(
		key: number,
		entry: T,
		lossless: boolean,
		minDecodeIntervalMs = 0,
	): void {
		if (lossless) {
			let queue = this.lossless.get(key);
			if (queue === undefined) {
				queue = [];
				this.lossless.set(key, queue);
			}
			if (queue.length >= this.losslessCap) {
				this.drainQueue(queue);
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
				if (slot.value !== undefined) this.overwrites++;
				slot.value = entry;
				slot.minDecodeIntervalMs = minDecodeIntervalMs;
			}
		}
	}

	/**
	 * Drain within one time budget: lossless queues (in arrival order) before
	 * lossy entries (latest only). Stops once the budget is exceeded, leaving
	 * the untouched remainder in place for the next pass — per-topic FIFO and
	 * lossy latest-wins are preserved and nothing is decoded twice.
	 *
	 * @returns `true` when all budget-eligible work drained; `false` when the
	 *   budget forced an early exit with work still queued (the tick then
	 *   schedules a catch-up). Cap-deferred lossy slots are not "remaining
	 *   work" for this purpose — they wait for the next interval, not a
	 *   busy-loop catch-up.
	 */
	drainAll(): boolean {
		const start = this.now();
		let yielded = false;

		// Lossless first: dispatch each queue head-to-tail, removing the
		// dispatched prefix on an early exit so the FIFO remainder survives.
		for (const queue of this.lossless.values()) {
			if (queue.length === 0) continue;
			let i = 0;
			while (i < queue.length) {
				this.dispatch(queue[i]!);
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
			for (const slot of this.lossy.values()) {
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
				this.dispatch(value);

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
	 * True when a payload could be decoded at clock `t` right now: any
	 * non-empty lossless queue, or any lossy slot whose newest payload is
	 * past its decode-rate cap. Scanned only after a budget yield.
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

	/** Discard any undrained payloads stashed for `key`. */
	remove(key: number): void {
		this.lossy.delete(key);
		this.lossless.delete(key);
	}

	/**
	 * One scheduled drain pass. When the budget forced an early exit with work
	 * still queued, schedule an immediate catch-up so the remainder drains on
	 * the next macrotask (yielding to rAF/fanout between chunks) rather than
	 * waiting a full interval.
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
	private drainQueue(queue: T[]): void {
		for (let i = 0; i < queue.length; i++) {
			this.dispatch(queue[i]!);
		}
		queue.length = 0;
	}
}
