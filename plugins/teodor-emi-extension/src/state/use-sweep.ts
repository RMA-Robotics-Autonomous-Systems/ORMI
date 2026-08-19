"use client";

/**
 * The threshold sweep, computed sparingly.
 *
 * A sweep is 44 full passes of the detector over the whole run. That is fine
 * when a parameter settles and unaffordable at the rate a live mission appends
 * samples, so the run's contribution to the cache key is **bucketed**: a growing
 * recording re-sweeps every {@link GROWTH_BUCKET} samples rather than on every
 * commit. At 32 Hz that is one sweep every quarter minute while surveying, and
 * an immediate one whenever a parameter actually changes — which is the case an
 * operator is watching.
 */

import { useMemo } from "react";
import { sweepThreshold, type Sweep } from "../detector/replay";
import type { EmiParams } from "../detector/params";
import type { EmiRun } from "../detector/run-types";
import type { ReplayResult } from "../detector/replay";

/** Samples of growth that force a fresh sweep. */
const GROWTH_BUCKET = 512;
/** Points per sweep. */
const K = 44;

/** Sweep range for the fixed detector, counts. */
const FIXED_LO = 200;
/** Sweep range for the MAD factor. */
const MAD_LO = 2;
const MAD_HI = 60;

/**
 * Values to sweep, log-spaced over the range that matters for the detector.
 *
 * @param params - Current parameters.
 * @returns Ascending x values.
 */
export function sweepPoints(params: EmiParams): number[] {
	const xs: number[] = [];
	if (params.detector === "mad") {
		for (let k = 0; k < K; k++) {
			xs.push(MAD_LO * Math.pow(MAD_HI / MAD_LO, k / (K - 1)));
		}
		return xs;
	}
	const hi = Math.max(4 * params.threshold, 20000);
	for (let k = 0; k < K; k++) {
		xs.push(Math.round(FIXED_LO * Math.pow(hi / FIXED_LO, k / (K - 1))));
	}
	return xs;
}

/**
 * The sweep at the current parameters.
 *
 * @param run - The run, or null.
 * @param result - The current replay, or null.
 * @param params - Parameters the replay was computed at.
 * @param n - Committed sample count, from the snapshot rather than the run.
 * @returns The sweep, or null when there is nothing to sweep.
 */
export function useSweep(
	run: EmiRun | null,
	result: ReplayResult | null,
	params: EmiParams,
	n: number,
): Sweep | null {
	// The bucket is the throttle, and it has to be a value the *body* consumes,
	// not one declared in a dependency list. The web app builds with the React
	// Compiler, which infers dependencies from the body and drops reads it
	// decides are dead — a memo keyed on a counter its body never touches would
	// either be frozen or re-keyed onto `result`, which changes identity on
	// every commit. Sweeping the bucketed prefix makes the throttle real.
	const bucket = Math.floor(n / GROWTH_BUCKET);
	return useMemo(() => {
		if (!run || !result) return null;
		// Whole buckets only, so a growing mission re-sweeps every
		// GROWTH_BUCKET samples instead of on every 100 ms commit — and never
		// past the sample count the replay was computed at, whose columns are
		// what `sweepThreshold` indexes.
		// Below one bucket there is nothing to throttle, so a short recording
		// sweeps all of itself. Above it, the last partial bucket is left out
		// while the run grows — up to 512 samples, sixteen seconds at 32 Hz, on
		// a curve whose shape a sixteen-second tail does not move.
		const quantised = n < GROWTH_BUCKET ? n : bucket * GROWTH_BUCKET;
		const nSweep = Math.min(
			quantised,
			Math.floor(result.value.length / Math.max(1, run.ncoil)),
		);
		if (nSweep === 0) return null;
		return sweepThreshold(
			{ ...run, n: nSweep },
			params,
			result,
			sweepPoints(params),
		);
	}, [run, result, params, bucket, n]);
}
