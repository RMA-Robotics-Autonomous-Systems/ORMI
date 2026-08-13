/**
 * Motion series and cross-coil geometry.
 *
 * The rake is two interleaved rows 0.4 m apart, so a buried object does not
 * pass under *a* coil — it passes under a front coil and then, a fixed distance
 * later, under whichever rear coils share its lane. Every detection is
 * therefore a prediction about the others: which coil should also fire, and how
 * long afterwards.
 *
 * Two properties make this worth computing rather than leaving to the target
 * associator:
 *
 * - The along-track test is almost free of GNSS error. Both positions come out
 *   of the same fix stream a fraction of a second apart, so the absolute error
 *   is common to both and cancels in the difference.
 * - The cross-track separation is fixed by the frame, so it is not evidence —
 *   it is the filter saying which coils *could* have seen the same object.
 *
 * Ported from `emi_ws/tools/report/app.js`.
 */

import type { GeoDetection } from "./detector-types";
import type { EmiRun } from "./run-types";

/** Grid cell size for the coil-path hash, metres. */
const PATH_CELL = 0.5;

/**
 * Ground speed in m/s, differenced over ±0.25 s of the fix.
 *
 * An unsigned magnitude: reversing and crabbing are indistinguishable from
 * driving forward here, which is why the lag prediction below is the part to
 * distrust while the robot is manoeuvring.
 *
 * @param run - The run.
 * @returns Speed per sample, `[n]`.
 */
export function speedSeries(run: EmiRun): Float32Array {
	const n = run.n;
	const k = Math.max(1, Math.round(run.sampleRateHz * 0.25));
	const v = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const a = Math.max(0, i - k);
		const b = Math.min(n - 1, i + k);
		const dt = run.t[b]! - run.t[a]!;
		v[i] =
			dt > 1e-6
				? Math.hypot(run.sx[b]! - run.sx[a]!, run.sy[b]! - run.sy[a]!) /
					dt
				: 0;
	}
	return v;
}

/**
 * Yaw rate in degrees per second, over the same half second the speed uses.
 *
 * Wrapped, because heading crosses ±180° and a raw difference there reads as a
 * 20 000 °/s spin.
 *
 * @param run - The run.
 * @returns Turn rate per sample, `[n]`.
 */
export function turnSeries(run: EmiRun): Float32Array {
	const n = run.n;
	const k = Math.max(1, Math.round(run.sampleRateHz * 0.25));
	const v = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const a = Math.max(0, i - k);
		const b = Math.min(n - 1, i + k);
		const dt = run.t[b]! - run.t[a]!;
		let d = run.yaw[b]! - run.yaw[a]!;
		while (d > Math.PI) d -= 2 * Math.PI;
		while (d < -Math.PI) d += 2 * Math.PI;
		v[i] = dt > 1e-6 ? ((d / dt) * 180) / Math.PI : 0;
	}
	return v;
}

/** A spatial hash of one coil's ground track: cell key → flat `x,y` pairs. */
export type CoilPath = Map<string, number[]>;

/**
 * Every coil's own ground track, hashed, so "did that coil ever pass here?" is
 * an O(1) question.
 *
 * This is what makes the silent-neighbour test possible: a neighbouring coil
 * that drove within half the shared footprint and stayed silent is the one
 * category that is evidence *against* a detection.
 *
 * @param run - The run.
 * @param offsets - Coil offsets keyed by coil id, in the active frame.
 * @returns One hash per coil, in coil-index order.
 */
export function coilPaths(
	run: EmiRun,
	offsets: Map<number, readonly [number, number]>,
): CoilPath[] {
	const n = run.n;
	const paths: CoilPath[] = [];
	for (let c = 0; c < run.ncoil; c++) {
		const off = offsets.get(run.coilIds[c]!) ?? ([0, 0] as const);
		const cells: CoilPath = new Map();
		for (let i = 0; i < n; i++) {
			const yaw = run.yaw[i];
			// A non-finite heading would key a cell on "NaN,NaN" and put the
			// sample somewhere no query can find it while still counting as
			// coverage. Skipping is honest: that instant simply has no track.
			if (yaw === undefined || !Number.isFinite(yaw)) continue;
			const ch = Math.cos(yaw);
			const sh = Math.sin(yaw);
			const x = run.sx[i]! + ch * off[0] - sh * off[1];
			const y = run.sy[i]! + sh * off[0] + ch * off[1];
			const key = `${Math.floor(x / PATH_CELL)},${Math.floor(y / PATH_CELL)}`;
			let arr = cells.get(key);
			if (!arr) cells.set(key, (arr = []));
			arr.push(x, y);
		}
		paths.push(cells);
	}
	return paths;
}

/**
 * Did this coil pass within `r` metres of a point?
 *
 * @param cells - One coil's hashed track.
 * @param x - Easting in metres.
 * @param y - Northing in metres.
 * @param r - Radius in metres.
 * @returns True if any track sample lies within the radius.
 */
export function coilPassedNear(
	cells: CoilPath,
	x: number,
	y: number,
	r: number,
): boolean {
	const gx = Math.floor(x / PATH_CELL);
	const gy = Math.floor(y / PATH_CELL);
	const span = Math.ceil(r / PATH_CELL);
	const r2 = r * r;
	for (let i = -span; i <= span; i++) {
		for (let j = -span; j <= span; j++) {
			const arr = cells.get(`${gx + i},${gy + j}`);
			if (!arr) continue;
			for (let k = 0; k < arr.length; k += 2) {
				const dx = arr[k]! - x;
				const dy = arr[k + 1]! - y;
				if (dx * dx + dy * dy <= r2) return true;
			}
		}
	}
	return false;
}

/** Two detections the geometry says could be one object. */
export interface CoilPair {
	/** Index into the detection list of the earlier peak. */
	a: number;
	/** Index of the later peak. */
	b: number;
	/** Separation along the earlier peak's heading, metres. */
	dAlong: number;
	/** Separation across it, metres. */
	dCross: number;
	/** Observed lag, seconds. */
	lag: number;
	/**
	 * Lag the frame predicts: `Δs ÷ v`. A straight-line answer to what may be a
	 * curved question — it assumes the array translates along its own heading,
	 * and the speed has had its sign and direction thrown away. Distrust it
	 * while the turn-rate panel is busy.
	 */
	predicted: number;
	/** Ground speed at the earlier peak, m/s. */
	speed: number;
}

/** Inputs `geometryPairs` reads. */
export interface PairConfig {
	linkAlongM: number;
	linkCrossM: number;
}

/**
 * Longest lag a pair may have and still be offered, seconds.
 *
 * Two coils agreeing on a spot minutes apart is a repeat visit over the same
 * ground, not one object seen twice — and a survey drives the same line more
 * than once. Without this, `components()` chains the two passes together.
 */
export const LINK_MAX_LAG_S = 6.0;

/**
 * Detection count above which pairing is refused outright.
 *
 * Below a very low threshold every coil is permanently in alarm and the pairing
 * degenerates on noise — which is a state the threshold slider passes through
 * on its way down. Returning nothing beats freezing the page.
 */
export const LINK_MAX_DETECTIONS = 50_000;

/**
 * Every pair of detections on DIFFERENT coils that the geometry says could be
 * one object.
 *
 * Hashed on position rather than swept in time, so a hot patch with hundreds of
 * detections costs what its neighbourhood costs rather than `O(n²)`.
 *
 * @param geo - Georeferenced detections.
 * @param run - The run (supplies heading and speed).
 * @param offsets - Coil offsets keyed by coil id, in the active frame.
 * @param speed - Precomputed speed series, `[n]`.
 * @param p - Acceptance tolerances.
 * @returns Accepted pairs.
 */
export function geometryPairs(
	geo: GeoDetection[],
	run: EmiRun,
	offsets: Map<number, readonly [number, number]>,
	speed: Float32Array,
	p: PairConfig,
): CoilPair[] {
	const along = p.linkAlongM;
	const cross = p.linkCrossM;

	if (geo.length > LINK_MAX_DETECTIONS) return [];

	// The cell must be at least the longest separation the acceptance box can
	// admit, or a ±1-cell scan misses pairs that are strictly inside it. The box
	// is along × cross in BODY frame; projected onto the world axes the grid is
	// built on, a corner of it reaches hypot(along, cross) — 0.53 m against a
	// 0.45 m cell at the shipped tolerances, which is a two-cell gap. Sizing on
	// max(along, cross) silently drops those pairs at every heading that is not
	// axis-aligned, and would put this function at odds with `chainTargets`,
	// which accepts them.
	const cell = Math.hypot(along, cross);
	const grid = new Map<string, number[]>();
	for (let i = 0; i < geo.length; i++) {
		const key = `${Math.floor(geo[i]!.x / cell)},${Math.floor(geo[i]!.y / cell)}`;
		let arr = grid.get(key);
		if (!arr) grid.set(key, (arr = []));
		arr.push(i);
	}

	const pairs: CoilPair[] = [];
	for (let i = 0; i < geo.length; i++) {
		const gx = Math.floor(geo[i]!.x / cell);
		const gy = Math.floor(geo[i]!.y / cell);
		for (let u = -1; u <= 1; u++) {
			for (let v = -1; v <= 1; v++) {
				const arr = grid.get(`${gx + u},${gy + v}`);
				if (!arr) continue;
				for (const j of arr) {
					if (j <= i || geo[j]!.ci === geo[i]!.ci) continue;
					// The earlier peak sets the heading and the speed.
					const ai = geo[i]!.t <= geo[j]!.t ? i : j;
					const bi = ai === i ? j : i;
					const a = geo[ai]!;
					const b = geo[bi]!;
					const yaw = run.yaw[a.iPeak];
					// Same trap as in `chainTargets`: the acceptance test below
					// is a pair of `>` comparisons, and every comparison against
					// NaN is false — an unguarded non-finite heading would
					// accept every pair in the run rather than rejecting them.
					if (yaw === undefined || !Number.isFinite(yaw)) continue;
					const ch = Math.cos(yaw);
					const sh = Math.sin(yaw);
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const dAlong = dx * ch + dy * sh;
					const dCross = -dx * sh + dy * ch;
					if (Math.abs(dAlong) > along || Math.abs(dCross) > cross)
						continue;
					const lag = b.t - a.t;
					// A survey drives the same line more than once; two coils
					// agreeing on a spot minutes apart is a repeat visit, not
					// one object.
					if (Math.abs(lag) > LINK_MAX_LAG_S) continue;
					const oa = offsets.get(a.coil) ?? ([0, 0] as const);
					const ob = offsets.get(b.coil) ?? ([0, 0] as const);
					const sp = speed[a.iPeak]!;
					pairs.push({
						a: ai,
						b: bi,
						dAlong,
						dCross,
						lag,
						predicted: sp > 0.02 ? (oa[0] - ob[0]) / sp : NaN,
						speed: sp,
					});
				}
			}
		}
	}
	return pairs;
}

/**
 * Connected components under a set of pairs, as index lists.
 *
 * Used for the cross-coil *report* only. Association deliberately does not use
 * this: transitive closure percolates through a hot corridor, which is why both
 * associators grow from a centroid instead.
 *
 * @param n - Number of nodes.
 * @param pairs - Edges.
 * @returns One index list per component.
 */
export function components(n: number, pairs: CoilPair[]): number[][] {
	const parent = new Int32Array(n);
	for (let i = 0; i < n; i++) parent[i] = i;
	const find = (i: number): number => {
		while (parent[i] !== i) {
			parent[i] = parent[parent[i]!]!;
			i = parent[i]!;
		}
		return i;
	};
	for (const L of pairs) {
		const ra = find(L.a);
		const rb = find(L.b);
		if (ra !== rb) parent[rb] = ra;
	}
	const byRoot = new Map<number, number[]>();
	for (let i = 0; i < n; i++) {
		const r = find(i);
		let g = byRoot.get(r);
		if (!g) byRoot.set(r, (g = []));
		g.push(i);
	}
	return [...byRoot.values()];
}
