/**
 * A run, cut into pieces small enough to write while it is still growing — and
 * put back together.
 *
 * ## Why the run is persisted, and not the messages
 *
 * The plan called for a recorded mission to be replayed back through
 * `teodor-emi-replay-source`, the same path a `.db3` takes. That is not what
 * this does, for two reasons that only became visible once the ingest existed.
 *
 * The first is that there are no messages to persist. The subscription registry
 * hands the ingest **decoded** values; the CDR frames are consumed and released
 * inside the datasource worker. Writing a bag would mean re-encoding every
 * message from the resolved run — inventing a wire representation of data that
 * has already left it.
 *
 * The second is the acceptance test itself: *stop a mission, reopen it offline,
 * get identical numbers.* An {@link EmiRun} is the input to every panel, the
 * detector and the exporter. Persisting it and loading it back is identity —
 * the same columns, bit for bit. Round-tripping through synthesised messages
 * would re-run timebase resolution, tf lookup and georeferencing, and would
 * have to be *argued* to be lossless rather than being so by construction.
 *
 * ## Why chunks
 *
 * A survey is tens of megabytes of typed arrays. Rewriting the whole run every
 * few seconds so a crash cannot lose it would spend the entire budget copying
 * data that has not changed. The columns are append-only, so a fixed number of
 * samples is written once and never touched again, and a reload concatenates
 * what survived. What a crash costs is the tail of the last incomplete chunk.
 */

import {
	createEmiRun,
	type EmiRun,
	type EmiRunSource,
	type RecordedAlert,
	type RecordedTarget,
} from "../detector/run-types";
import type { EmiParams } from "../detector/params";
import type { FrameTree } from "../msgs/frames";

/**
 * Samples per chunk.
 *
 * At the sensor's ~32 Hz this is a shade over a minute of survey — the most a
 * power cut can cost — and about 1.2 MB of typed arrays for a five-coil rake,
 * which is one unremarkable IndexedDB write.
 */
export const CHUNK_SAMPLES = 2048;

/**
 * Format version written into every header.
 *
 * Read on load: a header from a future version is listed but refused rather
 * than reassembled into a run whose columns mean something else.
 */
export const MISSION_FORMAT = 1;

/** Everything about a mission except its samples. */
export interface MissionHeader {
	/** Stable id; also the foreign key on every chunk. */
	id: string;
	/** Operator's name for the mission. */
	name: string;
	/** Format version — see {@link MISSION_FORMAT}. */
	version: number;

	/** Provenance of the samples: a live robot, or a recording being reviewed. */
	runSource: EmiRunSource;
	/** Datasource title the mission was recorded from. */
	label: string;

	/** Wall clock at the first sample, epoch milliseconds. */
	startedAt: number;
	/**
	 * Wall clock at stop, epoch milliseconds — or null.
	 *
	 * Null is the whole recovery signal: a header is written when recording
	 * starts and rewritten on every spill, and only the explicit stop fills this
	 * in. A header still carrying null on the next page load is a mission the
	 * browser was closed on, and is offered as such.
	 */
	endedAt: number | null;

	/** Samples the header claims; a recovered mission may hold fewer. */
	n: number;
	ncoil: number;
	coilIds: Uint8Array;
	offsets: Float32Array;
	originLat: number;
	originLon: number;
	sampleRateHz: number;
	/** True when the source carried `/emi/raw` and the pre-removal columns exist. */
	hasPre: boolean;
	/**
	 * The source's transform tree, when it published one.
	 *
	 * Optional rather than versioned: a header written before this existed reads
	 * back as `undefined` and the map draws no ghosts, which is what it did then
	 * anyway. Nothing else reads it, so an absent tree cannot misalign a column.
	 */
	frameTree?: FrameTree | null;
	/** Samples per chunk this mission was written with. */
	chunkSamples: number;

	/** What the robot reported on the day — sparse, so it rides in the header. */
	alerts: RecordedAlert[];
	targets: RecordedTarget[];

	/**
	 * Tuning in force when the mission was stopped.
	 *
	 * Not an input to anything on reload — the run is parameter-free by
	 * construction — but it is what the operator was looking at, and an export
	 * that cannot state its parameters is not reproducible.
	 */
	params: EmiParams | null;
}

/** One contiguous block of samples. */
export interface MissionChunk {
	missionId: string;
	/** Position in the sequence, from 0. */
	seq: number;
	/** Index of this chunk's first sample within the run. */
	from: number;
	/** Samples in this chunk. */
	count: number;

	t: Float64Array;
	fixLat: Float64Array;
	fixLon: Float64Array;
	sx: Float64Array;
	sy: Float64Array;
	sigma: Float64Array;
	yaw: Float64Array;
	atrThreshold: Int32Array;

	coilLat: Float64Array;
	coilLon: Float64Array;
	raw1: Int32Array;
	raw2: Int32Array;
	/** Empty unless the header says {@link MissionHeader.hasPre}. */
	pre1: Int32Array;
	pre2: Int32Array;
}

/**
 * Describe a run, without its samples.
 *
 * @param run - The run being recorded.
 * @param meta - Identity and timing the run itself does not carry.
 * @returns A header ready to be written.
 */
export function headerFromRun(
	run: EmiRun,
	meta: {
		id: string;
		name: string;
		startedAt: number;
		endedAt?: number | null;
		params?: EmiParams | null;
	},
): MissionHeader {
	return {
		id: meta.id,
		name: meta.name,
		version: MISSION_FORMAT,
		runSource: run.source,
		label: run.label,
		startedAt: meta.startedAt,
		endedAt: meta.endedAt ?? null,
		n: run.n,
		ncoil: run.ncoil,
		// Copied, not referenced: the caller keeps recording into this run, and
		// a structured clone of a live buffer is a race the writer would lose.
		coilIds: run.coilIds.slice(),
		offsets: run.offsets.slice(),
		originLat: run.originLat,
		originLon: run.originLon,
		sampleRateHz: run.sampleRateHz,
		hasPre: run.hasPre,
		frameTree: run.frameTree,
		chunkSamples: CHUNK_SAMPLES,
		alerts: run.recorded.alerts.slice(),
		targets: run.recorded.targets.map((t) => ({
			...t,
			coils: [...t.coils],
		})),
		params: meta.params ?? null,
	};
}

/**
 * Cut `count` samples out of a run, starting at `from`.
 *
 * Every column is copied synchronously. That is not an optimisation to be
 * removed: the caller hands the result to an asynchronous write while the
 * ingest keeps appending, and appending past the capacity **reallocates every
 * column**. A chunk holding views into the old buffers would be written after
 * the run had already moved on.
 *
 * @param run - The run being recorded.
 * @param missionId - Mission the chunk belongs to.
 * @param seq - Position in the sequence.
 * @param from - Index of the first sample.
 * @param count - Samples to take.
 * @returns The chunk, or null when the range is empty or out of bounds.
 */
export function chunkFromRun(
	run: EmiRun,
	missionId: string,
	seq: number,
	from: number,
	count: number,
): MissionChunk | null {
	if (count <= 0 || from < 0 || from + count > run.n) return null;
	const nc = run.ncoil;
	const a = from;
	const b = from + count;
	const ca = from * nc;
	const cb = b * nc;
	const empty = new Int32Array(0);

	return {
		missionId,
		seq,
		from,
		count,
		t: run.t.slice(a, b),
		fixLat: run.fixLat.slice(a, b),
		fixLon: run.fixLon.slice(a, b),
		sx: run.sx.slice(a, b),
		sy: run.sy.slice(a, b),
		sigma: run.sigma.slice(a, b),
		yaw: run.yaw.slice(a, b),
		atrThreshold: run.recorded.atrThreshold.slice(a, b),
		coilLat: run.coilLat.slice(ca, cb),
		coilLon: run.coilLon.slice(ca, cb),
		raw1: run.raw1.slice(ca, cb),
		raw2: run.raw2.slice(ca, cb),
		pre1: run.hasPre ? run.pre1.slice(ca, cb) : empty,
		pre2: run.hasPre ? run.pre2.slice(ca, cb) : empty,
	};
}

/** What a reassembly produced, and what it had to leave out. */
export interface RecoveredRun {
	run: EmiRun;
	/** Samples actually restored. */
	n: number;
	/** Samples the header claimed but that no chunk supplied. */
	missing: number;
	/** True when the sequence had a hole and everything after it was dropped. */
	truncated: boolean;
}

/**
 * Put a mission back together.
 *
 * Contiguity is enforced rather than assumed. A mission interrupted mid-write
 * can leave a hole — a chunk that never landed while later ones did — and
 * copying the later chunks in at their recorded offsets would leave a band of
 * zeros in the middle of the survey: a stretch of perfectly flat signal at
 * latitude zero, which reads as *data* and not as *absence*. The run stops at
 * the hole and says so.
 *
 * @param header - The mission header.
 * @param chunks - Its chunks, in any order.
 * @returns The run and what it cost, or null if the format is unreadable.
 */
export function runFromMission(
	header: MissionHeader,
	chunks: MissionChunk[],
): RecoveredRun | null {
	if (header.version > MISSION_FORMAT) return null;

	const ordered = [...chunks].sort((x, y) => x.from - y.from);
	let n = 0;
	let truncated = false;
	const usable: MissionChunk[] = [];
	for (const c of ordered) {
		// A duplicate or overlapping chunk is a rewrite of ground already
		// covered; a gap ends the run.
		if (c.from < n) continue;
		if (c.from > n) {
			truncated = true;
			break;
		}
		usable.push(c);
		n += c.count;
	}

	// The chunks are the record, not the header. A spill writes its blocks and
	// *then* rewrites the header, so a crash in that window leaves a header
	// claiming the count from the previous spill — after the first one, three
	// samples. Clamping to it would hand back a three-sample mission with
	// `missing: 0` and no warning at all, which is the one outcome the whole
	// chunked format exists to prevent.
	const claimed = header.n;

	// A run only has the pre-removal columns if *every* block carries them. They
	// begin empty and start being written when the first `/emi/raw` sample lands,
	// while the header is rewritten each spill and ends up saying `true` — so
	// trusting it alone would zero-fill the leading blocks, and the walkthrough
	// would draw a full-amplitude baseline subtraction that never happened.
	const hasPre =
		header.hasPre &&
		usable.length > 0 &&
		usable.every((c) => c.pre1.length > 0);

	const run = createEmiRun(
		{
			id: header.id,
			source: header.runSource,
			label: header.name || header.label,
			coilIds: header.coilIds.slice(),
			offsets: header.offsets.slice(),
			originLat: header.originLat,
			originLon: header.originLon,
			sampleRateHz: header.sampleRateHz,
			frameTree: header.frameTree ?? null,
		},
		Math.max(1, n),
	);
	run.hasPre = hasPre;
	const nc = run.ncoil;

	for (const c of usable) {
		if (c.from >= n) break;
		const take = Math.min(c.count, n - c.from);
		const sub = <T extends Float64Array | Int32Array>(
			a: T,
			stride: number,
		) => (take === c.count ? a : a.subarray(0, take * stride)) as T;

		run.t.set(sub(c.t, 1), c.from);
		run.fixLat.set(sub(c.fixLat, 1), c.from);
		run.fixLon.set(sub(c.fixLon, 1), c.from);
		run.sx.set(sub(c.sx, 1), c.from);
		run.sy.set(sub(c.sy, 1), c.from);
		run.sigma.set(sub(c.sigma, 1), c.from);
		run.yaw.set(sub(c.yaw, 1), c.from);
		run.recorded.atrThreshold.set(sub(c.atrThreshold, 1), c.from);

		run.coilLat.set(sub(c.coilLat, nc), c.from * nc);
		run.coilLon.set(sub(c.coilLon, nc), c.from * nc);
		run.raw1.set(sub(c.raw1, nc), c.from * nc);
		run.raw2.set(sub(c.raw2, nc), c.from * nc);
		if (hasPre) {
			run.pre1.set(sub(c.pre1, nc), c.from * nc);
			run.pre2.set(sub(c.pre2, nc), c.from * nc);
		}
	}

	run.n = n;
	// Alerts and targets ride in the header and are therefore as complete as the
	// last spill, which can be ahead of the samples. Trimming both to the
	// restored span keeps a detection from pointing past the end of the run —
	// marks over ground the recovered survey does not contain.
	const tEnd = n > 0 ? run.t[n - 1]! : -Infinity;
	run.recorded.alerts = header.alerts.filter((a) => a.t <= tEnd);
	run.recorded.targets = header.targets
		.filter((t) => t.firstSeen <= tEnd)
		.map((t) => ({ ...t, coils: [...t.coils] }));

	return { run, n, missing: Math.max(0, claimed - n), truncated };
}

/**
 * Rough size of a mission on disk, bytes.
 *
 * Columns only — the header's alerts and targets are a rounding error beside
 * them. Used to tell an operator what clearing a mission gets back.
 *
 * @param header - The mission header.
 * @returns Approximate bytes.
 */
export function missionBytes(header: MissionHeader): number {
	// 7 × f64 + 1 × i32 per sample; (2 × f64 + 2 or 4 × i32) per sample per coil.
	const perSample = 7 * 8 + 4;
	const perCoil = 2 * 8 + (header.hasPre ? 4 : 2) * 4;
	return header.n * (perSample + header.ncoil * perCoil);
}
