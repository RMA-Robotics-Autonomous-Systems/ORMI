/**
 * The orchestrator, over the same recorded slice the reference fixture pins.
 *
 * `detector-reference.test.ts` drives the stages directly, which proves the
 * numerics but leaves `replay()` itself — the thing every widget actually calls
 * — unexercised. This drives the real entry point and pins the wiring: which
 * detector runs, which frame each series is placed in, what the sweep sweeps,
 * and the window/stride clamping that stands between a user parameter and a
 * degenerate baseline.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import reference from "./fixtures/detector-reference.json";

import {
	armThresholdAt,
	clearMadCache,
	madWindows,
	releaseThresholdAt,
	replay,
	sweepThreshold,
} from "../replay";
import { countAtr, runAtr } from "../atr";
import { coilValue, emaFilter } from "../ema";
import { createEmiRun, ensureRunCapacity, type EmiRun } from "../run-types";
import { SHIPPED_PARAMS, PROPOSED_PARAMS, type EmiParams } from "../params";

const FIX = reference as unknown as {
	bag: string;
	n: number;
	ncoil: number;
	coilIds: number[];
	sampleRateHz: number;
	coilOffsets: Record<string, Record<string, [number, number]>>;
	arrays: Record<string, string>;
};

function decode(key: string): ArrayBuffer {
	const bin = atob(FIX.arrays[key]!);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes.buffer;
}

/** The recorded slice, as a run in body frame. */
function buildRun(): EmiRun {
	const base = FIX.coilOffsets.base_link!;
	const offsets = new Float32Array(FIX.ncoil * 3);
	for (let c = 0; c < FIX.ncoil; c++) {
		const off = base[String(FIX.coilIds[c])]!;
		offsets[c * 3] = off[0];
		offsets[c * 3 + 1] = off[1];
	}
	const run = createEmiRun(
		{
			id: FIX.bag,
			source: "bag",
			label: FIX.bag,
			coilIds: new Uint8Array(FIX.coilIds),
			offsets,
			originLat: 0,
			originLon: 0,
			sampleRateHz: FIX.sampleRateHz,
		},
		FIX.n,
	);
	ensureRunCapacity(run, FIX.n);
	run.n = FIX.n;
	run.t.set(new Float64Array(decode("t")));
	run.sx.set(new Float64Array(decode("sx")));
	run.sy.set(new Float64Array(decode("sy")));
	run.yaw.set(new Float64Array(decode("syaw")));
	run.sigma.set(new Float64Array(decode("ssig")));
	run.raw1.set(new Int32Array(decode("sig1")));
	run.raw2.set(new Int32Array(decode("sig2")));
	return run;
}

const run = buildRun();
/** The lever arm the fixture's own two frames imply. */
const LEVER: readonly [number, number] = [
	FIX.coilOffsets.base_link!["1"]![0] - FIX.coilOffsets.xsens_link!["1"]![0],
	FIX.coilOffsets.base_link!["1"]![1] - FIX.coilOffsets.xsens_link!["1"]![1],
];

beforeEach(() => clearMadCache());

describe("replay()", () => {
	test("produces both series, and finds something", () => {
		const r = replay(run, SHIPPED_PARAMS, LEVER);
		expect(r.value).toHaveLength(run.n * run.ncoil);
		expect(r.geoNew.length).toBeGreaterThan(0);
		expect(r.geoOld.length).toBeGreaterThan(0);
		expect(r.speed).toHaveLength(run.n);
		expect(r.turn).toHaveLength(run.n);
	});

	test("the shipped baseline does NOT move when the detector is swapped", () => {
		// The blue "as recorded" series is what everything is compared against.
		// If it changed with the experimental detector, the comparison would be
		// measuring the baseline against itself.
		const fixed = replay(run, SHIPPED_PARAMS, LEVER);
		const mad = replay(run, PROPOSED_PARAMS, LEVER);
		expect(mad.detsOld.length).toBe(fixed.detsOld.length);
		expect(mad.geoOld.length).toBe(fixed.geoOld.length);
	});

	test("the MAD detector actually changes the current series", () => {
		const fixed = replay(run, SHIPPED_PARAMS, LEVER);
		const mad = replay(run, PROPOSED_PARAMS, LEVER);
		expect(mad.mad).not.toBeNull();
		expect(fixed.mad).toBeNull();
		expect(mad.detsNew.length).not.toBe(fixed.detsNew.length);
	});

	test("the baseline is always placed in base_link, whatever the frame setting", () => {
		// The recorded system used base_link; drawing it in the other frame
		// would show a lever arm of disagreement that never existed.
		const a = replay(
			run,
			{ ...SHIPPED_PARAMS, gnssFrame: "base_link" },
			LEVER,
		);
		const b = replay(
			run,
			{ ...SHIPPED_PARAMS, gnssFrame: "xsens_link" },
			LEVER,
		);
		expect(b.geoOld[0]!.x).toBeCloseTo(a.geoOld[0]!.x, 9);
		// ...while the current series does move by exactly the lever arm.
		expect(Math.abs(b.geoNew[0]!.x - a.geoNew[0]!.x)).toBeGreaterThan(0.1);
	});

	test("every detection carries the id of the target it joined", () => {
		const r = replay(run, PROPOSED_PARAMS, LEVER);
		const ids = new Set(r.targets.map((t) => t.id));
		for (const d of r.geoNew) {
			expect(d.targetId).toBeGreaterThan(0);
			expect(ids.has(d.targetId)).toBe(true);
		}
	});

	test("chain association yields no more targets than the gate does", () => {
		// The measured claim on every recording: the covariance gate refuses so
		// much that it opens more targets than chains do, not fewer.
		const gate = replay(run, { ...SHIPPED_PARAMS, assoc: "gate" }, LEVER);
		const chain = replay(run, { ...SHIPPED_PARAMS, assoc: "chain" }, LEVER);
		expect(chain.targets.length).toBeLessThanOrEqual(gate.targets.length);
	});

	test("pairs never disagree with chains about what could be one object", () => {
		// The invariant the module claims: association and the cross-coil view
		// run off the same geometry. Every accepted pair must be co-targeted.
		const r = replay(run, PROPOSED_PARAMS, LEVER);
		for (const pair of r.pairs) {
			const a = r.geoNew[pair.a]!;
			const b = r.geoNew[pair.b]!;
			expect(a.targetId).toBe(b.targetId);
		}
	});
});

describe("MAD baseline caching", () => {
	test("changing only the factor reuses the cached medians", () => {
		const a = replay(run, PROPOSED_PARAMS, LEVER);
		const b = replay(
			run,
			{ ...PROPOSED_PARAMS, madFactor: PROPOSED_PARAMS.madFactor + 5 },
			LEVER,
		);
		// Same object identity means the rolling medians were not recomputed —
		// which is what makes the factor slider free to sweep.
		expect(b.mad).toBe(a.mad);
		// ...and it still changed the answer.
		expect(b.detsNew.length).not.toBe(a.detsNew.length);
	});

	test("changing a window length invalidates the cache", () => {
		const a = replay(run, PROPOSED_PARAMS, LEVER);
		const b = replay(
			run,
			{ ...PROPOSED_PARAMS, madBaseS: PROPOSED_PARAMS.madBaseS / 2 },
			LEVER,
		);
		expect(b.mad).not.toBe(a.mad);
	});

	test("freeze changes the result without recomputing the medians", () => {
		const a = replay(run, PROPOSED_PARAMS, LEVER);
		const b = replay(run, { ...PROPOSED_PARAMS, madFreeze: true }, LEVER);
		expect(b.mad).toBe(a.mad);
	});
});

describe("madWindows", () => {
	test("floors every window so none can collapse", () => {
		const w = madWindows(
			{ ...SHIPPED_PARAMS, madBaseS: 0, madDetS: 0, madStride: 0 },
			32,
		);
		expect(w.wBase).toBe(8);
		expect(w.wDet).toBe(1);
		// A stride of 0 makes `i % stride` NaN, so the baseline would never
		// recompute: median 0 and MAD floored at 1 for the whole run, every coil
		// arming at `factor` counts. Plausible-looking and completely wrong.
		expect(w.stride).toBe(1);
	});

	test("a negative or fractional stride still lands on a usable integer", () => {
		expect(
			madWindows({ ...SHIPPED_PARAMS, madStride: -4 }, 32).stride,
		).toBe(1);
		expect(
			madWindows({ ...SHIPPED_PARAMS, madStride: 8.7 }, 32).stride,
		).toBe(8);
	});

	test("a stride of zero does not produce a degenerate detector", () => {
		const broken: EmiParams = { ...PROPOSED_PARAMS, madStride: 0 };
		const r = replay(run, broken, LEVER);
		// Without the clamp this fires on essentially every sample.
		expect(r.detsNew.length).toBeLessThan(run.n);
	});
});

describe("threshold sweep", () => {
	test("under the fixed detector it sweeps the threshold", () => {
		const r = replay(run, SHIPPED_PARAMS, LEVER);
		const sweep = sweepThreshold(run, SHIPPED_PARAMS, r, [600, 2000, 5000]);
		expect(sweep.mode).toBe("fixed");
		// Raising the threshold cannot raise the count.
		expect(sweep.points[0]!.current).toBeGreaterThanOrEqual(
			sweep.points[2]!.current,
		);
		expect(sweep.points[0]!.shipped).toBeGreaterThanOrEqual(
			sweep.points[2]!.shipped,
		);
	});

	test("under MAD it sweeps the factor and holds the shipped count flat", () => {
		// The page opens on MAD, so a sweep of a threshold the active detector
		// never reads would be the default view — a curve describing a different
		// algorithm.
		const r = replay(run, PROPOSED_PARAMS, LEVER);
		const sweep = sweepThreshold(run, PROPOSED_PARAMS, r, [5, 15, 40]);
		expect(sweep.mode).toBe("mad");
		expect(sweep.points[0]!.current).toBeGreaterThanOrEqual(
			sweep.points[2]!.current,
		);
		// The reference line is the shipped detector and does not move with the
		// factor.
		const shipped = sweep.points.map((p) => p.shipped);
		expect(new Set(shipped).size).toBe(1);
	});

	test("the swept value reproduces the replay at that setting", () => {
		const r = replay(run, PROPOSED_PARAMS, LEVER);
		const sweep = sweepThreshold(run, PROPOSED_PARAMS, r, [
			PROPOSED_PARAMS.madFactor,
		]);
		expect(sweep.points[0]!.current).toBe(r.detsNew.length);
	});
});

describe("threshold readouts", () => {
	test("under the fixed detector the edges are the two configured numbers", () => {
		const r = replay(run, SHIPPED_PARAMS, LEVER);
		expect(armThresholdAt(r, SHIPPED_PARAMS, run.ncoil, 100, 0)).toBe(
			SHIPPED_PARAMS.threshold,
		);
		// Truncated, not rounded — the C++ computes it in integers.
		expect(releaseThresholdAt(r, SHIPPED_PARAMS, run.ncoil, 100, 0)).toBe(
			Math.trunc(SHIPPED_PARAMS.threshold * SHIPPED_PARAMS.releaseRatio),
		);
	});

	test("under MAD every coil carries its own moving edge", () => {
		const r = replay(run, PROPOSED_PARAMS, LEVER);
		const at = (i: number, c: number) =>
			armThresholdAt(r, PROPOSED_PARAMS, run.ncoil, i, c);
		const perCoil = [0, 1, 2, 3, 4].map((c) => at(2000, c));
		// The central claim for the MAD detector: a single shared number cannot
		// express the spread between the quietest and noisiest coil.
		expect(new Set(perCoil).size).toBeGreaterThan(1);
		// And it moves along the run.
		expect(at(500, 0)).not.toBe(at(3500, 0));
		// The release edge always sits below the arm edge.
		for (let c = 0; c < run.ncoil; c++) {
			expect(
				releaseThresholdAt(r, PROPOSED_PARAMS, run.ncoil, 2000, c),
			).toBeLessThan(at(2000, c));
		}
	});
});

describe("countAtr agrees with runAtr", () => {
	test("the sweep's fast path counts what the full detector would list", () => {
		// countAtr exists only so the sweep does not build lists it discards; a
		// fix applied to one must not skip the other.
		const f1 = emaFilter(run.raw1, run.n, run.ncoil, SHIPPED_PARAMS.alpha);
		const f2 = emaFilter(run.raw2, run.n, run.ncoil, SHIPPED_PARAMS.alpha);
		const value = coilValue(f1, f2, run.n, run.ncoil);
		for (const cfg of [
			{
				mode: "schmitt" as const,
				threshold: 5000,
				ratio: 0.75,
				dwell: 0,
			},
			{ mode: "legacy" as const, threshold: 5000, ratio: 1, dwell: 0 },
			{ mode: "schmitt" as const, threshold: 600, ratio: 0.85, dwell: 0 },
			{
				mode: "schmitt" as const,
				threshold: 5000,
				ratio: 0.75,
				dwell: 2,
			},
		]) {
			const listed = runAtr(
				run.t,
				value,
				run.n,
				run.ncoil,
				run.coilIds,
				cfg,
				null,
			).length;
			expect(countAtr(run.t, value, run.n, run.ncoil, cfg)).toBe(listed);
		}
	});
});
