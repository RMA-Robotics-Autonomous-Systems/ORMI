/**
 * The detector, held to the Python reference.
 *
 * `emi_ws/tools/pipeline.py` is verified against the C++ that ran on the robot
 * (`pipeline.py --verify`, replaying each recording from `/emi/raw` and
 * comparing stage by stage against the recorded topics). This test closes the
 * last link of that chain for ORMI: the same slice of a real recording, the
 * same seven parameter sets `check_js.py` pins, and a detection-for-detection
 * comparison.
 *
 * The fixture is committed, so this needs neither ROS, nor the bags, nor a
 * Python interpreter. Regenerate it with `fixtures/generate.py` when the
 * reference pipeline changes.
 */

import { describe, expect, test } from "bun:test";
import reference from "./fixtures/detector-reference.json";

import { emaFilter, coilValue } from "../ema";
import { runAtr } from "../atr";
import { madBaseline, runMad } from "../mad";
import { georeference } from "../georeference";
import { gateFor, trackTargets } from "../associate";
import { offsetsForFrame } from "../georeference";
import { createEmiRun, ensureRunCapacity, type EmiRun } from "../run-types";
import type { AtrMode, GeoDetection } from "../detector-types";
import type { GateMode, YawAt } from "../params";

/** One parameter set as the fixture stores it. */
interface FixtureParams {
	label: string;
	threshold: number;
	ratio: number;
	dwell: number;
	alpha: number;
	frame: "xsens_link" | "base_link";
	yawAt: YawAt;
	mode: AtrMode;
	gate: number;
	gateMode: GateMode;
	sigmaRef: number;
	minScale: number;
	sigmaMax: number;
	detector?: "fixed" | "mad";
	madFactor?: number;
	madBaselineS?: number;
	madDetectS?: number;
	madRearm?: number;
	madFreeze?: "on" | "off";
	madStride?: number;
}

/** Expected results for one parameter set. */
interface FixtureCase {
	label: string;
	nDets: number;
	nTargets: number;
	/** `[t, coil, amp, x, y]`, rounded to 4 decimals. */
	dets: number[][];
	/** `[nMembers, bestAmp, bestX, bestY, degraded]`. */
	targets: number[][];
}

const FIX = reference as unknown as {
	bag: string;
	n: number;
	ncoil: number;
	coilIds: number[];
	sampleRateHz: number;
	coilOffsets: Record<string, Record<string, [number, number]>>;
	arrays: Record<string, string>;
	params: FixtureParams[];
	cases: FixtureCase[];
};

/** Decode a base64 array from the fixture. */
function decode(key: string): ArrayBuffer {
	const bin = atob(FIX.arrays[key]!);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes.buffer;
}

const sig1 = new Int32Array(decode("sig1"));
const sig2 = new Int32Array(decode("sig2"));
const t = new Float64Array(decode("t"));
const sx = new Float64Array(decode("sx"));
const sy = new Float64Array(decode("sy"));
const syaw = new Float64Array(decode("syaw"));
const ssig = new Float64Array(decode("ssig"));

/**
 * The run the fixture describes.
 *
 * `offsets` are the base_link ones, so `offsetsForFrame` has to derive the
 * xsens_link set — which is the lever-arm removal, and is asserted separately
 * below.
 */
function buildRun(): EmiRun {
	const coilIds = new Uint8Array(FIX.coilIds);
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
			coilIds,
			offsets,
			originLat: 0,
			originLon: 0,
			sampleRateHz: FIX.sampleRateHz,
		},
		FIX.n,
	);
	ensureRunCapacity(run, FIX.n);
	run.n = FIX.n;
	run.t.set(t);
	run.sx.set(sx);
	run.sy.set(sy);
	run.yaw.set(syaw);
	run.sigma.set(ssig);
	run.raw1.set(sig1);
	run.raw2.set(sig2);
	return run;
}

const run = buildRun();

/** Coil offsets for a frame, exactly as the reference had them. */
function fixtureOffsets(frame: string): Map<number, readonly [number, number]> {
	const out = new Map<number, readonly [number, number]>();
	for (const [id, off] of Object.entries(FIX.coilOffsets[frame]!)) {
		out.set(Number(id), off);
	}
	return out;
}

/** Run the whole parameter-dependent pipeline the way the reference does. */
function replayCase(p: FixtureParams): {
	geo: GeoDetection[];
	targets: ReturnType<typeof trackTargets>;
} {
	const { n, ncoil } = run;
	const f1 = emaFilter(run.raw1, n, ncoil, p.alpha);
	const f2 = emaFilter(run.raw2, n, ncoil, p.alpha);
	const value = coilValue(f1, f2, n, ncoil);

	const dets =
		p.detector === "mad"
			? (() => {
					// The reference sizes its windows with floor(x + 0.5).
					const rate = FIX.sampleRateHz;
					const wBase = Math.max(
						8,
						Math.floor(p.madBaselineS! * rate + 0.5),
					);
					const wDet = Math.max(
						1,
						Math.floor(p.madDetectS! * rate + 0.5),
					);
					const base = madBaseline(
						value,
						n,
						ncoil,
						wBase,
						wDet,
						p.madStride!,
					);
					return runMad(run.t, value, n, ncoil, run.coilIds, base, {
						madFactor: p.madFactor!,
						madRearmRatio: p.madRearm!,
						dwell: p.dwell,
						madFreeze: p.madFreeze === "on",
					});
				})()
			: runAtr(
					run.t,
					value,
					n,
					ncoil,
					run.coilIds,
					{
						mode: p.mode,
						threshold: p.threshold,
						ratio: p.ratio,
						dwell: p.dwell,
					},
					null,
				);

	const geo = georeference(dets, run, fixtureOffsets(p.frame), {
		mode: p.mode,
		yawAt: p.yawAt,
		frame: p.frame,
	});

	const targets = trackTargets(geo, {
		gateBaseM: p.gate,
		gateMode: p.gateMode,
		gateSigmaRefM: p.sigmaRef,
		gateMinScale: p.minScale,
		gateSigmaMaxM: p.sigmaMax,
	});

	return { geo, targets };
}

/** Positional tolerance, matching `check_js.py`. */
const TOL_M = 2e-3;

describe(`detector vs the Python reference (${FIX.bag}, ${FIX.n} samples)`, () => {
	test("the fixture covers every pinned parameter set", () => {
		expect(FIX.params.length).toBe(FIX.cases.length);
		expect(FIX.params.length).toBeGreaterThanOrEqual(7);
		// A fixture that found nothing would pass every comparison below.
		const total = FIX.cases.reduce((s, c) => s + c.nDets, 0);
		expect(total).toBeGreaterThan(0);
	});

	for (let ci = 0; ci < FIX.params.length; ci++) {
		const p = FIX.params[ci]!;
		const expected = FIX.cases[ci]!;

		describe(p.label, () => {
			const { geo, targets } = replayCase(p);

			test("detection count", () => {
				expect(geo.length).toBe(expected.nDets);
			});

			test("every detection: time, coil, amplitude, position", () => {
				for (let i = 0; i < expected.dets.length; i++) {
					const want = expected.dets[i]!;
					const got = geo[i];
					expect(got).toBeDefined();
					expect(got!.coil).toBe(want[1]!);
					expect(got!.amp).toBe(want[2]!);
					expect(Math.abs(got!.t - want[0]!)).toBeLessThan(1e-3);
					expect(Math.abs(got!.x - want[3]!)).toBeLessThan(TOL_M);
					expect(Math.abs(got!.y - want[4]!)).toBeLessThan(TOL_M);
				}
			});

			test("target count", () => {
				expect(targets.length).toBe(expected.nTargets);
			});

			test("every target: members, best amplitude, best position, degraded flag", () => {
				for (let i = 0; i < expected.targets.length; i++) {
					const want = expected.targets[i]!;
					const got = targets[i];
					expect(got).toBeDefined();
					expect(got!.members.length).toBe(want[0]!);
					expect(got!.bestAmp).toBe(want[1]!);
					expect(Math.abs(got!.bx - want[2]!)).toBeLessThan(TOL_M);
					expect(Math.abs(got!.by - want[3]!)).toBeLessThan(TOL_M);
					expect(got!.degraded ? 1 : 0).toBe(want[4]!);
				}
			});
		});
	}
});

describe("frame resolution", () => {
	test("offsetsForFrame reproduces both frames the reference resolved", () => {
		// The lever arm is the difference between the two, and is the same for
		// every coil — that is what makes it a lever arm rather than five.
		const base = FIX.coilOffsets.base_link!;
		const xsens = FIX.coilOffsets.xsens_link!;
		const arms = FIX.coilIds.map((id) => [
			base[String(id)]![0] - xsens[String(id)]![0],
			base[String(id)]![1] - xsens[String(id)]![1],
		]);
		for (const a of arms) {
			expect(Math.abs(a[0]! - arms[0]![0]!)).toBeLessThan(1e-9);
			expect(Math.abs(a[1]! - arms[0]![1]!)).toBeLessThan(1e-9);
		}
		const leverArm = [arms[0]![0]!, arms[0]![1]!] as const;

		for (const frame of ["base_link", "xsens_link"] as const) {
			const got = offsetsForFrame(run, frame, leverArm);
			for (const id of FIX.coilIds) {
				const want = FIX.coilOffsets[frame]![String(id)]!;
				const g = got.get(id)!;
				expect(Math.abs(g[0] - want[0])).toBeLessThan(1e-5);
				expect(Math.abs(g[1] - want[1])).toBeLessThan(1e-5);
			}
		}
	});

	test("the derived lever arm is the one in emi/config/params.yaml", () => {
		const base = FIX.coilOffsets.base_link!["1"]!;
		const xsens = FIX.coilOffsets.xsens_link!["1"]!;
		expect(Math.abs(base[0] - xsens[0] - 0.165)).toBeLessThan(1e-9);
		expect(Math.abs(base[1] - xsens[1] - 0.15)).toBeLessThan(1e-9);
	});
});

describe("gateFor", () => {
	const p = {
		gateBaseM: 0.45,
		gateMode: "covariance" as GateMode,
		gateSigmaRefM: 0.15,
		gateMinScale: 0.3,
		gateSigmaMaxM: 0.6,
	};

	test("a good fix gets the full gate", () => {
		expect(gateFor(0.1, p)).toBe(0.45);
		expect(gateFor(0.15, p)).toBe(0.45);
	});

	test("the gate shrinks with sigma but never below the floor", () => {
		expect(gateFor(0.3, p)).toBeCloseTo(0.45 * 0.5, 10);
		expect(gateFor(0.59, p)).toBeCloseTo(0.45 * 0.3, 10);
	});

	test("above the cutoff the gate closes — nothing associates", () => {
		expect(gateFor(0.61, p)).toBe(0);
		// The measured median sigma on these runs is 0.5–2 m against a 0.60
		// cutoff, which is why the shipped associator refuses nearly everything.
		expect(gateFor(2, p)).toBe(0);
	});

	test("a cutoff of zero disables the cutoff rather than closing the gate", () => {
		expect(gateFor(100, { ...p, gateSigmaMaxM: 0 })).toBeCloseTo(
			0.45 * 0.3,
			10,
		);
	});

	test("fixed mode ignores the fix entirely", () => {
		expect(gateFor(50, { ...p, gateMode: "fixed" })).toBe(0.45);
	});
});
