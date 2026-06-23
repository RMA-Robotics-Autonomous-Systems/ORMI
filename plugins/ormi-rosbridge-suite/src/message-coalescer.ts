/**
 * Per-topic message coalescing between the roslib subscription callback and
 * the (expensive) convert + dispatch step.
 *
 * roslib parses every incoming frame internally, but the app-side conversion
 * (base64/typed-array assembly, per-point decoding) does not need to run per
 * message. A high-rate topic only needs its latest sample converted at display
 * rate, so each topic stashes raw parsed messages here and a single shared
 * ~30 Hz tick converts + dispatches what is pending.
 *
 * Two modes:
 * - `lossy-latest`: only the newest undrained message survives; older
 *   undrained ones are overwritten. Correct for sampled state (poses, lidar,
 *   images) where intermediate values carry no information once superseded.
 * - `lossless-queue`: every message is queued and dispatched in order. Needed
 *   for delta streams (e.g. `tf2_msgs/msg/TFMessage`) where dropping a message
 *   loses data. The queue is bounded; hitting the cap drains synchronously
 *   instead of dropping.
 */

/** Coalescing strategy for a registered topic. */
export type CoalesceMode = "lossy-latest" | "lossless-queue";

/** Drain interval (~30 Hz). */
const TICK_MS = 33;

/** Lossless queue bound; reaching it triggers a synchronous drain. */
const LOSSLESS_QUEUE_CAP = 200;

interface TopicEntry {
	mode: CoalesceMode;
	dispatch: (message: unknown) => void;
	/** Latest undrained message (`lossy-latest`). */
	latest: unknown;
	hasLatest: boolean;
	/** Pending messages in arrival order (`lossless-queue`). */
	queue: unknown[];
}

/**
 * One coalescer exists per datasource provider instance. The shared drain
 * tick starts when the first topic registers and stops when the last one
 * unregisters, so an idle datasource costs nothing.
 */
export class MessageCoalescer {
	private entries = new Map<string, TopicEntry>();
	private timer: ReturnType<typeof setInterval> | null = null;

	/**
	 * Register a topic. `dispatch` receives the raw parsed message and runs the
	 * same convert + publish path the roslib callback used to run inline.
	 * Re-registering an existing topic replaces its mode and dispatch.
	 */
	register(
		topic: string,
		mode: CoalesceMode,
		dispatch: (message: unknown) => void,
	): void {
		this.entries.set(topic, {
			mode,
			dispatch,
			latest: undefined,
			hasLatest: false,
			queue: [],
		});
		if (this.timer === null) {
			this.timer = setInterval(() => this.drainAll(), TICK_MS);
		}
	}

	/**
	 * Unregister a topic, draining anything still pending so lossless topics
	 * never lose queued messages on unsubscribe. Stops the shared tick when no
	 * topics remain.
	 */
	unregister(topic: string): void {
		const entry = this.entries.get(topic);
		if (!entry) return;
		this.drainEntry(entry);
		this.entries.delete(topic);
		if (this.entries.size === 0 && this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	/**
	 * Stash an incoming message for its topic. Unknown topics dispatch
	 * immediately (defensive: registration and the roslib callback are wired
	 * together, so this should not happen).
	 */
	push(topic: string, message: unknown): void {
		const entry = this.entries.get(topic);
		if (!entry) return;
		if (entry.mode === "lossy-latest") {
			entry.latest = message;
			entry.hasLatest = true;
			return;
		}
		entry.queue.push(message);
		if (entry.queue.length >= LOSSLESS_QUEUE_CAP) {
			// Cap reached: drain now rather than drop — lossless means lossless.
			this.drainEntry(entry);
		}
	}

	/** Drain everything and unregister all topics. Stops the shared tick. */
	reset(): void {
		for (const entry of this.entries.values()) {
			this.drainEntry(entry);
		}
		this.entries.clear();
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	/** Convert + dispatch everything pending. Runs on the shared tick. */
	drainAll(): void {
		for (const entry of this.entries.values()) {
			this.drainEntry(entry);
		}
	}

	private drainEntry(entry: TopicEntry): void {
		if (entry.mode === "lossy-latest") {
			if (!entry.hasLatest) return;
			const message = entry.latest;
			entry.latest = undefined;
			entry.hasLatest = false;
			this.dispatchSafe(entry, message);
			return;
		}
		if (entry.queue.length === 0) return;
		const pending = entry.queue;
		entry.queue = [];
		for (const message of pending) {
			this.dispatchSafe(entry, message);
		}
	}

	/** One failing message must not kill the tick or starve other topics. */
	private dispatchSafe(entry: TopicEntry, message: unknown): void {
		try {
			entry.dispatch(message);
		} catch (error) {
			console.error("ROS2 message dispatch failed:", error);
		}
	}
}
