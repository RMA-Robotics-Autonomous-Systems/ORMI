/**
 * The per-coil MAD detector — EXPERIMENTAL, not what runs on the robot.
 *
 * The shipped pipeline uses one fixed threshold shared by all five coils
 * (`emi_atr_node.cpp`). This implementation exists so the choice can be made
 * against recordings rather than in the abstract; every readout that shows it
 * must say it is not in `src/`.
 *
 * The rule: a long rolling window gives each coil its own local median and MAD,
 * a short window gives its current level, and a coil fires when the short
 * window sits more than `factor × MAD` above its own median. Arm, latch the
 * peak, release — deliberately the same shape as the ATR, so everything
 * downstream sees the same kind of detection and the two detectors differ in
 * nothing but the threshold.
 *
 * Ported from `emi_ws/tools/report/detector.js`.
 */

import type { Detection, MadBaseline } from "./detector-types";

/**
 * Median of the first `len` entries, sorting IN PLACE.
 *
 * Destructive, and typed-array only. For an ordinary list that must survive the
 * call, use the non-destructive `median` in `associate.ts` — the two are a
 * deliberate fork on performance grounds, not accidental duplication.
 *
 * `subarray`, not `slice`: `slice` copies, and at 32 Hz over five coils this is
 * called a quarter of a million times per pass, so the allocation was most of
 * the cost of the detector. Every caller refills its buffer before the next
 * use, and the one that reads the buffer afterwards wants absolute deviations
 * from the median — a set that does not care what order it is in.
 *
 * @param buf - Scratch buffer, mutated.
 * @param len - Number of leading entries to consider.
 * @returns The median.
 */
export function medianOf(buf: Float64Array, len: number): number {
	const c = buf.subarray(0, len);
	c.sort();
	const h = len >> 1;
	return len & 1 ? c[h]! : (c[h - 1]! + c[h]!) / 2;
}

/**
 * Per-coil rolling median and MAD of the decision variable, plus the short
 * detection-window median.
 *
 * Depends only on the window lengths, never on the sensitivity factor — which
 * is why the factor slider is free to sweep while the window sliders are not.
 *
 * @param value - Decision variable, `[n * ncoil]`.
 * @param n - Sample count.
 * @param ncoil - Coils per sample.
 * @param wBase - Baseline window in samples.
 * @param wDet - Detection window in samples.
 * @param stride - Recompute the baseline every `stride` samples.
 * @returns The rolling statistics.
 */
export function madBaseline(
	value: Int32Array,
	n: number,
	ncoil: number,
	wBase: number,
	wDet: number,
	stride: number,
): MadBaseline {
	const med = new Float32Array(n * ncoil);
	const mad = new Float32Array(n * ncoil);
	const det = new Float32Array(n * ncoil);
	const scratch = new Float64Array(Math.max(wBase, wDet));
	const dev = new Float64Array(wBase);

	for (let c = 0; c < ncoil; c++) {
		let lastMed = 0;
		let lastMad = 1;
		for (let i = 0; i < n; i++) {
			if (i % stride === 0) {
				const lo = Math.max(0, i - wBase + 1);
				const len = i - lo + 1;
				for (let k = 0; k < len; k++)
					scratch[k] = value[(lo + k) * ncoil + c]!;
				lastMed = medianOf(scratch, len);
				for (let k = 0; k < len; k++)
					dev[k] = Math.abs(scratch[k]! - lastMed);
				// A MAD of zero means a perfectly flat window; floor it at one
				// count so the threshold cannot collapse onto the median and
				// fire on noise.
				lastMad = Math.max(1, medianOf(dev, len));
			}
			med[i * ncoil + c] = lastMed;
			mad[i * ncoil + c] = lastMad;

			const dlo = Math.max(0, i - wDet + 1);
			const dlen = i - dlo + 1;
			for (let k = 0; k < dlen; k++)
				scratch[k] = value[(dlo + k) * ncoil + c]!;
			det[i * ncoil + c] = medianOf(scratch, dlen);
		}
	}
	return { med, mad, det, wBase, wDet, stride };
}

/** Inputs `runMad` actually reads. */
export interface MadConfig {
	madFactor: number;
	madRearmRatio: number;
	/** Re-arm lockout in seconds. */
	dwell: number;
	/** Hold the baseline captured at arm time while latched. */
	madFreeze: boolean;
}

/**
 * The MAD trigger.
 *
 * `madFreeze` holds the baseline captured at arm time for as long as the
 * trigger is latched, so a strong anomaly cannot raise the bar it is being
 * judged against. Without it, a persistently elevated patch of ground raises
 * its own threshold and the detector goes quiet exactly there.
 *
 * @param t - Sample times in seconds, `[n]`.
 * @param value - Decision variable, `[n * ncoil]`.
 * @param n - Sample count.
 * @param ncoil - Coils per sample.
 * @param coilIds - Published coil ids, `[ncoil]`.
 * @param base - Rolling statistics from {@link madBaseline}.
 * @param p - Trigger configuration.
 * @returns Detections in release order.
 */
export function runMad(
	t: Float64Array,
	value: Int32Array,
	n: number,
	ncoil: number,
	coilIds: Uint8Array,
	base: MadBaseline,
	p: MadConfig,
): Detection[] {
	const factor = p.madFactor;
	const rearm = p.madRearmRatio;
	const dwell = p.dwell || 0;
	const freeze = p.madFreeze;

	const active = new Uint8Array(ncoil);
	const peak = new Int32Array(ncoil);
	const peakIdx = new Int32Array(ncoil);
	const armMed = new Float64Array(ncoil);
	const armMad = new Float64Array(ncoil);
	const relT = new Float64Array(ncoil).fill(-Infinity);

	const dets: Detection[] = [];
	for (let i = 0; i < n; i++) {
		const ti = t[i]!;
		const b = i * ncoil;
		for (let c = 0; c < ncoil; c++) {
			const k = b + c;
			const m = active[c] && freeze ? armMed[c]! : base.med[k]!;
			const s = active[c] && freeze ? armMad[c]! : base.mad[k]!;
			const armAt = m + factor * s;
			const relAt = m + factor * rearm * s;
			const v = value[k]!;

			if (active[c]) {
				if (v > peak[c]!) {
					peak[c] = v;
					peakIdx[c] = i;
				}
				if (base.det[k]! > relAt) continue;
				dets.push({
					iPeak: peakIdx[c]!,
					iRel: i,
					coil: coilIds[c]!,
					ci: c,
					amp: peak[c]!,
					thr: Math.round(armAt),
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
				if (base.det[k]! > armAt && !locked) {
					active[c] = 1;
					peak[c] = v;
					peakIdx[c] = i;
					armMed[c] = base.med[k]!;
					armMad[c] = base.mad[k]!;
				}
			}
		}
	}
	return dets;
}
