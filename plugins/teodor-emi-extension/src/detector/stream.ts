/**
 * The parameter-dependent pipeline's O(n) stage, streamed.
 *
 * A live survey commits every 100 ms and the panels re-run the pipeline on each
 * commit. Everything the pipeline produces is either an array with one entry
 * per sample or a list with one entry per detection, and the two have very
 * different costs: at 32 Hz over twenty minutes the sample-domain stages
 * (EMA → decision variable → rolling medians → motion series) take about 617 ms
 * per pass while the triggers and the placement take about 1.3 ms. Re-sweeping
 * the whole recording ten times a second is what makes the cockpit unusable
 * long before a survey ends.
 *
 * So the rule is a size rule, not a stage rule:
 *
 * > A stage whose output is an array of size **O(n)** is streamed — swept once
 * > per sample, ever. A stage whose output is **O(detections)** is recomputed
 * > whole, on every commit.
 *
 * Streamed here: the decision variable, the MAD `med`/`mad`/`det` baselines,
 * and the `speed`/`turn` motion series. Recomputed whole in
 * {@link replayFrom}: both triggers, georeferencing, cross-coil geometry and
 * association.
 *
 * The triggers are deliberately NOT streamed. Streaming them needs a second
 * latch carry (`active`/`peak`/`peakIdx`/`armMed`/`armMad`/`relT`) and so a
 * second invalidation contract; folding it into this one key would make every
 * `madFactor` tick throw away the expensive MAD baseline, which is a regression
 * on the one slider operators actually drag. The measured remainder is 1.3 ms
 * per commit at twenty minutes and 3.7 ms at an hour, so keeping them whole is
 * free. **The quadratic is reduced, not removed:** a parameter change that
 * moves the key below still costs one full sweep.
 *
 * ## Invariants — the whole design rests on these
 *
 * - `value` and `mad.med`/`mad`/`det` are **final** once written at index `i`.
 *   Every one of those stages is causal: the EMA carries state forward, and
 *   both median windows look backwards only. A consumer may hold them across a
 *   commit.
 * - `speed` and `turn` carry a **provisional tail of `k` samples**, rewritten in
 *   place on the next extend. Both are centred over ±k, so sample `i` depends on
 *   `[i - k, i + k]` and every `i >= n - k` was computed against a window that
 *   the clamp truncated on the right. Each is nonetheless *exactly* what a whole
 *   sweep at the same `n` produces — the tail is provisional, never wrong — but
 *   nothing may cache, persist or export a value read from the last `k` samples
 *   and expect it to still be there.
 * - Every published array is an **exact-length view**: `value.length` is
 *   `n * ncoil` and `speed.length` is `n`. The backing buffers are
 *   over-allocated and double as the run grows; the views are not. Consumers
 *   read a sample count off these lengths, so an over-allocated array would
 *   have them sweep the zeroed slack and draw a plausible flat curve.
 */

import { medianOf } from "./mad";
import { fillSpeedSeries, fillTurnSeries, motionHalfWindow } from "./geometry";
import { madWindows } from "./replay";
import type { MadBaseline } from "./detector-types";
import type { EmiParams } from "./params";
import type { EmiRun } from "./run-types";

/**
 * Everything the parameter-dependent pipeline produces per sample.
 *
 * Read the invariants at the top of this module before holding any of these
 * arrays across a commit.
 */
export interface SampleDomain {
	/** Samples resolved. Authoritative — never infer it from an array length. */
	readonly n: number;
	/** Coils per sample. */
	readonly ncoil: number;
	/** The decision variable, `[n * ncoil]`. */
	readonly value: Int32Array;
	/** Rolling statistics, or null when the fixed detector is selected. */
	readonly mad: MadBaseline | null;
	/** Ground speed, `[n]`. Provisional in its last `k` samples. */
	readonly speed: Float32Array;
	/** Turn rate in °/s, `[n]`. Provisional in its last `k` samples. */
	readonly turn: Float32Array;
}

/**
 * Everything a streamed sample domain is a function of.
 *
 * These are the **clamped and derived** values rather than the user parameters
 * they came from, which is the point: `madBaseS` moving from 16 to 16.0001
 * clamps to the same 512-sample window and must not throw away twenty minutes
 * of accumulated medians.
 *
 * Explicitly NOT in here, and this list is the documentation:
 *
 * - `run.offsets`, which `onTfStatic` mutates in place. It reaches only
 *   `offsetsForFrame` and `georeference` — the recomputed-whole detection
 *   domain. **That is why the in-place mutation is safe.**
 * - `run.frameTree`, `run.recorded.*`, `run.originLat`/`originLon` and the
 *   snapshot's lever arm: detection domain or drawing only.
 * - `run.sampleRateHz`, fully absorbed into `wBase`/`wDet`/`stride`/`k`.
 * - every trigger parameter (`threshold`, `releaseRatio`, `rearmDwellS`,
 *   `madFactor`, `madRearmRatio`, `madFreeze`) and every placement or
 *   association parameter. These must not rebuild; keeping them out is what
 *   keeps the factor slider free to sweep.
 *
 * `detector` appears only as {@link needsMad}, so both directions rebuild.
 * There is deliberately no superset-compatibility relation — a non-symmetric
 * key relation is a bug farm for a win nobody can feel.
 */
export interface SampleDomainKey {
	/**
	 * The run **object**, never `run.id`.
	 *
	 * `EmiRunBuilder.reset()` on a confirmed backwards seek nulls the run, so
	 * the next sample mints a new run object under the *same* id — the id is
	 * `${datasourceId}#${runSeq}` and `runSeq` only bumps in `setEmiSource`.
	 * An id-keyed cache would serve a twenty-minute stream over a recording
	 * that just restarted at sample zero: real numbers about the wrong run.
	 */
	readonly run: EmiRun;
	readonly ncoil: number;
	/** Baseline window in samples, clamped. */
	readonly wBase: number;
	/** Detection window in samples, clamped. */
	readonly wDet: number;
	/** Baseline recompute stride in samples, clamped. */
	readonly stride: number;
	/** Motion half-window in samples — the length of the provisional tail. */
	readonly k: number;
	readonly alpha: number;
	/** True when the MAD baseline has to be maintained at all. */
	readonly needsMad: boolean;
}

/**
 * The key a run and a parameter set imply.
 *
 * @param run - The run being replayed.
 * @param params - Current parameters.
 * @returns The key; compare with {@link sameSampleDomain}.
 */
export function sampleDomainKey(
	run: EmiRun,
	params: EmiParams,
): SampleDomainKey {
	const { wBase, wDet, stride } = madWindows(params, run.sampleRateHz);
	return {
		run,
		ncoil: run.ncoil,
		wBase,
		wDet,
		stride,
		k: motionHalfWindow(run),
		alpha: params.alpha,
		needsMad: params.detector === "mad",
	};
}

/**
 * Whether two keys describe the same stream.
 *
 * @param a - One key.
 * @param b - The other.
 * @returns True when a stream built for `a` may be extended for `b`.
 */
export function sameSampleDomain(
	a: SampleDomainKey,
	b: SampleDomainKey,
): boolean {
	return (
		a.run === b.run &&
		a.ncoil === b.ncoil &&
		a.wBase === b.wBase &&
		a.wDet === b.wDet &&
		a.stride === b.stride &&
		a.k === b.k &&
		a.alpha === b.alpha &&
		a.needsMad === b.needsMad
	);
}

/** What to do with a stream that is already open. */
export type StreamAction = "extend" | "rebuild";

/**
 * Extend the open stream, or throw it away and sweep from scratch.
 *
 * Pure, exported and unit-tested because it fails silently in the worse
 * direction: an `"extend"` that should have been a `"rebuild"` produces a full
 * set of confident numbers about a recording that is no longer on screen.
 *
 * @param have - The open stream's key and resolved length, or null when none is
 *   open.
 * @param want - The key and committed sample count now being asked for.
 * @returns `"extend"` only when every part of the contract holds.
 */
export function planSampleDomain(
	have: { readonly key: SampleDomainKey; readonly n: number } | null,
	want: { readonly key: SampleDomainKey; readonly n: number },
): StreamAction {
	if (!have) return "rebuild";
	if (!sameSampleDomain(have.key, want.key)) return "rebuild";
	// A shrink is impossible today — a run only grows, and anything that
	// restarts one replaces the object, which the key above already catches. It
	// is answered defensively rather than asserted: a slow correct answer beats
	// a crashed panel, and a sweep from scratch is exactly correct.
	if (want.n < have.n) return "rebuild";
	return "extend";
}

/** Capacity the first extend allocates, unless the first chunk is larger. */
const MIN_CAPACITY = 1024;

/**
 * Grow an `Int32Array`, preserving the resolved prefix.
 *
 * Same doubling rule as `ensureRunCapacity`, deliberately not the same code:
 * that one is hardwired to `EmiRun`'s named columns and reusing it here would
 * make one function serve two struct shapes. The *rule* is shared, so a reader
 * comparing the two finds them agreeing rather than competing.
 */
function regrowI32(
	src: Int32Array,
	capacity: number,
	keep: number,
): Int32Array<ArrayBuffer> {
	const out = new Int32Array(capacity);
	out.set(src.subarray(0, keep));
	return out;
}

/** {@link regrowI32} for a `Float32Array`. */
function regrowF32(
	src: Float32Array,
	capacity: number,
	keep: number,
): Float32Array<ArrayBuffer> {
	const out = new Float32Array(capacity);
	out.set(src.subarray(0, keep));
	return out;
}

/**
 * An accumulating sample domain for one run at one key.
 *
 * Hold one of these per displayed run and call {@link extend} with the
 * **committed** sample count on every commit. It sweeps the samples it has not
 * seen and republishes exact-length views over its retained buffers.
 *
 * Referentially transparent in its result and monotone in its state: for a
 * given (run object, prefix length, key) it returns the same numbers however
 * many times, in however many chunks, and from however many discarded renders
 * it is called. The only state it accumulates is a prefix of a pure function of
 * an immutable input.
 */
export class EmiSampleStream {
	readonly key: SampleDomainKey;

	/**
	 * Work actually done, for the test that pins the performance claim.
	 *
	 * `samplesSwept` must equal the sample count after streaming a run in any
	 * number of chunks. It is the only deterministic way to state "the
	 * quadratic is gone" — a wall-clock budget would flake in CI and would not
	 * survive a faster machine reintroducing the bug.
	 */
	readonly stats = { extends: 0, samplesSwept: 0 };

	private readonly ncoil: number;
	/** Resolved prefix length. */
	private len = 0;
	/** Samples the buffers can hold. */
	private cap = 0;

	private value = new Int32Array(0);
	private med: Float32Array | null = null;
	private madArr: Float32Array | null = null;
	private det: Float32Array | null = null;
	private speed = new Float32Array(0);
	private turn = new Float32Array(0);

	/** EMA state per channel per coil — the carry that makes the filter causal. */
	private readonly st1: Float64Array;
	private readonly st2: Float64Array;
	/**
	 * Last computed baseline per coil.
	 *
	 * This is the carry that reproduces a whole sweep: `madBaseline` recomputes
	 * only when `i % stride === 0` and holds the previous value in between, and
	 * that phase is **absolute from i = 0**. Carrying the held value per coil is
	 * therefore all a resumed sweep needs — and it is also why a chunk schedule
	 * that only ever lands on multiples of the stride would hide a bug here.
	 */
	private readonly lastMed: Float64Array;
	private readonly lastMad: Float64Array;

	/**
	 * Median scratch, instance-owned.
	 *
	 * `madBaseline` allocates these once per pass, which is right for a pass
	 * that touches the whole run. A stream is called once per commit with about
	 * three samples in it, so per-call allocation of `max(wBase, wDet)` and
	 * `wBase` doubles would dominate the work.
	 */
	private readonly scratch: Float64Array;
	private readonly dev: Float64Array;

	/** The published view, kept so two identical resolves hand back one object. */
	private view: SampleDomain | null = null;

	/**
	 * @param key - What this stream is a function of. Fixed for its lifetime;
	 *   anything that changes it is a {@link planSampleDomain} `"rebuild"`.
	 * @param initialCapacity - Samples to allocate up front. A drained bag
	 *   arrives in one chunk of tens of thousands of samples, so the caller
	 *   passes the count it already knows about.
	 */
	constructor(key: SampleDomainKey, initialCapacity = MIN_CAPACITY) {
		this.key = key;
		this.ncoil = key.ncoil;
		this.st1 = new Float64Array(key.ncoil);
		this.st2 = new Float64Array(key.ncoil);
		this.lastMed = new Float64Array(key.ncoil);
		this.lastMad = new Float64Array(key.ncoil).fill(1);
		this.scratch = new Float64Array(Math.max(key.wBase, key.wDet));
		this.dev = new Float64Array(key.wBase);
		this.ensureCapacity(Math.max(MIN_CAPACITY, initialCapacity));
	}

	/** Samples resolved so far. */
	get n(): number {
		return this.len;
	}

	/**
	 * Sweep `[this.n, n)` and republish.
	 *
	 * @param run - The run. Its columns below `n` must be final, which is what
	 *   the *committed* sample count guarantees and `run.n` does not.
	 * @param n - The committed sample count, never `run.n`: `run.n` advances at
	 *   wire rate between commits, so streaming to it would make the result
	 *   depend on wall-clock time rather than on the snapshot.
	 * @returns Exact-length views over the resolved prefix.
	 */
	extend(run: EmiRun, n: number): SampleDomain {
		// Clamped to what the run actually holds: past `run.n` the columns are
		// allocation slack, and sweeping zeros would publish a plausible flat
		// stretch rather than an error. The view carries its own `n`, so a
		// consumer sees exactly what was resolved.
		const target = Math.max(0, Math.min(n, run.n));
		if (target <= this.len) return this.publish();

		const from = this.len;
		this.ensureCapacity(target);
		this.sweepValue(run, from, target);
		if (this.key.needsMad) this.sweepMad(from, target);
		this.len = target;

		// The centred tail: sample `i` reads `[i - k, i + k]`, so every
		// `i >= from - k` was computed against a right-truncated window and has
		// to be rewritten against the new `n`.
		const motionFrom = Math.max(0, from - this.key.k);
		fillSpeedSeries(run, target, this.key.k, motionFrom, this.speed);
		fillTurnSeries(run, target, this.key.k, motionFrom, this.turn);

		this.stats.extends += 1;
		this.stats.samplesSwept += target - from;
		this.view = null;
		return this.publish();
	}

	/**
	 * EMA on both channels and the decision variable, in one pass.
	 *
	 * The filtered channels are never materialised — nothing downstream reads
	 * them — which saves two `[n * ncoil]` `Int32Array`s. Bit-identical to
	 * `emaFilter` twice followed by `coilValue`: both stages are pointwise in
	 * `i`, so the recursion per channel per coil per step is unchanged and the
	 * `max` just moves earlier.
	 */
	private sweepValue(run: EmiRun, from: number, to: number): void {
		const nc = this.ncoil;
		const alpha = this.key.alpha;
		const keep = 1 - alpha;
		const { st1, st2, value } = this;
		const { raw1, raw2 } = run;
		for (let i = from; i < to; i++) {
			const base = i * nc;
			for (let c = 0; c < nc; c++) {
				// `Math.trunc` is load-bearing and must not be "cleaned up" —
				// the C++ keeps the filter state in a double and assigns it
				// through a `static_cast<int>` every sample. See `ema.ts`.
				st1[c] = Math.trunc(keep * st1[c]! + alpha * raw1[base + c]!);
				st2[c] = Math.trunc(keep * st2[c]! + alpha * raw2[base + c]!);
				// `| 0` is what `emaFilter`'s `Int32Array` store does to the
				// state before `coilValue` compares it, while the state itself
				// stays un-narrowed. Inside the int32 range — which a filtered
				// int32 channel cannot leave — it is a no-op; it is here so the
				// fusion is exact rather than exact-in-practice.
				const v1 = st1[c]! | 0;
				const v2 = st2[c]! | 0;
				value[base + c] = v1 > v2 ? v1 : v2;
			}
		}
	}

	/**
	 * Rolling median, MAD and detection-window median for `[from, to)`.
	 *
	 * Line-for-line `madBaseline`'s inner body, with the coil loop moved
	 * inside: each `(i, c)` depends only on `value` at or before `i` and on the
	 * held baseline for that coil, so the two orders produce identical numbers.
	 */
	private sweepMad(from: number, to: number): void {
		const nc = this.ncoil;
		const { wBase, wDet, stride } = this.key;
		const { scratch, dev, lastMed, lastMad, value } = this;
		const med = this.med!;
		const madArr = this.madArr!;
		const det = this.det!;

		for (let i = from; i < to; i++) {
			for (let c = 0; c < nc; c++) {
				if (i % stride === 0) {
					const lo = Math.max(0, i - wBase + 1);
					const len = i - lo + 1;
					for (let k = 0; k < len; k++)
						scratch[k] = value[(lo + k) * nc + c]!;
					lastMed[c] = medianOf(scratch, len);
					for (let k = 0; k < len; k++)
						dev[k] = Math.abs(scratch[k]! - lastMed[c]!);
					// A MAD of zero means a perfectly flat window; floor it at
					// one count so the threshold cannot collapse onto the
					// median and fire on noise.
					lastMad[c] = Math.max(1, medianOf(dev, len));
				}
				med[i * nc + c] = lastMed[c]!;
				madArr[i * nc + c] = lastMad[c]!;

				const dlo = Math.max(0, i - wDet + 1);
				const dlen = i - dlo + 1;
				for (let k = 0; k < dlen; k++)
					scratch[k] = value[(dlo + k) * nc + c]!;
				det[i * nc + c] = medianOf(scratch, dlen);
			}
		}
	}

	/** Double until the buffers hold `n` samples, preserving the prefix. */
	private ensureCapacity(n: number): void {
		if (n <= this.cap) return;
		let next = Math.max(this.cap, 1);
		while (next < n) next *= 2;
		const nc = this.ncoil;
		const keep = this.len;

		this.value = regrowI32(this.value, next * nc, keep * nc);
		this.speed = regrowF32(this.speed, next, keep);
		this.turn = regrowF32(this.turn, next, keep);
		if (this.key.needsMad) {
			if (this.med) {
				this.med = regrowF32(this.med, next * nc, keep * nc);
				this.madArr = regrowF32(this.madArr!, next * nc, keep * nc);
				this.det = regrowF32(this.det!, next * nc, keep * nc);
			} else {
				this.allocateMad(next);
			}
		}
		this.cap = next;
		// The buffers moved, so the last published view now points at the old
		// ones. Those still hold correct final values for their own prefix, so
		// a consumer holding one is stale rather than wrong — but this stream
		// must not hand it out again.
		this.view = null;
	}

	/** Allocate the three baseline columns at the current capacity. */
	private allocateMad(capacity: number): void {
		const nc = this.ncoil;
		this.med = new Float32Array(capacity * nc);
		this.madArr = new Float32Array(capacity * nc);
		this.det = new Float32Array(capacity * nc);
	}

	/**
	 * Exact-length views over the resolved prefix.
	 *
	 * Six `subarray` objects, O(1) each. The identity is stable between
	 * extends, which is what lets a consumer compare results by reference and
	 * what the cache-hit test asserts.
	 */
	private publish(): SampleDomain {
		if (this.view && this.view.n === this.len) return this.view;
		const n = this.len;
		const nc = this.ncoil;
		const { wBase, wDet, stride } = this.key;
		this.view = {
			n,
			ncoil: nc,
			value: this.value.subarray(0, n * nc),
			mad: this.med
				? {
						med: this.med.subarray(0, n * nc),
						mad: this.madArr!.subarray(0, n * nc),
						det: this.det!.subarray(0, n * nc),
						wBase,
						wDet,
						stride,
					}
				: null,
			speed: this.speed.subarray(0, n),
			turn: this.turn.subarray(0, n),
		};
		return this.view;
	}
}
