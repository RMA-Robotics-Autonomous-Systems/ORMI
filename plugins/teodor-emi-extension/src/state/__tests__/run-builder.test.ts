/**
 * The join between the topics and the detector.
 *
 * Everything here is about a column staying aligned with the sample it belongs
 * to. A misaligned run does not fail — it produces plausible numbers about the
 * wrong instants, which is the failure mode worth paying for tests over.
 */

import { describe, expect, it } from "bun:test";
import { EmiRunBuilder } from "../run-builder";
import type {
	EMIGnssMessage,
	EMIMessage,
	EMITargetListMessage,
	QuaternionStamped,
} from "../../msgs/emi-types";
import type { TFMessage } from "../../msgs/frames";

/** A stamp `s` seconds after an arbitrary epoch. */
const stamp = (s: number) => ({
	sec: 1_700_000_000 + Math.floor(s),
	nanosec: Math.round((s % 1) * 1e9),
});

/** A per-coil fix with a usable covariance. */
const fix = (lat: number, lon: number, variance = 0.04) => ({
	header: { stamp: stamp(0), frame_id: "coilN_link" },
	status: { status: 0, service: 0 },
	latitude: lat,
	longitude: lon,
	altitude: 100,
	position_covariance: new Float64Array([
		variance,
		0,
		0,
		0,
		variance,
		0,
		0,
		0,
		variance,
	]),
	position_covariance_type: 2,
});

/** One `/teodora/emi/gnss` message with five coils. */
function gnssMessage(
	t: number,
	values: number[],
	opts: { yaw?: number; threshold?: number; lat?: number; lon?: number } = {},
): EMIGnssMessage {
	const lat = opts.lat ?? 50.8;
	const lon = opts.lon ?? 4.39;
	return {
		header: { stamp: stamp(t), frame_id: "emi_gnss_frame" },
		atr_threshold: opts.threshold ?? 5000,
		emi_array: values.map((v, i) => ({
			id: i + 1,
			gnss: fix(lat + i * 1e-6, lon + i * 1e-6),
			alert: false,
			raw1: v,
			raw2: v - 1,
			...(opts.yaw !== undefined ? { yaw: opts.yaw } : {}),
		})),
	};
}

/** A quaternion for a yaw in radians. */
function quat(yaw: number): QuaternionStamped {
	return {
		header: { stamp: stamp(0), frame_id: "base_link" },
		quaternion: { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
	};
}

const init = { id: "run-1", source: "bag" as const, label: "test" };

describe("EmiRunBuilder — the timebase", () => {
	it("appends one sample per primary message, keeping columns aligned", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0.5));
		b.onEmiGnss(gnssMessage(0, [10, 20, 30, 40, 50]));
		b.onEmiGnss(gnssMessage(0.03125, [11, 21, 31, 41, 51]));
		const run = b.finalize()!;

		expect(run.n).toBe(2);
		expect(run.ncoil).toBe(5);
		expect([...run.coilIds]).toEqual([1, 2, 3, 4, 5]);
		// Row-major: sample 1's coil 3 is at index 1*5 + 2.
		expect(run.raw1[1 * 5 + 2]).toBe(31);
		expect(run.raw2[0 * 5 + 0]).toBe(9);
		expect(run.t[0]).toBeCloseTo(0, 6);
		expect(run.t[1]).toBeCloseTo(0.03125, 6);
	});

	it("takes the coil-carried yaw over the quaternion topic", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0.5));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1], { yaw: 1.25 }));
		const run = b.finalize()!;
		// The coil yaw is the one that actually produced these positions.
		expect(run.yaw[0]).toBeCloseTo(1.25, 9);
	});

	it("falls back to the quaternion topic on the older wire layout", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0.75));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));
		const run = b.finalize()!;
		expect(run.yaw[0]).toBeCloseTo(0.75, 6);
	});

	it("reads sigma from the per-coil covariance, not the robot fix", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));
		const run = b.finalize()!;
		expect(run.sigma[0]).toBeCloseTo(0.2, 6);
	});

	it("records the ATR threshold in force per sample", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1], { threshold: 600 }));
		b.onEmiGnss(gnssMessage(1, [1, 1, 1, 1, 1], { threshold: 5000 }));
		const run = b.finalize()!;
		expect([...run.recorded.atrThreshold.subarray(0, 2)]).toEqual([
			600, 5000,
		]);
	});

	it("grows past its initial capacity without losing or shifting a sample", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		const N = 3000;
		for (let i = 0; i < N; i++) {
			b.onEmiGnss(
				gnssMessage(i * 0.03125, [i, i + 1, i + 2, i + 3, i + 4]),
			);
		}
		const run = b.finalize()!;
		expect(run.n).toBe(N);
		expect(run.raw1[(N - 1) * 5 + 4]).toBe(N - 1 + 4);
		expect(run.raw1[0]).toBe(0);
	});
});

describe("EmiRunBuilder — ordering and seeks", () => {
	it("drops a small out-of-order step rather than breaking monotonicity", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(1.0, [1, 1, 1, 1, 1]));
		b.onEmiGnss(gnssMessage(0.9, [2, 2, 2, 2, 2]));
		const run = b.finalize()!;
		expect(run.n).toBe(1);
		expect(b.status.droppedOutOfOrder).toBe(1);
	});

	it("survives a single wildly wrong stamp instead of restarting", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		for (let i = 0; i < 100; i++) {
			b.onEmiGnss(gnssMessage(100 + i * 0.03, [i, i, i, i, i]));
		}
		expect(b.finalize()!.n).toBe(100);

		// What the EMI device actually does: one sample stamped tens of seconds
		// in the past, the next one back on cadence. Every reference recording
		// carries these, and reading one as a seek is what cut a twenty-one
		// minute survey down to its last ten seconds.
		b.onEmiGnss(gnssMessage(77, [99, 99, 99, 99, 99]));
		b.onEmiGnss(gnssMessage(103.03, [7, 7, 7, 7, 7]));

		const run = b.finalize()!;
		expect(run.n).toBe(101);
		expect(b.status.seeks).toBe(0);
		expect(b.status.droppedOutOfOrder).toBe(1);
		// The bad sample is gone; everything recorded before it is not.
		expect(run.raw1[0]).toBe(0);
		expect(run.raw1[100 * run.ncoil]).toBe(7);
	});

	it("keeps the run's time column non-decreasing through the outliers", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		for (let i = 0; i < 60; i++) {
			// Every seventh sample carries a stamp from the distant past.
			const t = i % 7 === 6 ? 10 : 100 + i * 0.03;
			b.onEmiGnss(gnssMessage(t, [i, i, i, i, i]));
		}
		const run = b.finalize()!;
		expect(run.n).toBe(52);
		for (let i = 1; i < run.n; i++) {
			expect(run.t[i]!).toBeGreaterThanOrEqual(run.t[i - 1]!);
		}
	});

	it("restarts the run when the source really seeks", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		for (let i = 0; i < 10; i++) {
			b.onEmiGnss(gnssMessage(100 + i, [i, i, i, i, i]));
		}
		expect(b.finalize()!.n).toBe(10);

		// A seek is not one earlier stamp, it is a stream of them: the source
		// is delivering from an earlier position and never coming back.
		for (let i = 0; i < 12; i++) {
			b.onEmiGnss(gnssMessage(i * 0.03, [99, 99, 99, 99, 99]));
		}
		const run = b.finalize()!;
		expect(b.status.seeks).toBe(1);
		expect(run.raw1[0]).toBe(99);
		// The confirming samples are the cost of being sure: the run restarts
		// at the one that proved it, not at the one that started it.
		expect(run.n).toBe(5);
	});

	it("refuses a message whose coil set disagrees with the run's", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));
		b.onEmiGnss(gnssMessage(1, [1, 1, 1, 1]));
		const run = b.finalize()!;
		expect(run.n).toBe(1);
		expect(b.status.droppedCoilMismatch).toBe(1);
	});
});

describe("EmiRunBuilder — geometry", () => {
	const tf = (
		child: string,
		parent: string,
		x: number,
		y: number,
	): TFMessage["transforms"][number] => ({
		header: { frame_id: parent },
		child_frame_id: child,
		transform: {
			translation: { x, y, z: 0 },
			rotation: { x: 0, y: 0, z: 0, w: 1 },
		},
	});

	it("patches a run's offsets in place when tf_static arrives late", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));
		const before = b.finalize()!.offsets[0]!;

		b.onTfStatic({
			transforms: [
				tf("emi_link", "base_link", 0.8, 0),
				tf("xsens_link", "base_link", 0.165, 0.15),
				tf("coil1_link", "emi_link", -0.2, 0.4),
				tf("coil2_link", "emi_link", -0.2, 0),
				tf("coil3_link", "emi_link", -0.2, -0.4),
				tf("coil4_link", "emi_link", 0.2, -0.2),
				tf("coil5_link", "emi_link", 0.2, 0.2),
			],
		});

		const run = b.finalize()!;
		expect(run.offsets[0]).toBeCloseTo(0.6, 6);
		expect(run.offsets[1]).toBeCloseTo(0.4, 6);
		expect(b.status.geometry.fromTf).toBe(true);
		expect(b.status.geometry.leverArm[0]).toBeCloseTo(0.165, 6);
		// The point of the test: the run was already open when the tree landed.
		expect(before).toBeCloseTo(0.6, 6);
	});

	it("keeps the fallback for a six-coil tree, and says how many it saw", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));
		b.onTfStatic({
			transforms: [
				tf("emi_link", "base_link", 0.8, 0),
				tf("coil1_link", "emi_link", -0.2, 0.4),
				tf("coil2_link", "emi_link", -0.2, 0),
				tf("coil3_link", "emi_link", -0.2, -0.4),
				tf("coil4_link", "emi_link", 0.2, -0.2),
				tf("coil5_link", "emi_link", 0.2, 0.2),
				tf("coil6_link", "emi_link", 0.4, 0),
			],
		});
		const run = b.finalize()!;
		// A tree that does not describe this rake is refused outright rather
		// than accepted as a bigger one: `ncoil` strides every per-coil column.
		expect(run.ncoil).toBe(5);
		expect(b.status.geometry.fromTf).toBe(false);
		// …and the near miss is reported rather than looking like "no tree".
		expect(b.status.geometry.resolvedFromTf).toBe(6);
	});

	it("refuses a tree whose coil ids are not the run's", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));
		const before = b.finalize()!.offsets[1]!;
		b.onTfStatic({
			transforms: [
				tf("emi_link", "base_link", 0.8, 0),
				tf("coil2_link", "emi_link", -0.2, 0.4),
				tf("coil3_link", "emi_link", -0.2, 0),
				tf("coil4_link", "emi_link", -0.2, -0.4),
				tf("coil5_link", "emi_link", 0.2, -0.2),
				tf("coil6_link", "emi_link", 0.2, 0.2),
			],
		});
		const run = b.finalize()!;
		// Five frames, so the tree resolves — but they are coils 2..6 against a
		// run strided on 1..5. Writing them in would silently relabel every
		// per-coil column.
		// Reported as a rejected tree, not as dropped samples: an operator sent
		// looking for a message-rate problem would find nothing.
		expect(b.status.geometryRejected).toBeGreaterThan(0);
		expect(b.status.droppedCoilMismatch).toBe(0);
		expect(run.offsets[1]).toBeCloseTo(before, 6);
	});
});

describe("EmiRunBuilder — what the robot decided", () => {
	it("records only the coils an alert message flags", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));

		const alert = gnssMessage(1.5, [10, 20, 30, 40, 50], {
			threshold: 600,
		});
		alert.emi_array[2]!.alert = true;
		b.onAlert(alert);

		const run = b.finalize()!;
		expect(run.recorded.alerts).toHaveLength(1);
		expect(run.recorded.alerts[0]!.coil).toBe(3);
		// max(raw1, raw2) — raw2 is raw1 - 1 in this fixture.
		expect(run.recorded.alerts[0]!.amp).toBe(30);
		expect(run.recorded.alerts[0]!.thr).toBe(600);
		// Folded onto the run's timebase, not left absolute.
		expect(run.recorded.alerts[0]!.t).toBeCloseTo(1.5, 6);
	});

	it("upserts targets by tracker and id rather than appending", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));

		const list = (
			source: string,
			id: number,
			n: number,
		): EMITargetListMessage => ({
			header: { stamp: stamp(2), frame_id: "map" },
			n_targets: 1,
			targets: [
				{
					id,
					gnss: fix(50.8, 4.39),
					centroid_latitude: 50.8,
					centroid_longitude: 4.39,
					best_amplitude: 1234,
					best_coil: 2,
					atr_threshold: 600,
					first_seen: stamp(1),
					last_seen: stamp(2),
					n_detections: n,
					coils: [2],
					spread: 0.1,
					source,
					gate_used: 0.45,
					sigma_at_creation: 0.2,
					degraded_fix: false,
				},
			],
		});

		b.onTargets(list("fixed+gate", 1, 2));
		b.onTargets(list("fixed+gate", 1, 3)); // the tracker revised it
		b.onTargets(list("fixed+chain", 1, 5)); // the other tracker, same id

		const run = b.finalize()!;
		expect(run.recorded.targets).toHaveLength(2);
		const gate = run.recorded.targets.find(
			(t) => t.source === "fixed+gate",
		)!;
		expect(gate.nDetections).toBe(3);
		expect(gate.firstSeen).toBeCloseTo(1, 6);
	});
});

describe("EmiRunBuilder — the pre-removal signal", () => {
	it("is absent unless /emi/raw is on the source", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));
		expect(b.finalize()!.hasPre).toBe(false);
	});

	it("is carried onto the sample that follows it", () => {
		const b = new EmiRunBuilder(init);
		b.onQuaternion(quat(0));
		const raw: EMIMessage = {
			header: { stamp: stamp(0), frame_id: "emi_frame" },
			rtk_pose: fix(0, 0),
			atr_threshold: 600,
			emi_array: [1, 2, 3, 4, 5].map((id) => ({
				id,
				static_transform: {
					translation: { x: 0, y: 0, z: 0 },
					rotation: { x: 0, y: 0, z: 0, w: 1 },
				},
				alert: false,
				raw1: 1000 + id,
				raw2: 2000 + id,
			})),
		};
		b.onEmiRaw(raw);
		b.onEmiGnss(gnssMessage(0, [1, 1, 1, 1, 1]));

		const run = b.finalize()!;
		expect(run.hasPre).toBe(true);
		expect(run.pre1[0]).toBe(1001);
		expect(run.pre1[4]).toBe(1005);
		expect(run.pre2[4]).toBe(2005);
	});
});
