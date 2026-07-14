/**
 * Opt-in coalescing wrapper that moves decode+clone off the wire-rate path.
 *
 * A worker (or main-thread) datasource that decodes and clones every frame the
 * instant it arrives pays the full cost at **wire rate** — even for topics that
 * arrive far faster than the display can consume, whose extra frames the host
 * store discards anyway. This wrapper flips that ordering: the caller `push`es
 * the **raw** payload per key on arrival (O(1), no decode, no byte copy) and the
 * expensive `decode` + `sink` run only on the underlying
 * {@link MessageCoalescer}'s fixed-rate drain tick, emitting latest-per-topic.
 * A 200 Hz topic then costs at most ~30 decodes/s instead of 200.
 *
 * It is a thin factory over {@link MessageCoalescer}: it owns no state of its
 * own beyond that engine, adds no timers, and is pure/stateless (no React, no
 * DOM). Construct one per transport instance and key it however the transport
 * identifies a stream (Foxglove: numeric subscription id; rosbridge: topic
 * string).
 *
 * ## What the caller supplies
 * - `decode(raw, key)` — the per-frame decode+convert step, run on the drain
 *   tick. Returning `null` skips the emit (undecodable / dropped frame).
 * - Per-`push` `lossless` and `minDecodeIntervalMs` — the caller classifies each
 *   topic, because only it knows which streams are deltas. Delta / multi-
 *   publisher streams (TF, DiagnosticArray) MUST be pushed `lossless` so
 *   last-wins coalescing cannot silently drop messages; state-like streams
 *   (poses, images, point clouds) are lossy-latest, optionally with a per-topic
 *   decode-rate cap for expensive payloads.
 *
 * ## Not baked into core
 * Coalescing is opt-in **at the call site**. The core worker pipe
 * (`ctx.publish`) stays a full-rate pass-through; a datasource that wants
 * latest-per-tick behaviour wraps its publish in one of these. A datasource
 * uses either this (worker-side) or a main-thread coalescer, never both — do not
 * double-coalesce a single stream.
 *
 * @see MessageCoalescer for the drain-tick engine, the per-tick decode budget,
 *   the per-topic decode-rate cap, and the lossy/lossless semantics.
 */

import {
	MessageCoalescer,
	type CoalescerKey,
	type MessageCoalescerOptions,
} from "./message-coalescer";

/**
 * Result of decoding one raw payload. Returned by the caller's `decode` step and
 * forwarded field-by-field to the {@link CoalescedSink}. Return `null` from
 * `decode` to skip the emit entirely (e.g. an undecodable or intentionally
 * dropped frame).
 */
export interface DecodedMessage {
	/** Destination topic name. */
	topic: string;
	/** Decoded/converted payload handed to the sink. */
	data: unknown;
	/** Optional message timestamp in ms. */
	time?: number;
	/** Optional reference frame id. */
	frame?: string;
	/**
	 * Optional zero-copy transfer list for the payload's owned binary buffers
	 * (point-cloud arrays, compressed-image bytes). Passed straight through to
	 * the sink — see `transferablesFor`.
	 */
	transfer?: Transferable[];
}

/**
 * Publish callback invoked once per drained payload. In a worker this wraps
 * `server.emit("topic-published", …, transfer)`; for a `createDatasourceWorker`
 * datasource it wraps `ctx.publish`.
 */
export type CoalescedSink = (
	topic: string,
	data: unknown,
	time?: number,
	frame?: string,
	transfer?: Transferable[],
) => void;

/**
 * The expensive decode+convert step, run on the drain tick (never on the
 * wire-rate `push`). Returns the decoded message, or `null` to skip the emit.
 */
export type CoalescedDecode<Raw, K extends CoalescerKey> = (
	raw: Raw,
	key: K,
) => DecodedMessage | null;

/**
 * Lifecycle handle returned by {@link createCoalescedPublisher}. A thin
 * pass-through to the underlying {@link MessageCoalescer}.
 */
export interface CoalescedPublisher<Raw, K extends CoalescerKey = number> {
	/**
	 * Stash a raw payload for `key` (O(1), no decode). See
	 * {@link MessageCoalescer.push}.
	 *
	 * @param key Stream identifier.
	 * @param raw Raw payload, stored as-is until the drain tick decodes it.
	 * @param lossless `true` → lossless FIFO (delta streams); `false` →
	 *   lossy-latest (state streams).
	 * @param minDecodeIntervalMs Per-topic decode-rate cap in ms for a lossy key
	 *   (0 = uncapped). Ignored for lossless keys.
	 */
	push(
		key: K,
		raw: Raw,
		lossless: boolean,
		minDecodeIntervalMs?: number,
	): void;
	/**
	 * Drop the stash for `key`. See {@link MessageCoalescer.remove}.
	 * @param flush When `true`, drain undrained payloads before removal.
	 */
	remove(key: K, flush?: boolean): void;
	/** Start the drain tick. Idempotent. */
	start(): void;
	/** Stop the drain tick and discard undrained payloads. Idempotent. */
	stop(): void;
	/**
	 * Run one drain pass immediately. Exposed for deterministic testing (drive it
	 * with an injected clock instead of live timers); production uses the tick
	 * started by {@link start}. See {@link MessageCoalescer.drainAll}.
	 */
	drainAll(): boolean;
	/** Total lossy payloads replaced before draining (the honest drop count). */
	readonly overwriteCount: number;
}

/**
 * Build a {@link CoalescedPublisher}: a {@link MessageCoalescer} whose dispatch
 * runs `decode` then, if it returns non-null, forwards the decoded fields to
 * `sink`.
 *
 * @typeParam Raw - Raw payload type, stored as-is and decoded on the drain tick.
 * @typeParam K - Stream key type; defaults to `number`.
 * @param sink - Publish callback for a decoded payload.
 * @param decode - Decode+convert step; `null` skips the emit.
 * @param opts - Forwarded verbatim to the underlying {@link MessageCoalescer}
 *   (intervalMs, budgetMs, losslessCap, now, metrics, onError).
 */
export function createCoalescedPublisher<Raw, K extends CoalescerKey = number>(
	sink: CoalescedSink,
	decode: CoalescedDecode<Raw, K>,
	opts?: MessageCoalescerOptions,
): CoalescedPublisher<Raw, K> {
	const coalescer = new MessageCoalescer<Raw, K>((raw, key) => {
		const decoded = decode(raw, key);
		if (decoded === null) return;
		sink(
			decoded.topic,
			decoded.data,
			decoded.time,
			decoded.frame,
			decoded.transfer,
		);
	}, opts);

	return {
		push: (key, raw, lossless, minDecodeIntervalMs) =>
			coalescer.push(key, raw, lossless, minDecodeIntervalMs),
		remove: (key, flush) => coalescer.remove(key, flush),
		start: () => coalescer.start(),
		stop: () => coalescer.stop(),
		drainAll: () => coalescer.drainAll(),
		get overwriteCount() {
			return coalescer.overwriteCount;
		},
	};
}
