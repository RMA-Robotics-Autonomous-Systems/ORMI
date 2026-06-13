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
}

/**
 * Mutable wrapper for the newest undrained lossy payload of a key. Kept
 * across drains and mutated in place so steady-state pushes allocate nothing.
 */
interface LossySlot<T> {
	value: T | undefined;
}

const DEFAULT_INTERVAL_MS = 33;
const DEFAULT_LOSSLESS_CAP = 200;

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

	/** key → newest undrained payload (lossy-latest mode). */
	private readonly lossy = new Map<number, LossySlot<T>>();
	/** key → bounded FIFO of undrained payloads (lossless-queue mode). */
	private readonly lossless = new Map<number, T[]>();

	private timer: ReturnType<typeof setInterval> | null = null;
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
	}

	/** Total lossy payloads replaced before they were drained. */
	get overwriteCount(): number {
		return this.overwrites;
	}

	/**
	 * Stash a raw payload for `key`. O(1) and allocation-free in steady state
	 * (lossy mode reuses its slot; lossless mode appends to an existing
	 * array). A lossless push onto a full queue first drains that queue
	 * synchronously so nothing is dropped.
	 */
	push(key: number, entry: T, lossless: boolean): void {
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
				this.lossy.set(key, { value: entry });
			} else {
				if (slot.value !== undefined) this.overwrites++;
				slot.value = entry;
			}
		}
	}

	/**
	 * Drain everything once: lossless queues fully, in arrival order, before
	 * lossy entries (latest only).
	 */
	drainAll(): void {
		for (const queue of this.lossless.values()) {
			if (queue.length > 0) this.drainQueue(queue);
		}
		for (const slot of this.lossy.values()) {
			const value = slot.value;
			if (value === undefined) continue;
			// Clear before dispatching so a push re-entering during dispatch
			// is kept for the next drain instead of being wiped afterwards.
			slot.value = undefined;
			this.dispatch(value);
		}
	}

	/** Start the drain tick. Idempotent. */
	start(): void {
		if (this.timer !== null) return;
		this.timer = setInterval(() => this.drainAll(), this.intervalMs);
	}

	/** Stop the drain tick and discard all undrained payloads. Idempotent. */
	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.lossy.clear();
		this.lossless.clear();
	}

	/** Discard any undrained payloads stashed for `key`. */
	remove(key: number): void {
		this.lossy.delete(key);
		this.lossless.delete(key);
	}

	/** Dispatch all entries of a lossless queue in order, then empty it. */
	private drainQueue(queue: T[]): void {
		for (let i = 0; i < queue.length; i++) {
			this.dispatch(queue[i]!);
		}
		queue.length = 0;
	}
}
