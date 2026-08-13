/**
 * Association: which detections are one physical object.
 *
 * Two associators, both append-only and online — a target is never retracted,
 * never merged, and its id is never reused, because an operator may already
 * have acted on it.
 *
 * - `trackTargets` is what the robot runs: nearest centroid inside a gate that
 *   shrinks as the fix degrades.
 * - `chainTargets` is the proposal: the acceptance region is a box in the
 *   array's own frame, so which detections are one object is decided by the
 *   geometry (good to ~6 cm) rather than by the fix (0.5–2 m on these runs).
 *
 * Both grow from the centroid rather than taking a transitive closure over
 * pairs. Closure percolates — one hot corridor swallowed 549 detections into a
 * single 12 m "target" on one recording — and growing from the centroid cannot
 * walk.
 *
 * Ported from `emi_ws/tools/report/detector.js` (`trackTargets`, `gateFor`) and
 * `app.js` (`chainTargets`).
 */

import type { GeoDetection, Target } from "./detector-types";
import type { GateMode } from "./params";
import type { EmiRun } from "./run-types";

/** Inputs the gate associator reads. */
export interface GateConfig {
	gateBaseM: number;
	gateMode: GateMode;
	gateSigmaRefM: number;
	gateMinScale: number;
	gateSigmaMaxM: number;
}

/**
 * The association gate in force for a given fix quality.
 *
 * @param sigma - Horizontal sigma of the fix, metres.
 * @param p - Gate configuration.
 * @returns Gate radius in metres; 0 means "refuse to associate".
 */
export function gateFor(sigma: number, p: GateConfig): number {
	if (p.gateMode !== "covariance") return p.gateBaseM;
	if (p.gateSigmaMaxM > 0 && sigma > p.gateSigmaMaxM) return 0;
	if (sigma <= p.gateSigmaRefM) return p.gateBaseM;
	return p.gateBaseM * Math.max(p.gateMinScale, p.gateSigmaRefM / sigma);
}

/** Max distance between any two members, metres. */
function spreadOf(members: GeoDetection[]): number {
	let s = 0;
	for (let i = 0; i < members.length; i++)
		for (let j = i + 1; j < members.length; j++)
			s = Math.max(
				s,
				Math.hypot(
					members[i]!.x - members[j]!.x,
					members[i]!.y - members[j]!.y,
				),
			);
	return s;
}

/**
 * Median of a numeric list, NaN when empty.
 *
 * Copies before sorting, so the caller's array survives. The hot-path
 * counterpart is `medianOf` in `mad.ts`, which sorts a typed array in place;
 * they are a deliberate fork, and reaching for the wrong one silently reorders
 * a caller's data.
 */
function median(xs: number[]): number {
	if (!xs.length) return NaN;
	const s = [...xs].sort((a, b) => a - b);
	const h = s.length >> 1;
	return s.length & 1 ? s[h]! : (s[h - 1]! + s[h]!) / 2;
}

/**
 * Append-only association against each target's running centroid — the shipped
 * associator.
 *
 * Every ambiguous case resolves toward "new target": a detection whose fix is
 * too poor to gate on opens one rather than being absorbed into a neighbour,
 * because a target that is never reported is never investigated.
 *
 * @param dets - Georeferenced detections, in time order.
 * @param p - Gate configuration.
 * @returns Targets, in creation order.
 */
export function trackTargets(dets: GeoDetection[], p: GateConfig): Target[] {
	const targets: Target[] = [];
	for (const d of dets) {
		const sigma = isFinite(d.sigma) ? d.sigma : 0;
		const gate = gateFor(sigma, p);

		let best: Target | null = null;
		let bestD = Infinity;
		for (const t of targets) {
			const dd = Math.hypot(d.x - t.cx, d.y - t.cy);
			if (dd < bestD) {
				bestD = dd;
				best = t;
			}
		}

		if (best && gate > 0 && bestD <= gate) {
			best.members.push(d);
			best.coils.add(d.coil);
			best.lastSeen = d.t;
			const n = best.members.length;
			best.cx += (d.x - best.cx) / n;
			best.cy += (d.y - best.cy) / n;
			if (d.amp > best.bestAmp) {
				best.bestAmp = d.amp;
				best.bx = d.x;
				best.by = d.y;
				best.bestCoil = d.coil;
			}
			d.targetId = best.id;
		} else {
			const t: Target = {
				id: targets.length + 1,
				members: [d],
				cx: d.x,
				cy: d.y,
				bx: d.x,
				by: d.y,
				bestAmp: d.amp,
				bestCoil: d.coil,
				coils: new Set([d.coil]),
				firstSeen: d.t,
				lastSeen: d.t,
				gateUsed: gate,
				sigma,
				degraded: gate === 0,
				spread: 0,
				confirmed: false,
				nearest: best ? bestD : NaN,
			};
			targets.push(t);
			d.targetId = t.id;
		}
	}
	for (const t of targets) {
		t.spread = spreadOf(t.members);
		t.confirmed = t.coils.size > 1;
	}
	return targets;
}

/** Inputs the chain associator reads. */
export interface ChainConfig {
	linkAlongM: number;
	linkCrossM: number;
	gateSigmaMaxM: number;
}

/**
 * Chain association — the proposed replacement for the gate.
 *
 * Asks a question the fix can answer: are these the same object, judged by
 * where the coils were relative to each other? The acceptance region is a box
 * in body frame, narrow along track and as wide as the coils that share
 * ground, and it turns with the heading — so a poor fix no longer prevents
 * association. It is reported as what it is: an uncertain position for a target
 * we are confident exists.
 *
 * @param dets - Georeferenced detections.
 * @param run - The run they came from (supplies heading).
 * @param p - Chain configuration.
 * @returns Targets, in creation order.
 */
export function chainTargets(
	dets: GeoDetection[],
	run: EmiRun,
	p: ChainConfig,
): Target[] {
	const along = p.linkAlongM;
	const cross = p.linkCrossM;
	const targets: Target[] = [];

	for (const d of [...dets].sort((a, b) => a.t - b.t)) {
		const yaw = run.yaw[d.iPeak];
		// A heading that is missing or NaN must open a new target, never join
		// one. The acceptance test below is a pair of `>` comparisons, and every
		// comparison against NaN is false — so an unguarded NaN does not widen
		// the box, it removes it, and every detection in the run collapses into
		// a single target. Failing toward "new target" is also the direction the
		// rest of the pipeline fails in: a target that is never reported is
		// never investigated.
		const usable = yaw !== undefined && Number.isFinite(yaw);
		const ch = usable ? Math.cos(yaw) : 0;
		const sh = usable ? Math.sin(yaw) : 0;
		let best: Target | null = null;
		let bestD = Infinity;
		for (const t of usable ? targets : []) {
			const dx = d.x - t.cx;
			const dy = d.y - t.cy;
			// The heading is the current one: the acceptance region travels and
			// turns with the array, which is the point of judging in body frame.
			if (Math.abs(dx * ch + dy * sh) > along) continue;
			if (Math.abs(-dx * sh + dy * ch) > cross) continue;
			const dd = Math.hypot(dx, dy);
			if (dd < bestD) {
				bestD = dd;
				best = t;
			}
		}
		if (best) {
			best.members.push(d);
			best.coils.add(d.coil);
			best.lastSeen = d.t;
			const n = best.members.length;
			best.cx += (d.x - best.cx) / n;
			best.cy += (d.y - best.cy) / n;
			if (d.amp > best.bestAmp) {
				best.bestAmp = d.amp;
				best.bx = d.x;
				best.by = d.y;
				best.bestCoil = d.coil;
			}
			d.targetId = best.id;
		} else {
			const t: Target = {
				id: targets.length + 1,
				members: [d],
				coils: new Set([d.coil]),
				cx: d.x,
				cy: d.y,
				bx: d.x,
				by: d.y,
				bestAmp: d.amp,
				bestCoil: d.coil,
				firstSeen: d.t,
				lastSeen: d.t,
				// Nothing is gated on the fix, so nothing is refused for a poor one.
				gateUsed: null,
				sigma: NaN,
				degraded: false,
				spread: 0,
				confirmed: false,
				// Chain association never populates this: it is reached only
				// when nothing was in range, and the distance to a centroid
				// that failed a body-frame box test is not a meaningful number.
				nearest: NaN,
			};
			targets.push(t);
			d.targetId = t.id;
		}
	}

	for (const t of targets) {
		t.spread = spreadOf(t.members);
		t.sigma = median(t.members.map((d) => d.sigma).filter(isFinite));
		// The flag survives but now means "we are unsure where this is", not
		// "we refused to associate it".
		t.degraded =
			isFinite(t.sigma) &&
			p.gateSigmaMaxM > 0 &&
			t.sigma > p.gateSigmaMaxM;
		t.confirmed = t.coils.size > 1;
	}
	return targets;
}
