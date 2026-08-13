/**
 * The one shape both EMI sources produce.
 *
 * A recording opened through the replay datasource and a mission recorded live
 * both fill an {@link EmiRun}; every panel, the detector and the exporter read
 * only this. That is what keeps "offline" and "online" from being two code
 * paths — they are two producers of the same struct.
 *
 * Column-oriented typed arrays rather than an array of objects: the detector
 * sweeps the whole run on every parameter change, and the interaction budget
 * for that sweep is milliseconds.
 */

import type { FrameTree } from "../msgs/frames";

/** A detection as the robot reported it on the day. */
export interface RecordedAlert {
	/** Coil id (1-based, as published). */
	coil: number;
	/** Seconds from run start. */
	t: number;
	latitude: number;
	longitude: number;
	/** Peak amplitude if the source carried one, else NaN. */
	amp: number;
	/** ATR threshold in force at the time. */
	thr: number;
}

/**
 * A target as published by one of the robot's two trackers.
 *
 * Mirrors `emi_msgs/msg/EMITarget`. `source` is the tracker that produced it
 * (`"fixed+gate"` for the shipped stack, `"fixed+chain"` for the proposed one);
 * two trackers run in parallel on one alert stream, so without it a run that
 * records both cannot say which node wrote which target.
 */
export interface RecordedTarget {
	id: number;
	source: string;
	latitude: number;
	longitude: number;
	centroidLatitude: number;
	centroidLongitude: number;
	bestAmplitude: number;
	bestCoil: number;
	atrThreshold: number;
	firstSeen: number;
	lastSeen: number;
	nDetections: number;
	coils: number[];
	spread: number;
	gateUsed: number;
	sigmaAtCreation: number;
	degradedFix: boolean;
}

/** Where a run came from. */
export type EmiRunSource = "bag" | "mission";

/**
 * A resolved EMI run: every quantity that does not depend on a tunable
 * parameter, sampled onto one common EMI timebase.
 *
 * `n` grows while a mission is recording — the buffers are appended to and
 * reallocated. Readers must go through the run store's snapshot rather than
 * capturing an array reference, because a reallocation invalidates it.
 */
export interface EmiRun {
	readonly id: string;
	readonly source: EmiRunSource;
	/** Human label — the bag name, or the mission name. */
	readonly label: string;

	/** Number of EMI samples currently resolved. */
	n: number;
	/** Number of coils; 5 on this robot. */
	ncoil: number;
	/** Coil ids, `[ncoil]`, in array order. */
	coilIds: Uint8Array;

	/** Sample times in seconds from run start, `[n]`. */
	t: Float64Array;
	/**
	 * Offset-removed channel 1, `[n * ncoil]`, row-major (sample-major).
	 *
	 * This is what `/teodora/emi/gnss` carries and what the EMA is applied to —
	 * the signal *after* the baseline remover and *before* the filter. Naming it
	 * "raw" follows the message field, not the pipeline.
	 */
	raw1: Int32Array;
	/** Offset-removed channel 2, `[n * ncoil]`. */
	raw2: Int32Array;

	/**
	 * Channel 1 before offset removal, `[n * ncoil]`, from `/emi/raw`.
	 *
	 * Only meaningful when {@link hasPre} is true. It is not part of the
	 * detector at all — nothing downstream of the baseline remover reads it —
	 * and exists so the walkthrough can show the subtraction actually happening
	 * rather than assert that it does.
	 */
	pre1: Int32Array;
	/** Channel 2 before offset removal, `[n * ncoil]`. */
	pre2: Int32Array;
	/** True once a pre-removal sample has been seen on this run. */
	hasPre: boolean;

	/** Per-coil absolute latitude, `[n * ncoil]`. */
	coilLat: Float64Array;
	/** Per-coil absolute longitude, `[n * ncoil]`. */
	coilLon: Float64Array;

	/** Robot fix latitude, `[n]`. */
	fixLat: Float64Array;
	/** Robot fix longitude, `[n]`. */
	fixLon: Float64Array;
	/** Local-metre easting of the fix relative to {@link originLat}, `[n]`. */
	sx: Float64Array;
	/** Local-metre northing of the fix, `[n]`. */
	sy: Float64Array;
	/** Horizontal sigma, `sqrt(position_covariance[0])`, `[n]`. */
	sigma: Float64Array;
	/** Heading in radians, `[n]`. */
	yaw: Float64Array;

	/** Projection origin for {@link sx}/{@link sy}. */
	originLat: number;
	originLon: number;

	/** Coil offsets in the body frame, `[ncoil * 3]` as x,y,z triples. */
	offsets: Float32Array;

	/**
	 * The source's whole transform tree, or null when it published none.
	 *
	 * Nothing in the detector reads it — the rake in {@link offsets} is what
	 * places a detection. It is carried so the map can draw the robot as the
	 * recording described it rather than as a shape inferred from five points,
	 * and it is replaced in place when a late `tf_static` resolves.
	 */
	frameTree: FrameTree | null;

	/** Nominal sample rate in Hz, used to size the speed/turn differencing window. */
	sampleRateHz: number;

	/** What the robot itself reported, for the recorded-vs-replayed comparison. */
	recorded: {
		alerts: RecordedAlert[];
		targets: RecordedTarget[];
		/** ATR threshold in force per sample, `[n]` — it changed mid-run in some recordings. */
		atrThreshold: Int32Array;
	};
}

/**
 * Allocate an empty run with capacity for `capacity` samples.
 *
 * @param init - Identity and geometry of the run.
 * @param capacity - Initial sample capacity; the run grows past it as needed.
 * @returns A run with `n === 0`.
 */
export function createEmiRun(
	init: {
		id: string;
		source: EmiRunSource;
		label: string;
		coilIds: Uint8Array;
		offsets: Float32Array;
		originLat: number;
		originLon: number;
		sampleRateHz?: number;
		frameTree?: FrameTree | null;
	},
	capacity = 1024,
): EmiRun {
	const ncoil = init.coilIds.length;
	const cap = Math.max(1, capacity);
	return {
		id: init.id,
		source: init.source,
		label: init.label,
		n: 0,
		ncoil,
		coilIds: init.coilIds,
		t: new Float64Array(cap),
		raw1: new Int32Array(cap * ncoil),
		raw2: new Int32Array(cap * ncoil),
		pre1: new Int32Array(cap * ncoil),
		pre2: new Int32Array(cap * ncoil),
		hasPre: false,
		coilLat: new Float64Array(cap * ncoil),
		coilLon: new Float64Array(cap * ncoil),
		fixLat: new Float64Array(cap),
		fixLon: new Float64Array(cap),
		sx: new Float64Array(cap),
		sy: new Float64Array(cap),
		sigma: new Float64Array(cap),
		yaw: new Float64Array(cap),
		originLat: init.originLat,
		originLon: init.originLon,
		offsets: init.offsets,
		frameTree: init.frameTree ?? null,
		sampleRateHz: init.sampleRateHz ?? 32,
		recorded: {
			alerts: [],
			targets: [],
			atrThreshold: new Int32Array(cap),
		},
	};
}

/** Current sample capacity of a run (derived from a per-sample column). */
export function runCapacity(run: EmiRun): number {
	return run.t.length;
}

/**
 * Ensure the run can hold at least `needed` samples, doubling if not.
 *
 * Reallocates every column in place on the run object, so a caller holding a
 * reference to a column across this call is left with a stale buffer — read
 * columns through a fresh snapshot after appending.
 *
 * @param run - The run to grow (mutated).
 * @param needed - Required sample capacity.
 */
export function ensureRunCapacity(run: EmiRun, needed: number): void {
	const cap = runCapacity(run);
	if (needed <= cap) return;

	let next = cap;
	while (next < needed) next *= 2;
	const nc = run.ncoil;

	const growF64 = (src: Float64Array, stride: number) => {
		const out = new Float64Array(next * stride);
		out.set(src.subarray(0, run.n * stride));
		return out;
	};
	const growI32 = (src: Int32Array, stride: number) => {
		const out = new Int32Array(next * stride);
		out.set(src.subarray(0, run.n * stride));
		return out;
	};

	run.t = growF64(run.t, 1);
	run.fixLat = growF64(run.fixLat, 1);
	run.fixLon = growF64(run.fixLon, 1);
	run.sx = growF64(run.sx, 1);
	run.sy = growF64(run.sy, 1);
	run.sigma = growF64(run.sigma, 1);
	run.yaw = growF64(run.yaw, 1);
	run.coilLat = growF64(run.coilLat, nc);
	run.coilLon = growF64(run.coilLon, nc);
	run.raw1 = growI32(run.raw1, nc);
	run.raw2 = growI32(run.raw2, nc);
	run.pre1 = growI32(run.pre1, nc);
	run.pre2 = growI32(run.pre2, nc);
	run.recorded.atrThreshold = growI32(run.recorded.atrThreshold, 1);
}
