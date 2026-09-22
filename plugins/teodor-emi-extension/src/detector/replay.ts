/**
 * The whole parameter-dependent pipeline.
 *
 * Everything upstream of this is fixed for a run and is resolved once by
 * whichever source produced it; everything here is downstream of a slider and
 * re-runs when one moves. That split is what makes the tuning loop immediate:
 * these functions sweep arrays already in memory, with no searching and no
 * round trip.
 *
 * The pipeline is in two halves, split on the size of what they produce —
 * `stream.ts` states the rule and the reason. {@link sampleDomain} is the
 * `O(n)` half (filter, decision variable, rolling medians, motion series) and
 * is streamed while a survey is live; {@link replayFrom} is the
 * `O(detections)` half (triggers, placement, geometry, association) and is
 * recomputed whole on every commit. {@link replay} runs both from scratch and
 * is what an offline caller wants.
 *
 * Mirrors `recompute()` in `emi_ws/tools/report/app.js`.
 */

import { coilValue, emaFilter } from "./ema";
import { countAtr, runAtr, type AtrConfig } from "./atr";
import { madBaseline, runMad } from "./mad";
import { georeference, offsetsForFrame, type GeoConfig } from "./georeference";
import { chainTargets, trackTargets } from "./associate";
import {
	geometryPairs,
	speedSeries,
	turnSeries,
	type CoilPair,
} from "./geometry";
import type {
	Detection,
	GeoDetection,
	MadBaseline,
	Target,
} from "./detector-types";
import type { EmiParams } from "./params";
import type { EmiRun } from "./run-types";
import type { SampleDomain } from "./stream";

/**
 * GNSS antenna position relative to the body frame, metres.
 *
 * From `emi/config/params.yaml` (`gnss_link`). TF is authoritative on the
 * robot; this is the fallback for sources that do not carry the lever arm, and
 * the difference between the two frames is exactly this vector — which is what
 * the georeferencing choice exposes.
 */
export const DEFAULT_LEVER_ARM: readonly [number, number] = [0.165, 0.15];

/** Everything one replay produces. */
export interface ReplayResult {
	/**
	 * Samples this result covers — the sample domain's count, never `run.n`.
	 *
	 * Carried rather than inferred. The run is appended to at wire rate while the
	 * replay is resolved on a 100 ms commit, so `run.n` runs ahead of every column
	 * here, and an index past the end reads as `undefined` — which turns a fill
	 * into a silently ignored NaN alpha rather than an error. Consumers used to
	 * recover the count as `value.length / ncoil`, which is correct only for as
	 * long as every published array is an exact-length view; that is true today
	 * and is exactly the kind of invariant that holds until someone hands back a
	 * capacity-sized buffer. Answer the question from the result instead.
	 */
	n: number;
	/** The decision variable, `[n * ncoil]`. */
	value: Int32Array;
	/** Detections from the current detector. */
	detsNew: Detection[];
	/** Detections from the shipped single-threshold detector — the baseline. */
	detsOld: Detection[];
	/** Current detections, placed. */
	geoNew: GeoDetection[];
	/** The frame/orientation choice `geoNew` was placed with. */
	geoConfig: GeoConfig;
	/** Baseline detections, placed as the recorded system placed them. */
	geoOld: GeoDetection[];
	/** Targets under the active associator. */
	targets: Target[];
	/** Cross-coil pairs under the current geometry tolerances. */
	pairs: CoilPair[];
	/** Rolling statistics, when the MAD detector is active. */
	mad: MadBaseline | null;
	/**
	 * Ground speed, `[n]`.
	 *
	 * Centred over ±0.25 s, so its last `k` samples were computed against a
	 * right-truncated window. Correct for this `n`, and rewritten when `n`
	 * grows — see the provisional-tail invariant in `stream.ts`. Nothing may
	 * persist or export a value read from that tail.
	 */
	speed: Float32Array;
	/** Turn rate in °/s, `[n]`. Same provisional tail as {@link speed}. */
	turn: Float32Array;
	/** Wall time the replay took, milliseconds. */
	ms: number;
}

/**
 * Window lengths in samples for the MAD baseline.
 *
 * Every one of the three is floored. The stride especially: `madBaseline`
 * recomputes when `i % stride === 0`, and `i % 0` is NaN — a stride of zero
 * would leave the median at 0 and the MAD at its floor of 1 for the entire run,
 * so every coil would arm at `factor` counts and fire on essentially every
 * sample. That is a degenerate baseline that produces a plausible-looking
 * result, which is the worst kind.
 *
 * @param params - Current parameters.
 * @param sampleRateHz - The run's sample rate.
 * @returns Window lengths in samples.
 */
export function madWindows(
	params: EmiParams,
	sampleRateHz: number,
): { wBase: number; wDet: number; stride: number } {
	const rate = sampleRateHz || 32;
	return {
		wBase: Math.max(8, Math.round(params.madBaseS * rate)),
		wDet: Math.max(1, Math.round(params.madDetS * rate)),
		stride: Math.max(1, Math.trunc(params.madStride) || 1),
	};
}

/** ATR configuration for the current detector. */
function schmittConfig(p: EmiParams): AtrConfig {
	return {
		mode: "schmitt",
		threshold: p.threshold,
		ratio: p.releaseRatio,
		dwell: p.rearmDwellS,
	};
}

/** ATR configuration for the "as recorded" baseline. */
function legacyConfig(p: EmiParams): AtrConfig {
	return { mode: "legacy", threshold: p.threshold, ratio: 1, dwell: 0 };
}

/**
 * The sample domain from scratch — the pure whole-sweep path.
 *
 * DO NOT "simplify" this into a one-chunk call to `EmiSampleStream`. It
 * composes the existing fixture-pinned stages (`emaFilter`, `coilValue`,
 * `madBaseline`, `speedSeries`, `turnSeries`), which is exactly what gives the
 * stream's equivalence test its power: the test claims a streamed sweep is
 * bit-for-bit what the pinned chain produces, and a one-chunk call would
 * degenerate that claim into `x === x`.
 *
 * @param run - The resolved run.
 * @param params - Current parameters.
 * @param n - Samples to resolve; defaults to the whole run. A live run is
 *   replayed at the *committed* count, which `run.n` overshoots between
 *   commits.
 * @returns Every per-sample array the pipeline produces.
 */
export function sampleDomain(
	run: EmiRun,
	params: EmiParams,
	n: number = run.n,
): SampleDomain {
	const ncoil = run.ncoil;
	const f1 = emaFilter(run.raw1, n, ncoil, params.alpha);
	const f2 = emaFilter(run.raw2, n, ncoil, params.alpha);
	const value = coilValue(f1, f2, n, ncoil);
	let mad: MadBaseline | null = null;
	if (params.detector === "mad") {
		const { wBase, wDet, stride } = madWindows(params, run.sampleRateHz);
		mad = madBaseline(value, n, ncoil, wBase, wDet, stride);
	}
	return {
		n,
		ncoil,
		value,
		mad,
		speed: speedSeries(run, n),
		turn: turnSeries(run, n),
	};
}

/**
 * The rest of the pipeline, over a sample domain somebody else resolved.
 *
 * This is the half that is recomputed whole on every commit: it is all
 * `O(detections)`, which is why it can be. It reads `sample.n` and never
 * `run.n` — the run's own count runs ahead of the committed one between
 * commits, and a `{ ...run, n }` copy would be worse than reading the sample
 * domain, because `useRunExtent`'s memo is keyed on the run's identity.
 *
 * @param run - The resolved run, for its times, coil ids and geometry.
 * @param params - Current parameters. Must be the parameters `sample` was
 *   resolved at.
 * @param sample - The per-sample arrays, streamed or swept.
 * @param leverArm - GNSS antenna offset in the body frame.
 * @returns Everything the panels draw.
 */
export function replayFrom(
	run: EmiRun,
	params: EmiParams,
	sample: SampleDomain,
	leverArm: readonly [number, number] = DEFAULT_LEVER_ARM,
): ReplayResult {
	const t0 = performance.now();
	const { n, ncoil, value, speed, turn } = sample;

	// The baseline is always the shipped single-threshold detector: it is what
	// the current detector is compared against, so it must not change when the
	// current one is swapped for the experimental one.
	const detsOld = runAtr(
		run.t,
		value,
		n,
		ncoil,
		run.coilIds,
		legacyConfig(params),
		null,
	);

	let mad: MadBaseline | null = null;
	let detsNew: Detection[];
	if (params.detector === "mad") {
		// The sample domain carries the baseline whenever it was resolved at
		// these parameters, which is the only way this function is reached.
		// Resolving it here keeps the function total rather than letting a
		// mismatched sample silently select the *other* detector — a plausible
		// wrong answer, which is the failure mode worth a dead branch.
		mad = sample.mad ?? madBaselineFor(value, n, ncoil, run, params);
		detsNew = runMad(run.t, value, n, ncoil, run.coilIds, mad, {
			madFactor: params.madFactor,
			madRearmRatio: params.madRearmRatio,
			dwell: params.rearmDwellS,
			madFreeze: params.madFreeze,
		});
	} else {
		detsNew = runAtr(
			run.t,
			value,
			n,
			ncoil,
			run.coilIds,
			schmittConfig(params),
			null,
		);
	}

	const offNew = offsetsForFrame(run, params.gnssFrame, leverArm);
	const offOld = offsetsForFrame(run, "base_link", leverArm);

	// Published on the result. Anything that redraws the pose a detection was
	// placed from — the map's robot ghosts — must resolve the same indices, and
	// carrying the config is what makes that structural instead of two call
	// sites agreeing by hand. They already drifted once.
	const geoConfig: GeoConfig = {
		mode: "schmitt",
		yawAt: params.yawAt,
		frame: params.gnssFrame,
	};
	const geoNew = georeference(detsNew, run, offNew, geoConfig);
	// `base_link`, matching `offOld` one line up rather than the operator's
	// choice: the baseline is the recorded system, and the recorded system did
	// not remove the lever arm.
	const geoOld = georeference(detsOld, run, offOld, {
		mode: "legacy",
		yawAt: "release",
		frame: "base_link",
	});

	// Association runs on the same pairing as the cross-coil view, so the two
	// can never disagree about what counts as one object.
	const pairs = geometryPairs(geoNew, run, offNew, speed, params);
	const targets =
		params.assoc === "chain"
			? chainTargets(geoNew, run, params)
			: trackTargets(geoNew, params);

	return {
		n,
		value,
		detsNew,
		detsOld,
		geoNew,
		geoConfig,
		geoOld,
		targets,
		pairs,
		mad,
		speed,
		turn,
		ms: performance.now() - t0,
	};
}

/** The MAD baseline at these parameters. See {@link replayFrom}. */
function madBaselineFor(
	value: Int32Array,
	n: number,
	ncoil: number,
	run: EmiRun,
	params: EmiParams,
): MadBaseline {
	const { wBase, wDet, stride } = madWindows(params, run.sampleRateHz);
	return madBaseline(value, n, ncoil, wBase, wDet, stride);
}

/**
 * Run the full pipeline over a run at the given parameters.
 *
 * Stateless: there is no cached baseline behind this any more. A caller that
 * runs it repeatedly over a growing run — every panel on every commit — wants
 * `resolveSampleDomain` in `state/use-emi-run.ts`, which streams the expensive
 * half instead of re-sweeping it.
 *
 * @param run - The resolved run.
 * @param params - Current parameters.
 * @param leverArm - GNSS antenna offset in the body frame.
 * @returns Everything the panels draw.
 */
export function replay(
	run: EmiRun,
	params: EmiParams,
	leverArm: readonly [number, number] = DEFAULT_LEVER_ARM,
): ReplayResult {
	return replayFrom(run, params, sampleDomain(run, params), leverArm);
}

/**
 * The arm threshold in force for a coil at a sample — one number under the
 * fixed detector, a curve per coil under MAD.
 *
 * @param result - The current replay.
 * @param params - Current parameters.
 * @param ncoil - Coils per sample.
 * @param i - Sample index.
 * @param c - Coil index.
 * @returns Threshold value.
 */
export function armThresholdAt(
	result: ReplayResult,
	params: EmiParams,
	ncoil: number,
	i: number,
	c: number,
): number {
	if (params.detector !== "mad" || !result.mad) return params.threshold;
	const k = i * ncoil + c;
	return result.mad.med[k]! + params.madFactor * result.mad.mad[k]!;
}

/**
 * The release threshold in force for a coil at a sample.
 *
 * Truncated under the fixed detector, matching the integer arithmetic in the
 * C++ node.
 *
 * @param result - The current replay.
 * @param params - Current parameters.
 * @param ncoil - Coils per sample.
 * @param i - Sample index.
 * @param c - Coil index.
 * @returns Threshold value.
 */
export function releaseThresholdAt(
	result: ReplayResult,
	params: EmiParams,
	ncoil: number,
	i: number,
	c: number,
): number {
	if (params.detector !== "mad" || !result.mad)
		return Math.trunc(params.threshold * params.releaseRatio);
	const k = i * ncoil + c;
	return (
		result.mad.med[k]! +
		params.madFactor * params.madRearmRatio * result.mad.mad[k]!
	);
}

/** One point of the threshold sweep. */
export interface SweepPoint {
	/** Threshold (fixed detector) or MAD factor, per {@link Sweep.mode}. */
	x: number;
	/** Detections under the current detector. */
	current: number;
	/** Detections under the shipped single-threshold detector. */
	shipped: number;
}

/** A completed sweep, and what its x axis means. */
export interface Sweep {
	/** `"fixed"` sweeps the threshold; `"mad"` sweeps the factor. */
	mode: "fixed" | "mad";
	points: SweepPoint[];
}

/**
 * Sweep the active detector over a range, counting detections.
 *
 * The swept quantity follows the detector, because a sweep of a number the
 * active detector never reads is a curve describing a different algorithm — and
 * the page opens on the MAD detector, so that would be the default view.
 *
 * - Fixed: sweep the arm threshold through both detectors, so the difference
 *   between the two curves is the algorithm and nothing else.
 * - MAD: sweep `madFactor` through `runMad`, and hold the shipped count flat as
 *   the reference line it is. The rolling medians do not depend on the factor,
 *   so this is cheap — it is the sweep an operator actually drags.
 *
 * @param run - The run.
 * @param params - Current parameters (supplies everything not being swept).
 * @param result - The current replay, for its decision variable and baseline.
 * @param xs - Values to sweep.
 * @returns The sweep, tagged with what `x` means.
 */
export function sweepThreshold(
	run: EmiRun,
	params: EmiParams,
	result: ReplayResult,
	xs: number[],
): Sweep {
	const { n, ncoil } = run;

	if (params.detector === "mad" && result.mad) {
		const base = result.mad;
		const shipped = countAtr(
			run.t,
			result.value,
			n,
			ncoil,
			legacyConfig(params),
		);
		return {
			mode: "mad",
			points: xs.map((x) => ({
				x,
				current: runMad(
					run.t,
					result.value,
					n,
					ncoil,
					run.coilIds,
					base,
					{
						madFactor: x,
						madRearmRatio: params.madRearmRatio,
						dwell: params.rearmDwellS,
						madFreeze: params.madFreeze,
					},
				).length,
				shipped,
			})),
		};
	}

	return {
		mode: "fixed",
		points: xs.map((x) => ({
			x,
			current: countAtr(run.t, result.value, n, ncoil, {
				...schmittConfig(params),
				threshold: x,
			}),
			shipped: countAtr(run.t, result.value, n, ncoil, {
				...legacyConfig(params),
				threshold: x,
			}),
		})),
	};
}
