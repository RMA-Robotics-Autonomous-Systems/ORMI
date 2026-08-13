/**
 * The ATR: per-coil peak detector, arm → latch → release.
 *
 * Ported from `emi_ws/tools/report/detector.js` (`runAtr`, `countAtr`).
 */

import type { AtrMode, Detection } from "./detector-types";

/**
 * Inputs `runAtr`/`countAtr` actually read.
 *
 * Each stage declares the subset of {@link import("./params").EmiParams} it
 * consumes, beside the stage rather than in a shared bag — so a stage's
 * dependencies are visible where its code is.
 */
export interface AtrConfig {
	mode: AtrMode;
	threshold: number;
	/** Release threshold as a fraction of the arm threshold. Forced to 1 under legacy. */
	ratio: number;
	/** Re-arm lockout in seconds. Forced to 0 under legacy. */
	dwell: number;
}

/**
 * Per-coil peak detector.
 *
 * - `legacy` — single threshold; coils releasing in the same cycle share one
 *   message stamp, so all but the last inherit a peak time that is not theirs.
 *   This is what the recordings were made under.
 * - `schmitt` — separate release threshold, optional re-arm dwell, and one
 *   message per releasing coil, each carrying its own peak time.
 *
 * The release threshold is truncated, not rounded — the C++ computes it in
 * integers.
 *
 * @param t - Sample times in seconds, `[n]`.
 * @param value - Decision variable, `[n * ncoil]`.
 * @param n - Sample count.
 * @param ncoil - Coils per sample.
 * @param coilIds - Published coil ids, `[ncoil]`.
 * @param p - Detector configuration.
 * @param thrSeries - Per-sample threshold override, or null for a fixed one.
 * @returns Detections in release order.
 */
export function runAtr(
	t: Float64Array,
	value: Int32Array,
	n: number,
	ncoil: number,
	coilIds: Uint8Array,
	p: AtrConfig,
	thrSeries: Int32Array | null,
): Detection[] {
	const fixedThr = p.threshold | 0;
	const legacy = p.mode === "legacy";
	const ratio = legacy ? 1.0 : p.ratio;
	const dwell = legacy ? 0.0 : p.dwell;

	const active = new Uint8Array(ncoil);
	const peak = new Int32Array(ncoil);
	const peakIdx = new Int32Array(ncoil);
	const relT = new Float64Array(ncoil).fill(-Infinity);

	const dets: Detection[] = [];
	let cycle: Detection[] = [];
	for (let i = 0; i < n; i++) {
		const ti = t[i]!;
		const thr = thrSeries ? thrSeries[i]! : fixedThr;
		const relThr = ratio >= 1.0 ? thr : Math.trunc(thr * ratio);
		const base = i * ncoil;
		if (cycle.length) cycle = [];

		for (let c = 0; c < ncoil; c++) {
			const v = value[base + c]!;
			if (active[c]) {
				if (v > peak[c]!) {
					peak[c] = v;
					peakIdx[c] = i;
				}
				if (v > relThr) continue;
				cycle.push({
					iPeak: peakIdx[c]!,
					iRel: i,
					coil: coilIds[c]!,
					ci: c,
					amp: peak[c]!,
					thr,
					iPub: peakIdx[c]!,
					borrowed: false,
				});
				active[c] = 0;
				peak[c] = 0;
				peakIdx[c] = 0;
				relT[c] = ti;
			} else {
				const locked =
					dwell > 0 && relT[c]! > -Infinity && ti - relT[c]! < dwell;
				if (v > thr && !locked) {
					active[c] = 1;
					peak[c] = v;
					peakIdx[c] = i;
				}
			}
		}

		if (cycle.length) {
			if (legacy && cycle.length > 1) {
				const shared = cycle[cycle.length - 1]!.iPeak;
				for (const d of cycle) {
					d.borrowed = d.iPeak !== shared;
					d.iPub = shared;
				}
			}
			for (const d of cycle) dets.push(d);
		}
	}
	return dets;
}

/**
 * Count only — the threshold sweep runs this dozens of times and never needs
 * the list.
 *
 * @param t - Sample times in seconds, `[n]`.
 * @param value - Decision variable, `[n * ncoil]`.
 * @param n - Sample count.
 * @param ncoil - Coils per sample.
 * @param p - Detector configuration.
 * @returns Number of detections.
 */
export function countAtr(
	t: Float64Array,
	value: Int32Array,
	n: number,
	ncoil: number,
	p: AtrConfig,
): number {
	const legacy = p.mode === "legacy";
	const ratio = legacy ? 1.0 : p.ratio;
	const dwell = legacy ? 0.0 : p.dwell;
	const thr = p.threshold | 0;
	const relThr = ratio >= 1.0 ? thr : Math.trunc(thr * ratio);

	const active = new Uint8Array(ncoil);
	const relT = new Float64Array(ncoil).fill(-Infinity);
	let count = 0;
	for (let i = 0; i < n; i++) {
		const ti = t[i]!;
		const base = i * ncoil;
		for (let c = 0; c < ncoil; c++) {
			const v = value[base + c]!;
			if (active[c]) {
				if (v > relThr) continue;
				count++;
				active[c] = 0;
				relT[c] = ti;
			} else {
				const locked =
					dwell > 0 && relT[c]! > -Infinity && ti - relT[c]! < dwell;
				if (v > thr && !locked) active[c] = 1;
			}
		}
	}
	return count;
}
