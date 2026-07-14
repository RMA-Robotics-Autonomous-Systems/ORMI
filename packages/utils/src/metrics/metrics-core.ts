/**
 * Allocation-free metrics registry.
 *
 * Counters and gauges live in a single `Float64Array`; latency-style samples
 * live in fixed-capacity `Float32Array` rings (overwrite-oldest). Registration
 * (`counter` / `ring`) is the cold path: it allocates, grows storage by
 * doubling, and is idempotent per name. The hot path (`add` / `set` /
 * `observe`) is a typed-array write with no Map lookup, no string handling,
 * and no allocation — callers register once and cache the returned id.
 *
 * Derivation (rates, percentiles) is deliberately NOT done here; see
 * `metrics-reporter.ts`, which pulls `snapshot()` at 1 Hz only while it has
 * subscribers.
 *
 * One instance exists per JS runtime (workers have their own); use the
 * {@link metrics} module singleton.
 */

/** Opaque handle for a registered counter/gauge slot. */
export type CounterId = number;

/** Opaque handle for a registered sample ring. */
export type RingId = number;

/**
 * Point-in-time copy of all metric values, produced on the cold path.
 *
 * `counters.names`, `counters.values`, and `counters.gauges` are parallel
 * arrays: `gauges[i]` is `true` when slot `i` was ever written via
 * {@link Metrics.set} (gauge semantics — the reporter shows the last value
 * and suppresses the rate). Ring values are copies of only the valid entries,
 * in no particular order (percentile computation sorts anyway).
 */
export interface MetricsSnapshot {
	/** `Date.now()` at snapshot time. */
	time: number;
	/** Parallel arrays of counter/gauge names, current values, and gauge flags. */
	counters: { names: string[]; values: number[]; gauges: boolean[] };
	/** Parallel arrays of ring names and copies of their current contents. */
	rings: { names: string[]; values: Float32Array[] };
}

/** Initial counter-slot capacity; storage doubles when exceeded. */
const INITIAL_SLOT_CAPACITY = 16;

/** Default ring capacity when none is given to {@link Metrics.ring}. */
const DEFAULT_RING_CAPACITY = 256;

/** Internal mutable ring record. Fields are mutated in place — no allocation. */
interface Ring {
	buffer: Float32Array;
	/** Next write position (wraps at capacity). */
	write: number;
	/** Number of valid entries (saturates at capacity). */
	count: number;
}

/**
 * Metrics registry. Prefer the {@link metrics} singleton; constructing fresh
 * instances is intended for tests.
 */
export class Metrics {
	/**
	 * Heavy-tier gate. Flipped by the diagnostics overlay host. Anything more
	 * expensive than a counter add (latency sampling, observers, heap reads)
	 * must check this first and bail when `false`.
	 */
	heavy = false;

	/** Counter/gauge value slots; index = `CounterId`. Grows by doubling. */
	private slots = new Float64Array(INITIAL_SLOT_CAPACITY);
	/** Registered counter names; index = `CounterId`. */
	private names: string[] = [];
	/** name → id, for idempotent registration. */
	private counterIds = new Map<string, CounterId>();
	/** Ids that were ever written via {@link set} (gauge semantics). */
	private gaugeIds = new Set<CounterId>();

	/** Registered rings; index = `RingId`. */
	private ringRecords: Ring[] = [];
	/** Registered ring names; index = `RingId`. */
	private ringNames: string[] = [];
	/** name → id, for idempotent registration. */
	private ringIds = new Map<string, RingId>();

	/**
	 * Register (or look up) a counter/gauge slot. Cold path.
	 *
	 * Idempotent: the same name always returns the same id, so re-registration
	 * across mount/unmount cycles does not grow storage.
	 */
	counter(name: string): CounterId {
		const existing = this.counterIds.get(name);
		if (existing !== undefined) return existing;
		const id = this.names.length;
		if (id >= this.slots.length) {
			const grown = new Float64Array(this.slots.length * 2);
			grown.set(this.slots);
			this.slots = grown;
		}
		this.names.push(name);
		this.counterIds.set(name, id);
		return id;
	}

	/** Increment a counter slot. Hot path — a single typed-array add. */
	add(id: CounterId, delta = 1): void {
		this.slots[id] = this.slots[id]! + delta;
	}

	/**
	 * Overwrite a slot with an absolute value (gauge semantics). Hot path.
	 * The id is permanently marked as a gauge on first `set`, and the reporter
	 * then shows the last value instead of a rate.
	 */
	set(id: CounterId, value: number): void {
		this.gaugeIds.add(id);
		this.slots[id] = value;
	}

	/**
	 * Register (or look up) a fixed-capacity sample ring. Cold path.
	 *
	 * Idempotent: the same name always returns the same id; a differing
	 * `capacity` on a repeat call is ignored.
	 */
	ring(name: string, capacity = DEFAULT_RING_CAPACITY): RingId {
		const existing = this.ringIds.get(name);
		if (existing !== undefined) return existing;
		const id = this.ringRecords.length;
		this.ringRecords.push({
			buffer: new Float32Array(capacity),
			write: 0,
			count: 0,
		});
		this.ringNames.push(name);
		this.ringIds.set(name, id);
		return id;
	}

	/**
	 * Write a sample into a ring, overwriting the oldest entry when full.
	 * No allocation. Heavy tier only by convention — callers gate on
	 * {@link heavy} before doing the work that produces the value.
	 */
	observe(id: RingId, value: number): void {
		const ring = this.ringRecords[id]!;
		ring.buffer[ring.write] = value;
		ring.write = (ring.write + 1) % ring.buffer.length;
		if (ring.count < ring.buffer.length) ring.count++;
	}

	/**
	 * Copy all current values out. Cold path — called by the reporter at 1 Hz
	 * while it has subscribers. Ring copies contain only valid entries, in no
	 * particular order.
	 */
	snapshot(): MetricsSnapshot {
		const count = this.names.length;
		const values = new Array<number>(count);
		const gauges = new Array<boolean>(count);
		for (let i = 0; i < count; i++) {
			values[i] = this.slots[i]!;
			gauges[i] = this.gaugeIds.has(i);
		}
		return {
			time: Date.now(),
			counters: { names: this.names.slice(), values, gauges },
			rings: {
				names: this.ringNames.slice(),
				values: this.ringRecords.map((ring) =>
					ring.buffer.slice(0, ring.count),
				),
			},
		};
	}

	/** Drop all registrations, values, and the heavy flag. Test hook. */
	reset(): void {
		this.heavy = false;
		this.slots = new Float64Array(INITIAL_SLOT_CAPACITY);
		this.names = [];
		this.counterIds.clear();
		this.gaugeIds.clear();
		this.ringRecords = [];
		this.ringNames = [];
		this.ringIds.clear();
	}
}

/**
 * Process-global singleton — exactly one per JS runtime (workers have their
 * own instance, with their own counter id space).
 *
 * Pinned on `globalThis` rather than a bare module-level `new Metrics()`: the
 * same module can be instantiated twice when it is reached through two
 * different specifiers that resolve to different physical files — e.g. the
 * `@workspace/utils/metrics` subpath (`dist`) vs. the barrel's relative import
 * (`src`). A bare module singleton would then split into two registries, so a
 * producer that registers on one instance is invisible to a reader on the
 * other (this stranded the broker's `broker.dispatchMs` metric). The
 * `globalThis` pin collapses every copy back to one shared instance.
 */
const globalScope = globalThis as typeof globalThis & {
	__ormiMetrics__?: Metrics;
};
export const metrics: Metrics = (globalScope.__ormiMetrics__ ??= new Metrics());
