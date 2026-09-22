/**
 * The streamed sample domain, held bit-for-bit to the whole-sweep path.
 *
 * The whole point of streaming is that a live survey stops re-sweeping itself
 * ten times a second, and the only thing that makes it safe is that it produces
 * *identical* numbers. So almost every test here is the same shape: feed the
 * fixture's real recording through {@link EmiSampleStream} under some chunk
 * schedule, and assert `===` against `sampleDomain()` over the same prefix.
 *
 * Two things about how that is set up are deliberate.
 *
 * **Real data, not a ramp.** The run is built from
 * `fixtures/detector-reference.json` — 4000 samples of a real recording on five
 * coils, the same slice `detector-reference.test.ts` pins against the Python
 * reference. It exercises flat stretches where the MAD floors at `max(1, …)`,
 * saturating peaks, and the interaction between the baseline window and the
 * recompute stride. A synthetic ramp passes while missing all three. Synthetic
 * runs appear only for the degenerate shapes the fixture cannot contain
 * (`n = 1`, `n` below a window, an all-identical run).
 *
 * **Both the run and the stream start small.** {@link feed} appends into a run
 * created at capacity 1, so every schedule drives `ensureRunCapacity`'s
 * reallocation *under* the stream — which is exactly the case where a stream
 * caching a column reference would keep sweeping a dead buffer — and the
 * stream's own buffers double twice on the way to 4000. An assertion over a
 * pre-allocated run would never execute either path, and that is where an
 * off-by-one lives.
 */

import { describe, expect, test } from "bun:test";
import reference from "./fixtures/detector-reference.json";

import {
	EmiSampleStream,
	planSampleDomain,
	sameSampleDomain,
	sampleDomainKey,
	type SampleDomain,
	type SampleDomainKey,
} from "../stream";
import { replay, replayFrom, sampleDomain } from "../replay";
import { runMad } from "../mad";
import { georeference } from "../georeference";
import { motionHalfWindow } from "../geometry";
import { createEmiRun, ensureRunCapacity, type EmiRun } from "../run-types";
import {
	PROPOSED_PARAMS,
	SHIPPED_PARAMS,
	type EmiParams,
	type YawAt,
} from "../params";
import { resolveSampleDomain, clearReplayCache } from "../../state/use-emi-run";

// ── the fixture ─────────────────────────────────────────────────────────

/** One parameter set as the fixture stores it. */
interface FixtureParams {
	label: string;
	threshold: number;
	ratio: number;
	dwell: number;
	alpha: number;
	frame: "xsens_link" | "base_link";
	yawAt: YawAt;
	mode: "legacy" | "schmitt";
	detector?: "fixed" | "mad";
	madFactor?: number;
	madBaselineS?: number;
	madDetectS?: number;
	madRearm?: number;
	madFreeze?: "on" | "off";
	madStride?: number;
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
	cases: { label: string; nDets: number }[];
};

function decode(key: string): ArrayBuffer {
	const bin = atob(FIX.arrays[key]!);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes.buffer;
}

const COL = {
	t: new Float64Array(decode("t")),
	sx: new Float64Array(decode("sx")),
	sy: new Float64Array(decode("sy")),
	yaw: new Float64Array(decode("syaw")),
	sigma: new Float64Array(decode("ssig")),
	raw1: new Int32Array(decode("sig1")),
	raw2: new Int32Array(decode("sig2")),
};

const N = FIX.n;
const NCOIL = FIX.ncoil;

/** Coil offsets from the fixture, for the reference pin below. */
function fixtureOffsets(frame: string): Map<number, readonly [number, number]> {
	const out = new Map<number, readonly [number, number]>();
	for (const [id, off] of Object.entries(FIX.coilOffsets[frame]!)) {
		out.set(Number(id), off);
	}
	return out;
}

/**
 * An empty run with the fixture's identity and geometry.
 *
 * @param capacity - Initial sample capacity. The default of 1 is the point:
 *   appending 4000 samples then drives twelve reallocations of every column.
 */
function emptyRun(capacity = 1): EmiRun {
	const base = FIX.coilOffsets.base_link!;
	const offsets = new Float32Array(NCOIL * 3);
	for (let c = 0; c < NCOIL; c++) {
		const off = base[String(FIX.coilIds[c])]!;
		offsets[c * 3] = off[0];
		offsets[c * 3 + 1] = off[1];
	}
	return createEmiRun(
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
		capacity,
	);
}

/** The whole fixture as one resolved run, for the whole-sweep reference. */
function wholeRun(n = N): EmiRun {
	const run = emptyRun(n);
	ensureRunCapacity(run, n);
	run.n = n;
	run.t.set(COL.t.subarray(0, n));
	run.sx.set(COL.sx.subarray(0, n));
	run.sy.set(COL.sy.subarray(0, n));
	run.yaw.set(COL.yaw.subarray(0, n));
	run.sigma.set(COL.sigma.subarray(0, n));
	run.raw1.set(COL.raw1.subarray(0, n * NCOIL));
	run.raw2.set(COL.raw2.subarray(0, n * NCOIL));
	return run;
}

const REF = wholeRun();

// ── comparison ──────────────────────────────────────────────────────────

/**
 * Exact comparison with a failure a human can read.
 *
 * A raw `toEqual` over 20 000 floats prints two walls of numbers and says
 * nothing about where they diverged, so this reports the first differing index
 * decoded back to `(sample, coil)`.
 *
 * `===`, never `toBeCloseTo`: the claim is bit-for-bit. A tolerance would let a
 * reordered median or a deferred recompute pass while quietly changing what the
 * detector decides.
 */
function expectSameSeries(
	actual: ArrayLike<number>,
	expected: ArrayLike<number>,
	ncoil: number,
	label: string,
): void {
	expect(actual.length).toBe(expected.length);
	for (let i = 0; i < expected.length; i++) {
		if (actual[i] !== expected[i]) {
			const s = Math.floor(i / ncoil);
			const c = i % ncoil;
			throw new Error(
				`${label}: first difference at flat index ${i} ` +
					`(sample ${s}, coil ${c}): got ${actual[i]}, want ${expected[i]}`,
			);
		}
	}
}

/** Every series in a sample domain, compared exactly. */
function expectSameDomain(
	got: SampleDomain,
	want: SampleDomain,
	label: string,
): void {
	expect(got.n).toBe(want.n);
	expect(got.ncoil).toBe(want.ncoil);
	// Exact-length views: a consumer that infers a sample count from one of
	// these lengths must land on `n`, not on the over-allocated capacity.
	expect(got.value.length).toBe(want.n * want.ncoil);
	expect(got.speed.length).toBe(want.n);
	expect(got.turn.length).toBe(want.n);
	expectSameSeries(got.value, want.value, want.ncoil, `${label} value`);
	expectSameSeries(got.speed, want.speed, 1, `${label} speed`);
	expectSameSeries(got.turn, want.turn, 1, `${label} turn`);
	if (want.mad) {
		expect(got.mad).not.toBeNull();
		expect(got.mad!.med.length).toBe(want.n * want.ncoil);
		expectSameSeries(
			got.mad!.med,
			want.mad.med,
			want.ncoil,
			`${label} med`,
		);
		expectSameSeries(
			got.mad!.mad,
			want.mad.mad,
			want.ncoil,
			`${label} mad`,
		);
		expectSameSeries(
			got.mad!.det,
			want.mad.det,
			want.ncoil,
			`${label} det`,
		);
		expect(got.mad!.wBase).toBe(want.mad.wBase);
		expect(got.mad!.wDet).toBe(want.mad.wDet);
		expect(got.mad!.stride).toBe(want.mad.stride);
	} else {
		expect(got.mad).toBeNull();
	}
}

// ── feeding ─────────────────────────────────────────────────────────────

/**
 * Stream the fixture in the given chunks, appending as a live source would.
 *
 * The run grows from capacity 1 and the stream is extended after each chunk
 * with the count committed so far — including zero-length chunks, which must be
 * no-ops rather than a republish of something shorter.
 *
 * @param params - Parameters the domain is resolved at.
 * @param chunks - Samples to append per commit.
 * @param source - Columns to copy from; defaults to the fixture.
 * @returns The final published domain, the run, and the stream.
 */
function feed(
	params: EmiParams,
	chunks: readonly number[],
	source: EmiRun = REF,
): { domain: SampleDomain; run: EmiRun; stream: EmiSampleStream } {
	const run = emptyRun(1);
	run.sampleRateHz = source.sampleRateHz;
	const stream = new EmiSampleStream(sampleDomainKey(run, params));
	let domain = stream.extend(run, 0);
	let n = 0;
	for (const chunk of chunks) {
		const next = Math.min(source.n, n + chunk);
		ensureRunCapacity(run, Math.max(1, next));
		for (let i = n; i < next; i++) {
			run.t[i] = source.t[i]!;
			run.sx[i] = source.sx[i]!;
			run.sy[i] = source.sy[i]!;
			run.yaw[i] = source.yaw[i]!;
			run.sigma[i] = source.sigma[i]!;
			for (let c = 0; c < NCOIL; c++) {
				run.raw1[i * NCOIL + c] = source.raw1[i * NCOIL + c]!;
				run.raw2[i * NCOIL + c] = source.raw2[i * NCOIL + c]!;
			}
		}
		n = next;
		run.n = n;
		domain = stream.extend(run, n);
	}
	return { domain, run, stream };
}

/** Repeat a fixed chunk size until the whole run is in. */
const fixed = (size: number, n = N): number[] =>
	Array.from({ length: Math.ceil(n / size) }, () => size);

/**
 * A seeded schedule of jittery chunks, zero-length ones included.
 *
 * Seeded and in-test rather than random: a schedule that only fails one run in
 * fifty is worse than no test at all.
 */
function jittery(n = N): number[] {
	let s = 0x2f6e2b1;
	const next = () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s;
	};
	const out: number[] = [];
	let total = 0;
	while (total < n) {
		const c = next() % 21;
		out.push(c);
		total += c;
	}
	out.push(n - total + out[out.length - 1]!);
	return out;
}

const K = motionHalfWindow(REF);

/** Chunk schedules, each named for the boundary it is aimed at. */
const SCHEDULES: readonly (readonly [string, readonly number[]])[] = [
	["single shot (a drained bag)", [N]],
	["one sample at a time", fixed(1)],
	["fixed 3 (the live commit rate)", fixed(3)],
	// The baseline recompute phase is absolute from i = 0, so a schedule that
	// only ever lands on a multiple of the stride carries the held median
	// across a boundary the stream never has to resume inside. 8 is that
	// schedule and it HIDES the bug; 7 and 9 are why this list has three
	// entries. The live rate is ~3.2 samples per commit and is not aligned.
	["fixed 7 (stride phase, unaligned)", fixed(7)],
	["fixed 8 (stride phase, aligned)", fixed(8)],
	["fixed 9 (stride phase, unaligned)", fixed(9)],
	[`fixed k-1 = ${K - 1} (centred tail)`, fixed(Math.max(1, K - 1))],
	[`fixed k = ${K} (centred tail)`, fixed(K)],
	[`fixed k+1 = ${K + 1} (centred tail)`, fixed(K + 1)],
	["fixed 512 (baseline window)", fixed(512)],
	["fixed 513 (baseline window + 1)", fixed(513)],
	["jittery 0..20, zero-length chunks included", jittery()],
	// The stream's buffers double at 1024 and 2048, so this lands on both
	// boundaries and on the sample after each.
	["exactly on a capacity doubling", [1024, 1, 1023, 1, N - 2049]],
];

// ── equivalence ─────────────────────────────────────────────────────────

describe("streamed sample domain === whole sweep", () => {
	for (const [label, chunks] of SCHEDULES) {
		test(`MAD detector, ${label}`, () => {
			const { domain } = feed(PROPOSED_PARAMS, chunks);
			expectSameDomain(domain, sampleDomain(REF, PROPOSED_PARAMS), label);
		});
	}

	test("fixed detector carries no baseline and still matches", () => {
		const { domain } = feed(SHIPPED_PARAMS, jittery());
		expect(domain.mad).toBeNull();
		expectSameDomain(domain, sampleDomain(REF, SHIPPED_PARAMS), "fixed");
	});

	test("every prefix along the way matches a sweep at that prefix", () => {
		// Not just the end state: a panel reads the domain at every commit, so
		// every intermediate publication has to be right too.
		const run = emptyRun(1);
		run.sampleRateHz = REF.sampleRateHz;
		const stream = new EmiSampleStream(
			sampleDomainKey(run, PROPOSED_PARAMS),
		);
		const stops = [1, 2, 7, 9, 16, 17, 512, 513, 1024, 1025, 2048, 3000];
		let n = 0;
		for (const stop of stops) {
			ensureRunCapacity(run, stop);
			for (let i = n; i < stop; i++) {
				run.t[i] = REF.t[i]!;
				run.sx[i] = REF.sx[i]!;
				run.sy[i] = REF.sy[i]!;
				run.yaw[i] = REF.yaw[i]!;
				run.sigma[i] = REF.sigma[i]!;
				for (let c = 0; c < NCOIL; c++) {
					run.raw1[i * NCOIL + c] = REF.raw1[i * NCOIL + c]!;
					run.raw2[i * NCOIL + c] = REF.raw2[i * NCOIL + c]!;
				}
			}
			n = stop;
			run.n = n;
			const got = stream.extend(run, n);
			expectSameDomain(
				got,
				sampleDomain(wholeRun(n), PROPOSED_PARAMS, n),
				`prefix n=${n}`,
			);
		}
	});
});

describe("degenerate shapes", () => {
	/** A run of `n` identical samples — the MAD floor, which real data hides. */
	function flatRun(n: number, value: number): EmiRun {
		const run = emptyRun(Math.max(1, n));
		ensureRunCapacity(run, Math.max(1, n));
		run.n = n;
		for (let i = 0; i < n; i++) {
			run.t[i] = i / 32;
			run.sx[i] = 0;
			run.sy[i] = 0;
			run.yaw[i] = 0;
			for (let c = 0; c < NCOIL; c++) {
				run.raw1[i * NCOIL + c] = value;
				run.raw2[i * NCOIL + c] = value;
			}
		}
		return run;
	}

	test("n = 0 publishes empty exact-length views", () => {
		const { domain } = feed(PROPOSED_PARAMS, [0, 0]);
		expect(domain.n).toBe(0);
		expect(domain.value.length).toBe(0);
		expect(domain.speed.length).toBe(0);
	});

	for (const n of [1, 2, 8, 15, 16, 17, 511, 512, 513]) {
		test(`n = ${n}, below or across a window edge`, () => {
			const src = flatRun(n, 4321);
			const { domain } = feed(PROPOSED_PARAMS, fixed(1, n), src);
			expectSameDomain(
				domain,
				sampleDomain(src, PROPOSED_PARAMS, n),
				`flat n=${n}`,
			);
			// The floor the fixture cannot reach: a perfectly flat window has a
			// MAD of zero, and it must be floored at one count or the arm
			// threshold collapses onto the median.
			expect(Math.min(...domain.mad!.mad)).toBeGreaterThanOrEqual(1);
		});
	}

	test("a run shorter than the motion half-window", () => {
		const src = flatRun(Math.max(1, K - 1), 10);
		const { domain } = feed(PROPOSED_PARAMS, [1, 1, 1, 1, 1, 1, 1], src);
		expectSameDomain(
			domain,
			sampleDomain(src, PROPOSED_PARAMS, src.n),
			"short run",
		);
	});
});

// ── no quadratic ────────────────────────────────────────────────────────

describe("the work actually done", () => {
	test("streaming n samples in n chunks sweeps exactly n samples", () => {
		// The deterministic proxy for the whole performance claim. Asserting
		// the WORK and not the time cannot flake in CI, does not get weaker on
		// a faster machine, and fails loudly if a refactor reintroduces the
		// full-sweep-per-commit behaviour: that would read n(n+1)/2 here.
		const { stream } = feed(PROPOSED_PARAMS, fixed(1));
		expect(stream.n).toBe(N);
		expect(stream.stats.samplesSwept).toBe(N);
		expect(stream.stats.samplesSwept).not.toBe((N * (N + 1)) / 2);
	});

	test("the schedule does not change the work", () => {
		for (const [, chunks] of SCHEDULES) {
			const { stream } = feed(PROPOSED_PARAMS, chunks);
			expect(stream.stats.samplesSwept).toBe(N);
		}
	});

	test("a zero-length commit sweeps nothing and republishes the same view", () => {
		const { domain, run, stream } = feed(PROPOSED_PARAMS, [100]);
		const swept = stream.stats.samplesSwept;
		const again = stream.extend(run, run.n);
		expect(stream.stats.samplesSwept).toBe(swept);
		expect(again).toBe(domain);
		expect(again.value).toBe(domain.value);
	});
});

// ── the invalidation contract ───────────────────────────────────────────

describe("planSampleDomain", () => {
	const key = (run: EmiRun, params: EmiParams) =>
		sampleDomainKey(run, params);

	test("no open stream is a rebuild", () => {
		expect(
			planSampleDomain(null, { key: key(REF, PROPOSED_PARAMS), n: 10 }),
		).toBe("rebuild");
	});

	test("the same run object at a longer prefix extends", () => {
		const k = key(REF, PROPOSED_PARAMS);
		expect(planSampleDomain({ key: k, n: 10 }, { key: k, n: 20 })).toBe(
			"extend",
		);
		expect(planSampleDomain({ key: k, n: 10 }, { key: k, n: 10 })).toBe(
			"extend",
		);
	});

	test("two DIFFERENT run objects with the SAME id rebuild", () => {
		// The producer half of this is asserted in
		// `state/__tests__/run-builder.test.ts`: a confirmed backwards seek
		// mints a new run object under the same id. An id-keyed cache would
		// serve the old stream over the restarted recording.
		const other = wholeRun();
		expect(other).not.toBe(REF);
		expect(other.id).toBe(REF.id);
		expect(
			planSampleDomain(
				{ key: key(REF, PROPOSED_PARAMS), n: 3000 },
				{ key: key(other, PROPOSED_PARAMS), n: 3010 },
			),
		).toBe("rebuild");
		expect(
			sameSampleDomain(
				key(REF, PROPOSED_PARAMS),
				key(other, PROPOSED_PARAMS),
			),
		).toBe(false);
	});

	test("a shrink on the same object is answered, not asserted", () => {
		// Impossible today. A slow correct answer beats a crashed panel.
		const k = key(REF, PROPOSED_PARAMS);
		expect(planSampleDomain({ key: k, n: 3000 }, { key: k, n: 12 })).toBe(
			"rebuild",
		);
	});

	test("a different coil count rebuilds", () => {
		const three = createEmiRun({
			id: REF.id,
			source: "bag",
			label: REF.label,
			coilIds: new Uint8Array([1, 2, 3]),
			offsets: new Float32Array(9),
			originLat: 0,
			originLon: 0,
			sampleRateHz: REF.sampleRateHz,
		});
		expect(
			planSampleDomain(
				{ key: key(REF, PROPOSED_PARAMS), n: 10 },
				{ key: key(three, PROPOSED_PARAMS), n: 10 },
			),
		).toBe("rebuild");
	});
});

// ── parameter classification ────────────────────────────────────────────

/**
 * What each parameter does to the streamed sample domain.
 *
 * Exhaustively mapped over `EmiParams`, so TypeScript refuses to compile a
 * missing key: **a newly added parameter fails the build until somebody
 * classifies it.** That is the point of the table. Getting one wrong in the
 * `"stats"` direction serves stale medians; getting one wrong the other way
 * throws away twenty minutes of accumulated work on a slider drag, which is the
 * regression this whole change exists to remove.
 */
const PARAM_CLASS: {
	readonly [K in keyof EmiParams]: "stats" | "trigger" | "detection";
} = {
	detector: "stats",
	alpha: "stats",
	madBaseS: "stats",
	madDetS: "stats",
	madStride: "stats",

	threshold: "trigger",
	releaseRatio: "trigger",
	rearmDwellS: "trigger",
	madFactor: "trigger",
	madRearmRatio: "trigger",
	madFreeze: "trigger",

	gnssFrame: "detection",
	yawAt: "detection",
	assoc: "detection",
	gateBaseM: "detection",
	gateMode: "detection",
	gateSigmaRefM: "detection",
	gateMinScale: "detection",
	gateSigmaMaxM: "detection",
	linkAlongM: "detection",
	linkCrossM: "detection",
};

/** A different value for every parameter, so no perturbation is a no-op. */
const PERTURBED: { readonly [K in keyof EmiParams]: EmiParams[K] } = {
	detector: "fixed",
	alpha: 0.6,
	madBaseS: 17,
	madDetS: 1.5,
	madStride: 4,

	threshold: 1234,
	releaseRatio: 0.5,
	rearmDwellS: 2,
	madFactor: 22,
	madRearmRatio: 0.6,
	madFreeze: true,

	gnssFrame: "base_link",
	yawAt: "release",
	assoc: "gate",
	gateBaseM: 0.7,
	gateMode: "fixed",
	gateSigmaRefM: 0.25,
	gateMinScale: 0.5,
	gateSigmaMaxM: 0.9,
	linkAlongM: 0.55,
	linkCrossM: 0.7,
};

describe("which parameters rebuild the stream", () => {
	const KEYS = Object.keys(PARAM_CLASS) as (keyof EmiParams)[];

	test("the table is exhaustive and every perturbation moves the value", () => {
		expect(KEYS.length).toBe(Object.keys(PROPOSED_PARAMS).length);
		for (const k of KEYS) {
			expect(PERTURBED[k]).not.toBe(PROPOSED_PARAMS[k]);
		}
	});

	for (const k of KEYS) {
		const cls = PARAM_CLASS[k];
		const want = cls === "stats" ? "rebuild" : "extend";
		test(`${k} (${cls}) => ${want}`, () => {
			const next = { ...PROPOSED_PARAMS, [k]: PERTURBED[k] } as EmiParams;
			expect(
				planSampleDomain(
					{ key: sampleDomainKey(REF, PROPOSED_PARAMS), n: 1000 },
					{ key: sampleDomainKey(REF, next), n: 1000 },
				),
			).toBe(want);

			// And whichever it did, the numbers must be a whole sweep at the
			// new parameters. A wrong "extend" is silent otherwise.
			const { domain } = feed(next, jittery());
			expectSameDomain(domain, sampleDomain(REF, next), `${k}=${cls}`);
		});
	}

	test("madBaseS 16 -> 17 rebuilds: the clamped window really moved", () => {
		const a = sampleDomainKey(REF, { ...PROPOSED_PARAMS, madBaseS: 16 });
		const b = sampleDomainKey(REF, { ...PROPOSED_PARAMS, madBaseS: 17 });
		expect(a.wBase).not.toBe(b.wBase);
		expect(planSampleDomain({ key: a, n: 100 }, { key: b, n: 100 })).toBe(
			"rebuild",
		);
	});

	test("madBaseS 16 -> 16.0001 does NOT rebuild: same clamped window", () => {
		// This is the whole reason the key holds the clamped values instead of
		// the parameters they came from. A slider that emits floats would
		// otherwise discard the expensive baseline on every pixel of travel.
		const a = sampleDomainKey(REF, { ...PROPOSED_PARAMS, madBaseS: 16 });
		const b = sampleDomainKey(REF, {
			...PROPOSED_PARAMS,
			madBaseS: 16.0001,
		});
		expect(a.wBase).toBe(b.wBase);
		expect(planSampleDomain({ key: a, n: 100 }, { key: b, n: 100 })).toBe(
			"extend",
		);
	});

	test("the detector rebuilds in BOTH directions", () => {
		const mad = sampleDomainKey(REF, PROPOSED_PARAMS);
		const fix = sampleDomainKey(REF, SHIPPED_PARAMS);
		expect(planSampleDomain({ key: mad, n: 10 }, { key: fix, n: 10 })).toBe(
			"rebuild",
		);
		expect(planSampleDomain({ key: fix, n: 10 }, { key: mad, n: 10 })).toBe(
			"rebuild",
		);
	});
});

// ── the whole pipeline over a streamed domain ───────────────────────────

/** The fixture's parameter sets, mapped onto `EmiParams`. */
function fixtureEmiParams(p: FixtureParams): EmiParams {
	return {
		...SHIPPED_PARAMS,
		detector: p.detector === "mad" ? "mad" : "fixed",
		threshold: p.threshold,
		releaseRatio: p.ratio,
		rearmDwellS: p.dwell,
		alpha: p.alpha,
		madFactor: p.madFactor ?? SHIPPED_PARAMS.madFactor,
		madBaseS: p.madBaselineS ?? SHIPPED_PARAMS.madBaseS,
		madDetS: p.madDetectS ?? SHIPPED_PARAMS.madDetS,
		madRearmRatio: p.madRearm ?? SHIPPED_PARAMS.madRearmRatio,
		madFreeze: p.madFreeze === "on",
		madStride: p.madStride ?? SHIPPED_PARAMS.madStride,
		gnssFrame: p.frame,
		yawAt: p.yawAt,
	};
}

describe("replay() === replayFrom() over a streamed domain", () => {
	for (const fp of FIX.params) {
		test(`parameter set: ${fp.label}`, () => {
			const params = fixtureEmiParams(fp);
			const { domain, run } = feed(params, jittery());
			const streamed = replayFrom(run, params, domain);
			const whole = replay(REF, params);

			expectSameSeries(
				streamed.value,
				whole.value,
				NCOIL,
				`${fp.label} value`,
			);
			expect(streamed.detsNew.length).toBe(whole.detsNew.length);
			expect(streamed.detsOld.length).toBe(whole.detsOld.length);
			expect(streamed.targets.length).toBe(whole.targets.length);
			expect(streamed.pairs.length).toBe(whole.pairs.length);
			// Field-for-field, with the integer amplitude and threshold exact:
			// a detection that moved by one count is a different decision.
			for (let i = 0; i < whole.detsNew.length; i++) {
				const g = streamed.detsNew[i]!;
				const w = whole.detsNew[i]!;
				expect(g.iPeak).toBe(w.iPeak);
				expect(g.iRel).toBe(w.iRel);
				expect(g.coil).toBe(w.coil);
				expect(g.amp).toBe(w.amp);
				expect(g.thr).toBe(w.thr);
			}
			for (let i = 0; i < whole.geoNew.length; i++) {
				const g = streamed.geoNew[i]!;
				const w = whole.geoNew[i]!;
				expect(g.x).toBe(w.x);
				expect(g.y).toBe(w.y);
				expect(g.t).toBe(w.t);
				expect(g.targetId).toBe(w.targetId);
			}
		});
	}
});

describe("sampleDomain() itself is pinned to the Python reference", () => {
	// The stages are fixture-pinned in `detector-reference.test.ts`; the
	// composition should be too, or a future edit could reorder or drop one and
	// only the streamed-vs-whole equality — which compares this composition
	// against itself — would still pass.
	for (let ci = 0; ci < FIX.params.length; ci++) {
		const fp = FIX.params[ci]!;
		if (fp.detector !== "mad") continue;
		test(`${fp.label}: the composed value and baseline reproduce the reference`, () => {
			const params = fixtureEmiParams(fp);
			const domain = sampleDomain(REF, params);
			const dets = runMad(
				REF.t,
				domain.value,
				domain.n,
				domain.ncoil,
				REF.coilIds,
				domain.mad!,
				{
					madFactor: params.madFactor,
					madRearmRatio: params.madRearmRatio,
					dwell: params.rearmDwellS,
					madFreeze: params.madFreeze,
				},
			);
			const geo = georeference(dets, REF, fixtureOffsets(fp.frame), {
				mode: fp.mode,
				yawAt: fp.yawAt,
				frame: fp.frame,
			});
			expect(geo.length).toBe(FIX.cases[ci]!.nDets);
		});
	}
});

// ── the single-entry cache ──────────────────────────────────────────────

describe("resolveSampleDomain", () => {
	test("two identical resolves hand back the same arrays", () => {
		// Without this the cache could silently never hit, which is invisible:
		// every number would still be right and the cockpit would still be
		// re-sweeping the recording on every commit.
		clearReplayCache();
		const a = resolveSampleDomain(REF, 2000, PROPOSED_PARAMS);
		const b = resolveSampleDomain(REF, 2000, PROPOSED_PARAMS);
		expect(b).toBe(a);
		expect(b.value).toBe(a.value);
	});

	test("a longer prefix extends rather than re-sweeping", () => {
		clearReplayCache();
		resolveSampleDomain(REF, 1000, PROPOSED_PARAMS);
		const grown = resolveSampleDomain(REF, 2000, PROPOSED_PARAMS);
		expect(grown.n).toBe(2000);
		expectSameDomain(
			grown,
			sampleDomain(wholeRun(2000), PROPOSED_PARAMS, 2000),
			"resolved 1000+1000",
		);
	});

	test("a trigger parameter keeps the accumulated baseline", () => {
		// The replacement for the old module-level `madCache`: the medians do
		// not depend on the factor, so dragging the factor slider must reuse
		// them. Same arrays, not merely equal ones.
		clearReplayCache();
		const a = resolveSampleDomain(REF, 2000, PROPOSED_PARAMS);
		const b = resolveSampleDomain(REF, 2000, {
			...PROPOSED_PARAMS,
			madFactor: PROPOSED_PARAMS.madFactor + 5,
		});
		expect(b.mad!.med).toBe(a.mad!.med);
		expect(b.mad!.mad).toBe(a.mad!.mad);
	});

	test("a stats parameter throws the baseline away", () => {
		clearReplayCache();
		const a = resolveSampleDomain(REF, 2000, PROPOSED_PARAMS);
		const b = resolveSampleDomain(REF, 2000, {
			...PROPOSED_PARAMS,
			madBaseS: PROPOSED_PARAMS.madBaseS + 1,
		});
		expect(b.mad!.med).not.toBe(a.mad!.med);
		expectSameDomain(
			b,
			sampleDomain(REF, { ...PROPOSED_PARAMS, madBaseS: 17 }, 2000),
			"rebuilt on madBaseS",
		);
	});

	test("clearReplayCache drops the stream", () => {
		clearReplayCache();
		const a = resolveSampleDomain(REF, 2000, PROPOSED_PARAMS);
		clearReplayCache();
		const b = resolveSampleDomain(REF, 2000, PROPOSED_PARAMS);
		expect(b).not.toBe(a);
		expect(b.value).not.toBe(a.value);
		expectSameSeries(b.value, a.value, NCOIL, "after clear");
	});

	test("a different run object with the same id is not served the old stream", () => {
		clearReplayCache();
		const first = resolveSampleDomain(REF, 3000, PROPOSED_PARAMS);
		const restarted = wholeRun(40);
		const second = resolveSampleDomain(restarted, 40, PROPOSED_PARAMS);
		expect(second.n).toBe(40);
		expect(second.value).not.toBe(first.value);
		expectSameDomain(
			second,
			sampleDomain(restarted, PROPOSED_PARAMS, 40),
			"restarted run",
		);
	});
});

// ── key hygiene ─────────────────────────────────────────────────────────

describe("what is deliberately NOT in the key", () => {
	test("mutating run.offsets in place does not invalidate the stream", () => {
		// `onTfStatic` patches the offsets of a live run in place. They reach
		// only `offsetsForFrame` and `georeference` — the recomputed-whole
		// detection domain — which is exactly why that mutation is safe.
		const a = sampleDomainKey(REF, PROPOSED_PARAMS);
		const saved = REF.offsets[0]!;
		REF.offsets[0] = saved + 1;
		const b = sampleDomainKey(REF, PROPOSED_PARAMS);
		REF.offsets[0] = saved;
		expect(sameSampleDomain(a, b)).toBe(true);
	});

	test("the key is derived, so the same inputs give an equal key", () => {
		const a: SampleDomainKey = sampleDomainKey(REF, PROPOSED_PARAMS);
		const b: SampleDomainKey = sampleDomainKey(REF, { ...PROPOSED_PARAMS });
		expect(a).not.toBe(b);
		expect(sameSampleDomain(a, b)).toBe(true);
	});

	test("the sample rate is absorbed into the windows, not carried raw", () => {
		const slow = wholeRun(100);
		slow.sampleRateHz = 16;
		const a = sampleDomainKey(REF, PROPOSED_PARAMS);
		const b = sampleDomainKey(slow, PROPOSED_PARAMS);
		// Different rate => different clamped windows => different key. The
		// rate itself never has to appear.
		expect(b.wBase).not.toBe(a.wBase);
		expect(sameSampleDomain(a, b)).toBe(false);
	});
});
