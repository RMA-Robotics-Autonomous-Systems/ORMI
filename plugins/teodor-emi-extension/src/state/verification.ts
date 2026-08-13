/**
 * Is the replay faithful?
 *
 * Every other panel compares one configuration against another. This one
 * compares the *replay itself* against what the robot published on the day, and
 * it is what makes the rest believable: if the ported detector, run at the
 * configuration the recording was made under, does not reproduce the recording's
 * own alerts, then no comparison built on it means anything.
 *
 * The check is deliberately narrow and computable in the browser. It does not
 * attempt the offset-removal and bit-exact-EMA stages the offline tool verifies
 * against `pipeline.py` — those need the pre-filter topics and a reference
 * implementation, and claiming them here without running them would be worse
 * than not claiming them.
 */

import { toEnu } from "../detector/georeference";
import type { GeoDetection } from "../detector/detector-types";
import type { ReplayResult } from "../detector/replay";
import type { EmiRun } from "../detector/run-types";

/** How close in time a replayed detection must be to count as the same event. */
export const MATCH_WINDOW_S = 0.35;

/** The comparison, stage by stage. */
export interface Verification {
	/** Alerts the recording contains. */
	recorded: number;
	/** Shipped-detector detections this replay placed on the ground. */
	replayed: number;
	/**
	 * Detections the shipped detector produced but could not place.
	 *
	 * `georeference` drops a detection whose sample has no heading, so on a
	 * stretch with no orientation the replay reproduced the alert and only
	 * failed to place it. Counting those as "missing" would read as detector
	 * infidelity, which is a different and much worse claim.
	 */
	unplaceable: number;
	/** Recorded alerts a replayed detection was found for. */
	matched: number;
	/** Recorded alerts with no replayed counterpart. */
	onlyRecorded: number;
	/** Replayed detections with no recorded counterpart. */
	onlyReplayed: number;
	/**
	 * Largest peak-amplitude disagreement over matched pairs, counts.
	 *
	 * The two quantities are not the same measurement and are not expected to
	 * be equal: the recorded amplitude is `max(raw1, raw2)` off the alert
	 * message — offset-removed but **unfiltered** — while the replayed one is
	 * the latched peak of the EMA-filtered decision variable. The number is
	 * therefore a magnitude check, not an equality check, and the UI says so.
	 */
	ampMaxError: number;
	/** Matched pairs whose amplitudes were identical. */
	ampExact: number;
	/** Median position disagreement over matched pairs, metres. */
	posMedianError: number;
	/** Largest position disagreement, metres. */
	posMaxError: number;
	/** Matched pairs both sides placed on the ground. */
	posCompared: number;
	/** True when the recording ran one threshold throughout. */
	singleThreshold: boolean;
	/** Distinct ATR thresholds the recording carried. */
	thresholds: number[];
}

/**
 * Compare the replayed shipped detector against the recorded alert stream.
 *
 * The baseline series is used, never the current detector: the recording was
 * made by the single-threshold detector, and holding the *proposed* detector to
 * a recording it did not produce would report a disagreement that is the whole
 * point of the proposal.
 *
 * @param run - The run.
 * @param result - The current replay.
 * @returns The comparison.
 */
export function verifyReplay(run: EmiRun, result: ReplayResult): Verification {
	const alerts = run.recorded.alerts;
	const thresholds = distinctThresholds(run);

	// Replayed detections grouped by coil id and sorted, so each recorded alert
	// costs a scan of one coil's list rather than of all of them.
	const byCoil = new Map<number, GeoDetection[]>();
	for (const d of result.geoOld) {
		let list = byCoil.get(d.coil);
		if (!list) byCoil.set(d.coil, (list = []));
		list.push(d);
	}
	for (const list of byCoil.values()) list.sort((a, b) => a.t - b.t);

	let unplaceable = result.detsOld.length - result.geoOld.length;
	if (unplaceable < 0) unplaceable = 0;

	const used = new Set<GeoDetection>();
	let matched = 0;
	let ampMaxError = 0;
	let ampExact = 0;
	const posErrors: number[] = [];

	for (const a of alerts) {
		const list = byCoil.get(a.coil);
		if (!list) continue;
		// The list is sorted, so the search starts at the window's lower edge and
		// stops at its upper one: without that, a busy run is
		// O(alerts × detections-per-coil) inside a memo that re-runs on every
		// parameter change.
		let lo = 0;
		let hi = list.length;
		const from = a.t - MATCH_WINDOW_S;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (list[mid]!.t < from) lo = mid + 1;
			else hi = mid;
		}
		let best: GeoDetection | null = null;
		let bestDt = MATCH_WINDOW_S;
		for (let k = lo; k < list.length; k++) {
			const d = list[k]!;
			if (d.t > a.t + MATCH_WINDOW_S) break;
			if (used.has(d)) continue;
			const dt = Math.abs(d.t - a.t);
			if (dt <= bestDt) {
				bestDt = dt;
				best = d;
			}
		}
		if (!best) continue;
		used.add(best);
		matched++;

		if (Number.isFinite(a.amp)) {
			const err = Math.abs(best.amp - a.amp);
			if (err > ampMaxError) ampMaxError = err;
			if (err === 0) ampExact++;
		}

		if (Number.isFinite(a.latitude) && Number.isFinite(a.longitude)) {
			const [ax, ay] = toEnu(
				a.latitude,
				a.longitude,
				run.originLat,
				run.originLon,
			);
			const err = Math.hypot(best.x - ax, best.y - ay);
			if (Number.isFinite(err)) posErrors.push(err);
		}
	}

	posErrors.sort((x, y) => x - y);

	return {
		recorded: alerts.length,
		// Counted over what was actually matched against — the placed
		// detections — so an unplaceable one is reported as such and not twice
		// over as both "missing" and "extra".
		replayed: result.geoOld.length,
		unplaceable,
		matched,
		onlyRecorded: alerts.length - matched,
		onlyReplayed: result.geoOld.length - matched,
		ampMaxError,
		ampExact,
		posMedianError: medianOf(posErrors),
		posMaxError: posErrors[posErrors.length - 1] ?? NaN,
		posCompared: posErrors.length,
		singleThreshold: thresholds.length === 1,
		thresholds,
	};
}

/**
 * Median of a sorted list, averaging the middle pair on an even count.
 *
 * The convention both detector modules already use; taking the upper-middle
 * element instead biases a headline error upward on small samples.
 *
 * @param sorted - Ascending values.
 * @returns The median, or NaN when empty.
 */
function medianOf(sorted: number[]): number {
	const n = sorted.length;
	if (n === 0) return NaN;
	const mid = n >> 1;
	return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Distinct positive ATR thresholds a recording carried, in first-seen order. */
export function distinctThresholds(run: EmiRun): number[] {
	const out: number[] = [];
	let last = 0;
	for (let i = 0; i < run.n; i++) {
		const v = run.recorded.atrThreshold[i]!;
		if (v <= 0 || v === last) continue;
		last = v;
		if (!out.includes(v)) out.push(v);
	}
	return out;
}
