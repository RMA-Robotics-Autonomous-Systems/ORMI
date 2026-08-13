/**
 * Chain association and cross-coil geometry.
 *
 * These have no counterpart in `pipeline.py` — the robot does not do them, and
 * the source report computes them in `app.js` rather than in the verified
 * detector. So they are tested against constructed geometry where the right
 * answer is known by construction rather than against a reference.
 *
 * The scenario throughout is the one the rake actually produces: an object
 * passes under a front coil and then, 0.4 m of travel later, under a rear coil
 * that shares its lane.
 */

import { describe, expect, test } from "bun:test";

import { chainTargets, trackTargets } from "../associate";
import {
	coilPassedNear,
	coilPaths,
	components,
	geometryPairs,
	speedSeries,
	turnSeries,
	LINK_MAX_LAG_S,
} from "../geometry";
import { createEmiRun, ensureRunCapacity, type EmiRun } from "../run-types";
import type { GeoDetection } from "../detector-types";

/** Coil offsets in body frame: rear row x = -0.2, front row x = +0.2. */
const OFFSETS = new Map<number, readonly [number, number]>([
	[1, [-0.2, 0.4]],
	[2, [-0.2, 0.0]],
	[3, [-0.2, -0.4]],
	[4, [0.2, -0.2]],
	[5, [0.2, 0.2]],
]);

/**
 * A run driving due east in a straight line at a constant speed.
 *
 * @param n - Sample count.
 * @param speed - Ground speed in m/s.
 * @param rate - Sample rate in Hz.
 * @param yaw - Constant heading in radians (0 = +x).
 * @returns The run.
 */
function straightRun(n = 400, speed = 0.5, rate = 32, yaw = 0): EmiRun {
	const run = createEmiRun(
		{
			id: "synthetic",
			source: "bag",
			label: "synthetic",
			coilIds: new Uint8Array([1, 2, 3, 4, 5]),
			offsets: new Float32Array([
				-0.2, 0.4, 0, -0.2, 0, 0, -0.2, -0.4, 0, 0.2, -0.2, 0, 0.2, 0.2,
				0,
			]),
			originLat: 0,
			originLon: 0,
			sampleRateHz: rate,
		},
		n,
	);
	ensureRunCapacity(run, n);
	run.n = n;
	for (let i = 0; i < n; i++) {
		const t = i / rate;
		run.t[i] = t;
		run.sx[i] = Math.cos(yaw) * speed * t;
		run.sy[i] = Math.sin(yaw) * speed * t;
		run.yaw[i] = yaw;
		run.sigma[i] = 0.1;
	}
	return run;
}

/** A georeferenced detection placed by hand. */
function det(
	over: Partial<GeoDetection> &
		Pick<GeoDetection, "coil" | "ci" | "t" | "x" | "y">,
): GeoDetection {
	return {
		iPeak: 0,
		iRel: 0,
		amp: 1000,
		thr: 500,
		iPub: 0,
		borrowed: false,
		sigma: 0.1,
		targetId: -1,
		...over,
	};
}

describe("speedSeries", () => {
	test("recovers a constant ground speed", () => {
		const run = straightRun(400, 0.5, 32);
		const v = speedSeries(run);
		// The ±0.25 s window is one-sided at the ends, which is correct but not
		// centred; check the interior.
		for (let i = 20; i < 380; i++) expect(v[i]!).toBeCloseTo(0.5, 6);
	});

	test("reads zero while parked", () => {
		const run = straightRun(200, 0, 32);
		const v = speedSeries(run);
		for (let i = 20; i < 180; i++) expect(v[i]!).toBe(0);
	});

	test("is unsigned — reversing is indistinguishable from driving on", () => {
		// Documented behaviour, not a bug: this is why the lag prediction is
		// the part to distrust while the robot is manoeuvring.
		const run = straightRun(200, 0.5, 32, Math.PI);
		const v = speedSeries(run);
		expect(v[100]!).toBeCloseTo(0.5, 6);
	});
});

describe("turnSeries", () => {
	test("reads zero on a straight line", () => {
		const v = turnSeries(straightRun(200, 0.5, 32));
		for (let i = 20; i < 180; i++)
			expect(Math.abs(v[i]!)).toBeLessThan(1e-9);
	});

	test("recovers a constant turn rate", () => {
		const n = 400;
		const rate = 32;
		const degPerS = 20;
		const run = straightRun(n, 0.5, rate);
		for (let i = 0; i < n; i++)
			run.yaw[i] = (degPerS * (i / rate) * Math.PI) / 180;
		const v = turnSeries(run);
		for (let i = 20; i < n - 20; i++) expect(v[i]!).toBeCloseTo(degPerS, 4);
	});

	test("wrapping ±180° does not read as a 20 000 °/s spin", () => {
		const n = 200;
		const rate = 32;
		const run = straightRun(n, 0.5, rate);
		// Heading creeps through +π and wraps to -π half way through.
		for (let i = 0; i < n; i++) {
			let yaw = Math.PI - 0.5 + (i / rate) * 0.2;
			while (yaw > Math.PI) yaw -= 2 * Math.PI;
			run.yaw[i] = yaw;
		}
		const v = turnSeries(run);
		for (let i = 20; i < n - 20; i++) {
			expect(Math.abs(v[i]!)).toBeLessThan(30);
		}
	});
});

describe("coilPaths / coilPassedNear", () => {
	const run = straightRun(400, 0.5, 32);
	const paths = coilPaths(run, OFFSETS);

	test("one hashed track per coil", () => {
		expect(paths).toHaveLength(5);
	});

	test("a coil is found on its own lane", () => {
		// Coil 1 rides at y = +0.4 while the body drives along y = 0.
		expect(coilPassedNear(paths[0]!, 2.0, 0.4, 0.1)).toBe(true);
	});

	test("a coil is not found on a lane it never drove", () => {
		// Coil 1 never reaches y = -0.4; that lane belongs to coil 3.
		expect(coilPassedNear(paths[0]!, 2.0, -0.4, 0.1)).toBe(false);
		expect(coilPassedNear(paths[2]!, 2.0, -0.4, 0.1)).toBe(true);
	});

	test("the radius is honoured across cell boundaries", () => {
		// A point just outside a cell edge must still be found by a radius that
		// reaches it, or the silent-neighbour test reports false silences.
		expect(coilPassedNear(paths[1]!, 2.0, 0.0, 0.01)).toBe(true);
		expect(coilPassedNear(paths[1]!, 2.0, 0.6, 0.05)).toBe(false);
		expect(coilPassedNear(paths[1]!, 2.0, 0.6, 0.7)).toBe(true);
	});
});

describe("geometryPairs", () => {
	const run = straightRun(400, 0.5, 32);
	const speed = speedSeries(run);
	const tol = { linkAlongM: 0.3, linkCrossM: 0.45 };

	test("pairs a front coil with the rear coil that shares its lane", () => {
		// Coil 5 (front, y = +0.2) and coil 1 (rear, y = +0.4) are 0.2 m apart
		// across track: they share ground. Same object, same spot, 0.8 s apart.
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320 }),
			det({ coil: 1, ci: 0, t: 10.8, x: 5, y: 0.3, iPeak: 345 }),
		];
		const pairs = geometryPairs(geo, run, OFFSETS, speed, tol);
		expect(pairs).toHaveLength(1);
		expect(pairs[0]!.lag).toBeCloseTo(0.8, 6);
		// Δs = 0.4 m of row separation at 0.5 m/s predicts 0.8 s.
		expect(pairs[0]!.predicted).toBeCloseTo(0.8, 6);
	});

	test("refuses coils that never share ground", () => {
		// Coil 1 (y = +0.4) and coil 3 (y = -0.4) are 0.8 m apart — outside the
		// shared footprint. On the real recordings 1↔3 never appears either.
		const geo = [
			det({ coil: 1, ci: 0, t: 10, x: 5, y: 0.4, iPeak: 320 }),
			det({ coil: 3, ci: 2, t: 10.05, x: 5, y: -0.4, iPeak: 322 }),
		];
		expect(geometryPairs(geo, run, OFFSETS, speed, tol)).toHaveLength(0);
	});

	test("refuses two detections too far apart along track", () => {
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320 }),
			det({ coil: 1, ci: 0, t: 12, x: 6, y: 0.3, iPeak: 384 }),
		];
		expect(geometryPairs(geo, run, OFFSETS, speed, tol)).toHaveLength(0);
	});

	test("never pairs a coil with itself", () => {
		const geo = [
			det({ coil: 2, ci: 1, t: 10, x: 5, y: 0, iPeak: 320 }),
			det({ coil: 2, ci: 1, t: 10.1, x: 5.02, y: 0, iPeak: 323 }),
		];
		expect(geometryPairs(geo, run, OFFSETS, speed, tol)).toHaveLength(0);
	});

	test("a non-finite heading drops the pair rather than accepting it", () => {
		const broken = straightRun(400, 0.5, 32);
		broken.yaw[320] = NaN;
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320 }),
			det({ coil: 1, ci: 0, t: 10.8, x: 50, y: 40, iPeak: 345 }),
		];
		expect(geometryPairs(geo, broken, OFFSETS, speed, tol)).toHaveLength(0);
	});

	test("a diagonal heading still finds pairs inside the acceptance box", () => {
		// The box is along x cross in BODY frame; projected onto the world axes
		// the spatial hash is built on, a corner of it reaches
		// hypot(along, cross) = 0.53 m against tolerances of 0.30/0.45. A hash
		// sized on max(along, cross) leaves a two-cell gap and silently drops
		// these pairs — at every heading that is not axis-aligned, which is most
		// of a real survey.
		const yaw = -Math.atan2(0.44, 0.29);
		const diag = straightRun(400, 0.5, 32, 0);
		for (let i = 0; i < diag.n; i++) diag.yaw[i] = yaw;
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 0.449, y: 0, iPeak: 320 }),
			det({ coil: 1, ci: 0, t: 10.4, x: 0.976, y: 0, iPeak: 333 }),
		];
		const pairs = geometryPairs(geo, diag, OFFSETS, speedSeries(diag), tol);
		expect(pairs).toHaveLength(1);

		// ...and the two views must agree about it: whatever the pairing accepts
		// as possibly-one-object, chain association must fold into one target.
		const targets = chainTargets(geo, diag, { ...tol, gateSigmaMaxM: 0.6 });
		expect(targets).toHaveLength(1);
	});

	test("a pair separated by more than the lag ceiling is a repeat visit, not an object", () => {
		// A survey drives the same line more than once. Without the ceiling,
		// components() chains the two passes into one.
		const geo = [
			det({ coil: 5, ci: 4, t: 1, x: 5, y: 0.3, iPeak: 32 }),
			det({
				coil: 1,
				ci: 0,
				t: 1 + LINK_MAX_LAG_S + 0.5,
				x: 5,
				y: 0.3,
				iPeak: 240,
			}),
		];
		expect(geometryPairs(geo, run, OFFSETS, speed, tol)).toHaveLength(0);
	});

	test("below the speed floor the lag prediction is withheld, not invented", () => {
		const parked = straightRun(400, 0, 32);
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 0, y: 0.3, iPeak: 320 }),
			det({ coil: 1, ci: 0, t: 10.8, x: 0, y: 0.3, iPeak: 345 }),
		];
		const pairs = geometryPairs(
			geo,
			parked,
			OFFSETS,
			speedSeries(parked),
			tol,
		);
		expect(pairs).toHaveLength(1);
		expect(Number.isNaN(pairs[0]!.predicted)).toBe(true);
	});
});

describe("components", () => {
	test("groups everything a chain of pairs connects", () => {
		const pairs = [
			{ a: 0, b: 1 },
			{ a: 1, b: 2 },
		].map((p) => ({
			...p,
			dAlong: 0,
			dCross: 0,
			lag: 0,
			predicted: 0,
			speed: 1,
		}));
		const groups = components(4, pairs);
		const sizes = groups.map((g) => g.length).sort();
		expect(sizes).toEqual([1, 3]);
	});

	test("with no pairs everything is its own component", () => {
		expect(components(3, [])).toHaveLength(3);
	});
});

describe("chainTargets", () => {
	const run = straightRun(400, 0.5, 32);
	const cfg = { linkAlongM: 0.3, linkCrossM: 0.45, gateSigmaMaxM: 0.6 };

	test("folds a front-then-rear pass into one target", () => {
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320, amp: 800 }),
			det({
				coil: 1,
				ci: 0,
				t: 10.8,
				x: 5.05,
				y: 0.3,
				iPeak: 345,
				amp: 1200,
			}),
		];
		const targets = chainTargets(geo, run, cfg);
		expect(targets).toHaveLength(1);
		expect(targets[0]!.members).toHaveLength(2);
		expect(targets[0]!.confirmed).toBe(true);
		// The best position is the strongest member, not the centroid: coupling
		// falls off as ~1/r^6, so the loudest coil passed closest.
		expect(targets[0]!.bestAmp).toBe(1200);
		expect(targets[0]!.bestCoil).toBe(1);
	});

	test("keeps two genuinely separate objects apart", () => {
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320 }),
			det({ coil: 1, ci: 0, t: 20, x: 10, y: 0.3, iPeak: 390 }),
		];
		expect(chainTargets(geo, run, cfg)).toHaveLength(2);
	});

	test("a poor fix no longer prevents association", () => {
		// This is the whole argument for chains: the gate would refuse both of
		// these outright at sigma 2 m against a 0.6 m cutoff.
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320, sigma: 2 }),
			det({
				coil: 1,
				ci: 0,
				t: 10.8,
				x: 5.05,
				y: 0.3,
				iPeak: 345,
				sigma: 2,
			}),
		];
		const chained = chainTargets(geo, run, cfg);
		expect(chained).toHaveLength(1);
		// ...but the uncertainty is reported rather than hidden.
		expect(chained[0]!.degraded).toBe(true);
		expect(chained[0]!.gateUsed).toBeNull();

		const gated = trackTargets(geo, {
			gateBaseM: 0.45,
			gateMode: "covariance",
			gateSigmaRefM: 0.15,
			gateMinScale: 0.3,
			gateSigmaMaxM: 0.6,
		});
		expect(gated).toHaveLength(2);
	});

	test("association cannot walk across a hot corridor", () => {
		// Ten detections 0.25 m apart in a line. Transitive closure would fold
		// them into one 2.5 m "target"; growing from the centroid must not.
		const geo = Array.from({ length: 10 }, (_, i) =>
			det({
				coil: i % 2 ? 1 : 5,
				ci: i % 2 ? 0 : 4,
				t: 10 + i * 0.5,
				x: 5 + i * 0.25,
				y: 0.3,
				iPeak: 320 + i * 8,
			}),
		);
		const targets = chainTargets(geo, run, cfg);
		expect(targets.length).toBeGreaterThan(1);
		for (const t of targets) {
			// Spread stays inside the tolerance and nothing more.
			expect(t.spread).toBeLessThanOrEqual(cfg.linkAlongM * 2 + 1e-9);
		}
	});

	test("every member points back at the target it joined", () => {
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320 }),
			det({ coil: 1, ci: 0, t: 10.8, x: 5.05, y: 0.3, iPeak: 345 }),
		];
		const targets = chainTargets(geo, run, cfg);
		for (const t of targets)
			for (const m of t.members) expect(m.targetId).toBe(t.id);
	});

	test("a missing heading opens a new target instead of accepting everything", () => {
		// The acceptance test is two `>` comparisons, and every comparison
		// against NaN is false — so an unguarded non-finite heading does not
		// widen the box, it deletes it, and the whole run collapses into one
		// target. Two detections 5 m apart must stay apart.
		const broken = straightRun(400, 0.5, 32);
		broken.yaw[320] = NaN;
		broken.yaw[345] = NaN;
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320 }),
			det({ coil: 1, ci: 0, t: 10.8, x: 10, y: 0.3, iPeak: 345 }),
		];
		expect(chainTargets(geo, broken, cfg)).toHaveLength(2);
	});

	test("a detection indexed past the end of the run does not associate", () => {
		// Same failure reached the other way: an out-of-range index reads
		// undefined, which behaves exactly like NaN in the comparisons.
		const geo = [
			det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320 }),
			det({ coil: 1, ci: 0, t: 10.8, x: 500, y: 0.3, iPeak: 99_999 }),
		];
		expect(chainTargets(geo, run, cfg)).toHaveLength(2);
	});

	test("ids are assigned in time order regardless of input order", () => {
		const early = det({ coil: 5, ci: 4, t: 10, x: 5, y: 0.3, iPeak: 320 });
		const late = det({ coil: 1, ci: 0, t: 30, x: 15, y: 0.3, iPeak: 390 });
		const targets = chainTargets([late, early], run, cfg);
		expect(targets[0]!.firstSeen).toBe(10);
		expect(targets[1]!.firstSeen).toBe(30);
	});
});

describe("trackTargets", () => {
	test("is append-only — a target is never merged away", () => {
		const cfg = {
			gateBaseM: 0.45,
			gateMode: "fixed" as const,
			gateSigmaRefM: 0.15,
			gateMinScale: 0.3,
			gateSigmaMaxM: 0,
		};
		// Two targets open far apart, then a detection lands between them. It
		// must join one, not merge the pair.
		const geo = [
			det({ coil: 1, ci: 0, t: 1, x: 0, y: 0 }),
			det({ coil: 2, ci: 1, t: 2, x: 0.8, y: 0 }),
			det({ coil: 3, ci: 2, t: 3, x: 0.4, y: 0 }),
		];
		const targets = trackTargets(geo, cfg);
		expect(targets).toHaveLength(2);
		expect(targets[0]!.id).toBe(1);
		expect(targets[1]!.id).toBe(2);
	});
});

describe("run growth", () => {
	test("ensureRunCapacity preserves what was already written", () => {
		const run = straightRun(10, 0.5, 32);
		const before = Array.from(run.t.subarray(0, 10));
		ensureRunCapacity(run, 5000);
		expect(run.t.length).toBeGreaterThanOrEqual(5000);
		expect(Array.from(run.t.subarray(0, 10))).toEqual(before);
	});

	test("per-coil columns grow by the right stride", () => {
		const run = straightRun(10, 0.5, 32);
		run.raw1[9 * run.ncoil + 4] = 12345;
		ensureRunCapacity(run, 1000);
		expect(run.raw1[9 * run.ncoil + 4]).toBe(12345);
		expect(run.raw1.length).toBeGreaterThanOrEqual(1000 * run.ncoil);
	});

	test("every column grows, not just the ones a test happened to touch", () => {
		const run = straightRun(10, 0.5, 32);
		const nc = run.ncoil;
		run.coilLat[9 * nc + 4] = 59.5;
		run.coilLon[9 * nc + 4] = 17.5;
		run.sigma[9] = 0.42;
		run.fixLat[9] = 59.4;
		run.fixLon[9] = 17.4;
		run.sy[9] = 12.5;
		run.recorded.atrThreshold[9] = 5000;

		ensureRunCapacity(run, 1000);

		expect(run.coilLat[9 * nc + 4]).toBe(59.5);
		expect(run.coilLon[9 * nc + 4]).toBe(17.5);
		expect(run.sigma[9]).toBe(0.42);
		expect(run.fixLat[9]).toBe(59.4);
		expect(run.fixLon[9]).toBe(17.4);
		expect(run.sy[9]).toBe(12.5);
		expect(run.recorded.atrThreshold[9]).toBe(5000);
		// Per-coil columns are strided; per-sample ones are not.
		expect(run.coilLat.length).toBeGreaterThanOrEqual(1000 * nc);
		expect(run.sigma.length).toBeGreaterThanOrEqual(1000);
	});

	test("growing is a no-op when there is already room", () => {
		const run = straightRun(10, 0.5, 32);
		const same = run.t;
		ensureRunCapacity(run, 5);
		expect(run.t).toBe(same);
	});
});
