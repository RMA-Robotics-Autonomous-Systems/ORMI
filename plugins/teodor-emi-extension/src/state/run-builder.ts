/**
 * Topics in, one {@link EmiRun} out.
 *
 * This is the join between the datasource layer and the detector. It is
 * deliberately free of React, of the plugins manager and of any notion of which
 * datasource is feeding it: a recording replayed through
 * `teodor-emi-replay-source` and a live robot on foxglove publish the same
 * shapes on the same topics, so the same builder consumes both. That is the
 * whole reason "offline" and "online" are not two code paths.
 *
 * ## What drives the timebase
 *
 * `/teodora/emi/gnss` — one message per EMI sample, carrying every coil's raw
 * channels, every coil's absolute fix, and the ATR threshold in force. Nothing
 * else is sampled at the EMI rate, so nothing else can define the row index that
 * every per-sample column of a run is keyed on. The ancillary topics (robot fix,
 * heading, `tf_static`) are latest-wins and are read at the moment a sample
 * lands.
 *
 * ## Where sigma comes from, and where it does not
 *
 * Not from the robot fix. `sensor_msgs/msg/NavSatFix` has a converter in the
 * webapp registry, and that converter reads accuracy out of
 * `position_covariance[0]` only when `Array.isArray` accepts the field — which
 * it never does, because the CDR reader hands back a `Float64Array`. So the
 * robot-fix topic delivers accuracy `0` on the live path and, because the replay
 * mirrors the converter exactly, on the replay path too.
 *
 * The per-coil `gnss` inside `EMIGnss` is *not* converted (no `emi_msgs` entry
 * in the registry), so its covariance survives intact. That is where sigma is
 * read, and it is also the number the robot's own tracker gated on.
 */

import {
	createEmiRun,
	ensureRunCapacity,
	type EmiRun,
	type EmiRunSource,
	type RecordedAlert,
	type RecordedTarget,
} from "../detector/run-types";
import { fromEnu, toEnu } from "../detector/georeference";
import {
	fixSigma,
	stampSeconds,
	yawFromQuaternion,
	type EMIGnssMessage,
	type EMIMessage,
	type EMITargetListMessage,
	type EMITargetMessage,
	type NavSatFix,
	type QuaternionStamped,
	type RosTime,
} from "../msgs/emi-types";
import {
	collectEdges,
	fallbackGeometry,
	resolveCoilGeometryFromEdges,
	resolveFrameTree,
	type CoilGeometry,
	type FrameEdge,
	type FrameTree,
	type TFMessage,
} from "../msgs/frames";

/** Identity of the run being built. */
export interface RunBuilderInit {
	id: string;
	source: EmiRunSource;
	label: string;
}

/**
 * Consecutive samples behind the run's high-water mark that confirm a seek.
 *
 * The run's time column must be non-decreasing: every window, every
 * `lowerBound` and the whole MAD baseline assume it. So a sample stamped
 * earlier than the newest one already stored cannot be appended, and the
 * builder has to decide which of two very different things just happened.
 *
 * **A replay seek**, where the source restarted from an earlier position and
 * every sample from here on is behind the mark — the run has to be thrown away
 * and rebuilt, or it would interleave two passes over the same ground.
 *
 * **A bad stamp**, where one sample carries a timestamp the EMI device got
 * wrong and the very next one is back on the wire's cadence. These are not rare
 * and they are not small: every recording in the reference set carries them, at
 * 0.07 %–3 % of samples, with backwards jumps of up to 53 seconds while the
 * recorder's own clock advanced 14 ms. Treating one of those as a seek is what
 * reduced a twenty-one-minute survey to its last ten seconds — the run was torn
 * down and restarted 136 times, and the operator saw the tail.
 *
 * Magnitude cannot separate them (a bad stamp is *larger* than most seeks), so
 * persistence does: a seek stays behind the mark forever, an outlier does not.
 * Across the reference recordings — ten bags, 230 000 samples — the longest run
 * of consecutive out-of-order samples is **two**, so this threshold sits well
 * clear of the artefact and still confirms a seek within a quarter of a second.
 *
 * It also bounds the damage from anything else the clock might do: a stamp that
 * jumps *forward* leaves every following sample behind the mark, which this
 * reads as a seek and recovers from — at a cost of eight samples rather than
 * the recording.
 */
const SEEK_CONFIRM_SAMPLES = 8;

/** What the builder knows beyond the run itself. */
export interface BuilderStatus {
	/** True once a sample has been appended. */
	started: boolean;
	/** Coil geometry currently in force. */
	geometry: CoilGeometry;
	/**
	 * Samples dropped because their stamp was behind the run's newest.
	 *
	 * On these recordings this is the EMI device's own clock misbehaving rather
	 * than the transport reordering anything — see {@link SEEK_CONFIRM_SAMPLES}.
	 * A non-zero count here is worth showing: it is the run saying how much of
	 * the recording carried a timestamp it could not use.
	 */
	droppedOutOfOrder: number;
	/** Samples dropped because the coil set disagreed with the run's. */
	droppedCoilMismatch: number;
	/** Transform trees refused because they did not describe this rake. */
	geometryRejected: number;
	/** Times the run was reset by a backwards seek. */
	seeks: number;
	/** True while the robot-fix topic has never been seen. */
	fixReconstructed: boolean;
	/** Absolute time of the first sample, seconds. */
	t0: number;
}

/** A target keyed by the tracker that wrote it, so both trackers coexist. */
const targetKey = (t: EMITargetMessage): string =>
	`${t.source ?? "unknown"}#${t.id}`;

/**
 * Accumulates decoded messages into a run.
 *
 * Single-threaded and mutating: it owns the run's buffers and reallocates them
 * as the run grows, so a caller that captures a column reference across a call
 * is left holding a stale buffer. Read columns through the run object each time.
 */
export class EmiRunBuilder {
	private run: EmiRun | null = null;
	private readonly init: RunBuilderInit;

	/**
	 * The transform tree, accumulated.
	 *
	 * Edges rather than the messages that carried them: `tf_static` is latched
	 * and re-delivered in full on every reconnect and every replay seek, so
	 * keeping the messages would grow without bound and make each arrival cost
	 * a re-walk of every message before it.
	 */
	private tfEdges = new Map<string, FrameEdge>();
	private geometry: CoilGeometry = fallbackGeometry();
	/**
	 * The same tree flattened for drawing. Survives a seek along with
	 * {@link tfEdges}: the robot does not change shape because the replay was
	 * scrubbed, and `tf_static` is latched, so re-deriving it would mean waiting
	 * for a re-delivery that may never come.
	 */
	private frameTree: FrameTree | null = null;

	/** Latest robot fix, absolute degrees. */
	private fixLat = NaN;
	private fixLon = NaN;
	/** Latest heading, radians. */
	private yaw = NaN;
	/** Latest pre-offset-removal channels, by coil id. */
	private preByCoil = new Map<number, [number, number]>();

	/** Absolute time of the first sample. */
	private t0 = NaN;
	/**
	 * Newest sample time in the run — the high-water mark, not the last stamp
	 * seen. A sample behind this cannot be appended without breaking the run's
	 * ordering, and out-of-order stamps are common enough here that "the last
	 * one" and "the newest one" are genuinely different values.
	 */
	private tMax = NaN;
	/** Samples in a row behind {@link tMax}; a seek is confirmed by this. */
	private behind = 0;

	/** Alerts as published, in absolute seconds. */
	private rawAlerts: Array<Omit<RecordedAlert, "t"> & { tAbs: number }> = [];
	/** Targets by tracker and id — the topics are latched and republish in full. */
	private rawTargets = new Map<
		string,
		Omit<RecordedTarget, "firstSeen" | "lastSeen"> & {
			firstAbs: number;
			lastAbs: number;
		}
	>();

	private droppedOutOfOrder = 0;
	private droppedCoilMismatch = 0;
	private geometryRejected = 0;
	private seeks = 0;
	private sawFix = false;

	/** True when something changed since the last {@link finalize}. */
	dirty = false;

	constructor(init: RunBuilderInit) {
		this.init = init;
	}

	/** The run under construction, or null before the first sample. */
	get current(): EmiRun | null {
		return this.run;
	}

	/** Everything about the build that is not a column of the run. */
	get status(): BuilderStatus {
		return {
			started: this.run !== null,
			geometry: this.geometry,
			droppedOutOfOrder: this.droppedOutOfOrder,
			droppedCoilMismatch: this.droppedCoilMismatch,
			geometryRejected: this.geometryRejected,
			seeks: this.seeks,
			fixReconstructed: !this.sawFix,
			t0: this.t0,
		};
	}

	/** Drop everything and start over — a new recording, or a backwards seek. */
	reset(): void {
		this.run = null;
		this.fixLat = NaN;
		this.fixLon = NaN;
		this.yaw = NaN;
		this.preByCoil.clear();
		this.t0 = NaN;
		this.tMax = NaN;
		this.behind = 0;
		this.rawAlerts = [];
		this.rawTargets.clear();
		this.droppedOutOfOrder = 0;
		this.droppedCoilMismatch = 0;
		this.geometryRejected = 0;
		this.sawFix = false;
		this.dirty = true;
	}

	// ── Ancillary topics: latest-wins, read when a sample lands ──────────

	/**
	 * `/tf_static`. Latched and split across messages, so every one is kept and
	 * the tree is re-resolved from the accumulated set.
	 *
	 * A run already in progress has its offsets replaced in place when the tree
	 * finally resolves — but only if the coil *set* matches, because `ncoil`
	 * strides every per-coil column and changing it mid-run would reinterpret
	 * every sample already stored.
	 *
	 * @param msg - A decoded `tf2_msgs/msg/TFMessage`.
	 */
	onTfStatic(msg: TFMessage): void {
		for (const [child, edge] of collectEdges([msg])) {
			this.tfEdges.set(child, edge);
		}
		// The drawable tree is kept whatever the rake resolves to. `tf_static`
		// arrives split across a dozen latched messages, so an early one that
		// carries the chassis but not yet the coils still describes the robot —
		// and refusing to keep it until the rake is complete would leave the map
		// with nothing to draw on a source whose coil frames never arrive.
		this.frameTree = resolveFrameTree(this.tfEdges);
		if (this.run) {
			this.run.frameTree = this.frameTree;
			this.dirty = true;
		}

		const resolved = resolveCoilGeometryFromEdges(this.tfEdges);
		if (!resolved.fromTf) {
			// The fallback stays in force, but how close the tree came is worth
			// carrying: "assumed geometry, and the tree offered six coil frames"
			// is a different problem from "assumed geometry, no tree at all",
			// and the trust tab reports it.
			this.geometry = {
				...this.geometry,
				resolvedFromTf: resolved.resolvedFromTf,
			};
			return;
		}
		this.geometry = resolved;

		const run = this.run;
		if (!run) return;
		if (run.coilIds.length !== resolved.coilIds.length) {
			this.geometryRejected++;
			return;
		}
		for (let c = 0; c < run.coilIds.length; c++) {
			if (run.coilIds[c] !== resolved.coilIds[c]) {
				this.geometryRejected++;
				return;
			}
		}
		run.offsets = resolved.offsets;
		this.dirty = true;
	}

	/**
	 * The robot fix, `/teodora/xsens/gnss`.
	 *
	 * Accepts both shapes the topic can arrive in: the converted
	 * `GeolocationPosition` (what the webapp registry produces for
	 * `sensor_msgs/msg/NavSatFix`, on the live path and on the replay alike) and
	 * the raw `NavSatFix`, in case a source publishes it unconverted.
	 *
	 * @param msg - The fix, in either shape.
	 */
	onFix(msg: unknown): void {
		const pos = asPosition(msg);
		if (!pos) return;
		this.fixLat = pos[0];
		this.fixLon = pos[1];
		this.sawFix = true;
	}

	/**
	 * `/emi/raw` — the signal before the baseline remover.
	 *
	 * Nothing in the detector reads this. It exists so the walkthrough's first
	 * stage can show the subtraction happening instead of asserting that it
	 * does, and it is latest-wins like the other ancillary topics: the two
	 * streams run at the same rate off the same device, so the most recent raw
	 * sample is the one the next georeferenced sample came from.
	 *
	 * @param msg - A decoded `emi_msgs/msg/EMI`.
	 */
	onEmiRaw(msg: EMIMessage): void {
		const coils = msg?.emi_array;
		if (!coils?.length) return;
		this.preByCoil.clear();
		for (const c of coils) {
			this.preByCoil.set(c.id, [c.raw1 | 0, c.raw2 | 0]);
		}
	}

	/**
	 * The robot heading, `/teodora/xsens/filter/quaternion`.
	 *
	 * @param msg - A decoded `geometry_msgs/msg/QuaternionStamped`.
	 */
	onQuaternion(msg: QuaternionStamped): void {
		if (!msg?.quaternion) return;
		const y = yawFromQuaternion(msg.quaternion);
		if (Number.isFinite(y)) this.yaw = y;
	}

	// ── The timebase ────────────────────────────────────────────────────

	/**
	 * `/teodora/emi/gnss` — one EMI sample.
	 *
	 * @param msg - A decoded `emi_msgs/msg/EMIGnss`.
	 */
	onEmiGnss(msg: EMIGnssMessage): void {
		const coils = msg?.emi_array;
		if (!coils || coils.length === 0) return;

		const tAbs = stampSeconds(msg.header.stamp);
		if (!Number.isFinite(tAbs)) return;

		if (Number.isFinite(this.tMax) && tAbs < this.tMax) {
			this.droppedOutOfOrder++;
			this.behind++;
			// Not yet a seek. One sample the device stamped wrong costs that
			// sample and nothing else — the run keeps everything it has, and the
			// next sample carries on from the mark.
			if (this.behind < SEEK_CONFIRM_SAMPLES) return;
			// Sustained: the source really is delivering from an earlier
			// position. Rebuild from here, keeping the seek tally across the
			// wipe so the trust panel can still say it happened.
			const seeks = this.seeks + 1;
			this.reset();
			this.seeks = seeks;
		} else {
			this.behind = 0;
		}

		const run = this.ensureRun(
			coils.map((c) => c.id),
			msg,
			tAbs,
		);
		if (!run) return;
		if (run.ncoil !== coils.length) {
			this.droppedCoilMismatch++;
			return;
		}

		const i = run.n;
		ensureRunCapacity(run, i + 1);
		const nc = run.ncoil;

		run.t[i] = tAbs - this.t0;
		run.recorded.atrThreshold[i] = Math.trunc(msg.atr_threshold ?? 0);

		// Heading: the coil-carried yaw is the one that actually produced these
		// positions, so it wins over the separately-timed quaternion topic. It
		// is absent on the older wire layout — see the two variants in
		// `msgs/schemas.ts`.
		let yaw = NaN;
		let sigma = NaN;
		// Every other per-coil column is written unconditionally below, but the
		// pre-removal channels are written only when `/emi/raw` has a matching
		// coil. Without this, a row abandoned mid-loop would leave its values in
		// place for the next sample to inherit, and the walkthrough would show a
		// subtraction that never happened.
		run.pre1.fill(0, i * nc, (i + 1) * nc);
		run.pre2.fill(0, i * nc, (i + 1) * nc);
		for (let c = 0; c < nc; c++) {
			const coil = coils[c]!;
			const ci = this.coilIndex(run, coil.id);
			if (ci < 0) {
				this.droppedCoilMismatch++;
				return;
			}
			const k = i * nc + ci;
			run.raw1[k] = coil.raw1 | 0;
			run.raw2[k] = coil.raw2 | 0;
			const pre = this.preByCoil.get(coil.id);
			if (pre) {
				run.pre1[k] = pre[0];
				run.pre2[k] = pre[1];
				run.hasPre = true;
			}
			run.coilLat[k] = coil.gnss?.latitude ?? NaN;
			run.coilLon[k] = coil.gnss?.longitude ?? NaN;
			if (!Number.isFinite(sigma) && coil.gnss) {
				const s = fixSigma(coil.gnss);
				if (Number.isFinite(s)) sigma = s;
			}
			if (!Number.isFinite(yaw) && Number.isFinite(coil.yaw ?? NaN)) {
				yaw = coil.yaw!;
			}
		}
		if (!Number.isFinite(yaw)) yaw = this.yaw;
		run.yaw[i] = yaw;
		run.sigma[i] = sigma;

		const [lat, lon] = this.bodyOrigin(run, i, yaw);
		run.fixLat[i] = lat;
		run.fixLon[i] = lon;
		if (Number.isFinite(lat) && Number.isFinite(lon)) {
			const [x, y] = toEnu(lat, lon, run.originLat, run.originLon);
			run.sx[i] = x;
			run.sy[i] = y;
		} else {
			run.sx[i] = NaN;
			run.sy[i] = NaN;
		}

		run.n = i + 1;
		this.tMax = tAbs;
		this.dirty = true;
	}

	// ── What the robot decided ──────────────────────────────────────────

	/**
	 * `/teodora/emi/gnss/alert` — the robot's own detections.
	 *
	 * Only the coils the message flags as alerting are recorded. A message that
	 * flags none is taken at face value rather than being expanded to every coil
	 * present: guessing here would inflate the recorded count that the replay is
	 * measured against, which is the one number that must not be flattered.
	 *
	 * @param msg - A decoded `emi_msgs/msg/EMIGnss` from the alert topic.
	 */
	onAlert(msg: EMIGnssMessage): void {
		const coils = msg?.emi_array;
		if (!coils?.length) return;
		const tAbs = stampSeconds(msg.header.stamp);
		if (!Number.isFinite(tAbs)) return;
		const thr = Math.trunc(msg.atr_threshold ?? 0);

		for (const coil of coils) {
			if (!coil.alert) continue;
			this.rawAlerts.push({
				coil: coil.id,
				latitude: coil.gnss?.latitude ?? NaN,
				longitude: coil.gnss?.longitude ?? NaN,
				amp: Math.max(coil.raw1 | 0, coil.raw2 | 0),
				thr,
				tAbs,
			});
			this.dirty = true;
		}
	}

	/**
	 * `/teodora/emi/targets` or `/teodora/emi/proposed/targets`.
	 *
	 * Both trackers publish full lists with `KeepAll().transient_local()`, so a
	 * target is upserted by `(source, id)` rather than appended — a late join
	 * receives the whole history at once and a running tracker republishes
	 * targets it has revised.
	 *
	 * @param msg - A decoded `emi_msgs/msg/EMITargetList`.
	 */
	onTargets(msg: EMITargetListMessage): void {
		const list = msg?.targets;
		if (!list?.length) return;
		for (const t of list) {
			this.rawTargets.set(targetKey(t), {
				id: t.id,
				source: t.source ?? "unknown",
				latitude: t.gnss?.latitude ?? NaN,
				longitude: t.gnss?.longitude ?? NaN,
				centroidLatitude: t.centroid_latitude,
				centroidLongitude: t.centroid_longitude,
				bestAmplitude: t.best_amplitude,
				bestCoil: t.best_coil,
				atrThreshold: t.atr_threshold,
				nDetections: t.n_detections,
				coils: Array.from(t.coils ?? []),
				spread: t.spread,
				gateUsed: t.gate_used,
				sigmaAtCreation: t.sigma_at_creation,
				degradedFix: Boolean(t.degraded_fix),
				firstAbs: rosSeconds(t.first_seen),
				lastAbs: rosSeconds(t.last_seen),
			});
		}
		this.dirty = true;
	}

	/**
	 * Fold the recorded alerts and targets onto the run's timebase.
	 *
	 * Kept out of the per-message path on purpose: both arrive before `t0` is
	 * known often enough that converting on arrival would need a fix-up pass
	 * anyway, and both are small enough to rebuild whenever the UI reads.
	 *
	 * @returns The run, with `recorded` up to date; null before the first sample.
	 */
	finalize(): EmiRun | null {
		const run = this.run;
		this.dirty = false;
		if (!run) return null;
		const t0 = this.t0;

		run.recorded.alerts = this.rawAlerts.map(
			({ tAbs, ...rest }): RecordedAlert => ({ ...rest, t: tAbs - t0 }),
		);
		run.recorded.targets = [...this.rawTargets.values()].map(
			({ firstAbs, lastAbs, ...rest }): RecordedTarget => ({
				...rest,
				firstSeen: firstAbs - t0,
				lastSeen: lastAbs - t0,
			}),
		);
		return run;
	}

	// ── internals ───────────────────────────────────────────────────────

	/**
	 * The run, created on the first sample.
	 *
	 * Coil ids come from the message rather than from `tf_static`, because the
	 * message is what strides the columns and the tree may not have arrived yet.
	 * Offsets come from the tree when it has, and are patched in later if not.
	 */
	private ensureRun(
		ids: number[],
		msg: EMIGnssMessage,
		tAbs: number,
	): EmiRun | null {
		if (this.run) return this.run;

		const coilIds = new Uint8Array(ids);
		const geom = this.geometry;
		// Offsets are ordered by the tree's ascending coil id; the message's
		// order is what the run is strided by. Match them by id, and fall back
		// to zero for a coil the geometry does not know — a zero offset places
		// that coil at the robot origin, which is visibly wrong rather than
		// subtly wrong.
		const offsets = new Float32Array(coilIds.length * 3);
		for (let c = 0; c < coilIds.length; c++) {
			const g = indexOfCoil(geom.coilIds, coilIds[c]!);
			if (g < 0) continue;
			offsets[c * 3] = geom.offsets[g * 3]!;
			offsets[c * 3 + 1] = geom.offsets[g * 3 + 1]!;
			offsets[c * 3 + 2] = geom.offsets[g * 3 + 2]!;
		}

		// The projection origin: the robot fix if we have one, else the first
		// coil's own position. Only the origin — everything downstream is a
		// difference, so the choice moves no result, it only keeps the local
		// metres small enough for the flat-earth approximation to hold.
		const first = msg.emi_array[0];
		const originLat = Number.isFinite(this.fixLat)
			? this.fixLat
			: (first?.gnss?.latitude ?? 0);
		const originLon = Number.isFinite(this.fixLon)
			? this.fixLon
			: (first?.gnss?.longitude ?? 0);

		this.t0 = tAbs;
		this.run = createEmiRun({
			id: this.init.id,
			source: this.init.source,
			label: this.init.label,
			coilIds,
			offsets,
			originLat,
			originLon,
			sampleRateHz: 32,
			frameTree: this.frameTree,
		});
		return this.run;
	}

	/** Index of a published coil id in the run's stride order. */
	private coilIndex(run: EmiRun, id: number): number {
		return indexOfCoil(run.coilIds, id);
	}

	/**
	 * Where the body frame is at this sample, in absolute degrees.
	 *
	 * The robot fix when the antenna topic is present; otherwise reconstructed
	 * by undoing the rotation the robot applied to place coil 0 — which lands on
	 * the same point, because that is exactly the origin the georeference node
	 * placed the coils from. Without a heading neither is possible and the
	 * sample carries no position; `georeference` drops detections there rather
	 * than placing them at a guess.
	 */
	private bodyOrigin(run: EmiRun, i: number, yaw: number): [number, number] {
		if (Number.isFinite(this.fixLat) && Number.isFinite(this.fixLon)) {
			return [this.fixLat, this.fixLon];
		}
		const nc = run.ncoil;
		const lat = run.coilLat[i * nc];
		const lon = run.coilLon[i * nc];
		if (
			lat === undefined ||
			lon === undefined ||
			!Number.isFinite(lat) ||
			!Number.isFinite(lon)
		) {
			return [NaN, NaN];
		}
		if (!Number.isFinite(yaw)) return [NaN, NaN];

		const ox = run.offsets[0]!;
		const oy = run.offsets[1]!;
		const [ex, ny] = toEnu(lat, lon, run.originLat, run.originLon);
		const c = Math.cos(yaw);
		const s = Math.sin(yaw);
		const bx = ex - (c * ox - s * oy);
		const by = ny - (s * ox + c * oy);
		return fromEnu(bx, by, run.originLat, run.originLon);
	}
}

/** Index of a coil id in an ordered id list, or -1. */
function indexOfCoil(ids: Uint8Array, id: number): number {
	for (let i = 0; i < ids.length; i++) if (ids[i] === id) return i;
	return -1;
}

/** Seconds from a ROS stamp that may be absent. */
function rosSeconds(stamp: RosTime | undefined): number {
	return stamp ? stampSeconds(stamp) : NaN;
}

/**
 * Latitude/longitude out of whichever shape a position topic arrived in.
 *
 * @param msg - A `GeolocationPosition`-like or raw `NavSatFix` payload.
 * @returns `[latitude, longitude]`, or null when neither shape fits.
 */
function asPosition(msg: unknown): [number, number] | null {
	if (!msg || typeof msg !== "object") return null;
	const geo = msg as { coords?: { latitude?: number; longitude?: number } };
	if (geo.coords && typeof geo.coords.latitude === "number") {
		const { latitude, longitude } = geo.coords;
		return Number.isFinite(latitude) && Number.isFinite(longitude ?? NaN)
			? [latitude, longitude!]
			: null;
	}
	const fix = msg as NavSatFix;
	if (typeof fix.latitude === "number" && typeof fix.longitude === "number") {
		return Number.isFinite(fix.latitude) && Number.isFinite(fix.longitude)
			? [fix.latitude, fix.longitude]
			: null;
	}
	return null;
}
