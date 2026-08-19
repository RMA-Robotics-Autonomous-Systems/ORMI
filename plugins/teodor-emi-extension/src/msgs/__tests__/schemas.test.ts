/**
 * The hand-shipped message definitions, against real recorded bytes.
 *
 * The recordings are rosbag2 metadata version 5 and carry no
 * `message_definitions` table, so these schemas cannot be checked against the
 * bag — they can only be checked against what they decode. That makes this test
 * the only thing standing between a mistyped field and a page that renders
 * plausible nonsense.
 *
 * The strongest available check is the rake. The real array is an interleaved
 * two-row rake with a known shape — rear row x = -0.2 at y = +0.4/0/-0.4, front
 * row x = +0.2 at y = -0.2/+0.2 (`emi/config/params.yaml`) — and nothing but a
 * correct field layout produces those numbers from these bytes: get one field
 * width wrong anywhere upstream and every float after it is garbage.
 *
 * Those numbers turn out to live in `tf_static`, not in the EMI message, which
 * these tests pin in both directions — see the `static_transform` case below.
 *
 * Regenerate the fixture with:
 *
 *     python3 - <<'PY'
 *     import sqlite3, json, base64
 *     BAG = "rosbag_20250919-114316_convoy_friday_19092025_11_45"
 *     DB = f"<bags>/{BAG}/{BAG}_0.db3"
 *     con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
 *     SINGLE = {"/emi/raw", "/emi/offset_removed/filtered/atr", "/teodora/emi/gnss",
 *               "/teodora/xsens/gnss", "/teodora/xsens/filter/quaternion"}
 *     msgs, tf_static = {}, []
 *     for tid, name, typ in con.execute("SELECT id,name,type FROM topics"):
 *         if name in SINGLE:
 *             cnt = con.execute("SELECT COUNT(*) FROM messages WHERE topic_id=?",
 *                               (tid,)).fetchone()[0]
 *             if not cnt: continue
 *             r = con.execute("SELECT timestamp,data FROM messages WHERE topic_id=?"
 *                             " ORDER BY timestamp LIMIT 1 OFFSET ?",
 *                             (tid, min(20, cnt - 1))).fetchone()
 *             msgs[name] = {"rosType": typ, "timestamp": r[0],
 *                           "cdr": base64.b64encode(r[1]).decode()}
 *         if name == "/tf_static":   # latched, and split across messages
 *             for _, d in con.execute("SELECT timestamp,data FROM messages"
 *                                     " WHERE topic_id=? ORDER BY timestamp", (tid,)):
 *                 tf_static.append(base64.b64encode(d).decode())
 *     json.dump({"bag": BAG, "messages": msgs,
 *                "tfStatic": {"rosType": "tf2_msgs/msg/TFMessage", "cdr": tf_static}},
 *               open("fixtures/recorded-messages.json", "w"))
 *     PY
 */

import { describe, expect, test } from "bun:test";
import fixture from "./fixtures/recorded-messages.json";

import {
	activeVariant,
	clearReaderCache,
	decodeMessage,
	readerFor,
	readersFor,
} from "../readers";
import { SCHEMAS, canDecode } from "../schemas";
import { MessageWriter } from "@foxglove/rosmsg2-serialization";
import { parse } from "@foxglove/rosmsg";
import {
	fixSigma,
	stampSeconds,
	yawFromQuaternion,
	type EMIGnssMessage,
	type EMIMessage,
	type EMITargetListMessage,
	type NavSatFix,
	type QuaternionStamped,
} from "../emi-types";
import {
	collectEdges,
	fallbackGeometry,
	resolveCoilGeometry,
	resolveFrameTree,
	type TFMessage,
} from "../frames";
import { webappTypeFor, convertToWebapp } from "../ros-to-webapp";

const FIX = fixture as unknown as {
	bag: string;
	messages: Record<
		string,
		{ rosType: string; timestamp: number; cdr: string }
	>;
	tfStatic: { rosType: string; cdr: string[] };
};

/** Base64 to bytes. */
function bytesOf(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** The recorded bytes for a topic, as they sit in the bag. */
function payload(topic: string): Uint8Array {
	const entry = FIX.messages[topic];
	if (!entry) throw new Error(`fixture has no ${topic}`);
	return bytesOf(entry.cdr);
}

/** The ROS type the bag recorded for a topic. */
function rosTypeOf(topic: string): string {
	const entry = FIX.messages[topic];
	if (!entry) throw new Error(`fixture has no ${topic}`);
	return entry.rosType;
}

/** Decode a topic's recorded message. */
function decodeTopic<T>(topic: string): T {
	return decodeMessage<T>(rosTypeOf(topic), payload(topic))!;
}

/** Every latched `tf_static` message, decoded. */
function tfStaticMessages(): TFMessage[] {
	return FIX.tfStatic.cdr.map((c) =>
		decodeMessage<TFMessage>(FIX.tfStatic.rosType, bytesOf(c))!,
	);
}

describe("schema registry", () => {
	test("every shipped schema parses into a reader", () => {
		for (const rosType of Object.keys(SCHEMAS)) {
			expect(canDecode(rosType)).toBe(true);
			expect(readerFor(rosType)).not.toBeNull();
		}
	});

	test("an unknown type decodes to null rather than throwing", () => {
		expect(readerFor("nav_msgs/msg/Odometry")).toBeNull();
		expect(
			decodeMessage("nav_msgs/msg/Odometry", new Uint8Array(8)),
		).toBeNull();
	});

	test("readers are cached, not rebuilt per message", () => {
		expect(readerFor("emi_msgs/msg/EMI")).toBe(
			readerFor("emi_msgs/msg/EMI"),
		);
	});
});

describe("emi_msgs/msg/EMI against recorded bytes", () => {
	const msg = decodeTopic<EMIMessage>("/emi/raw");

	test("decodes to a five-coil array with the published ids", () => {
		expect(msg.emi_array).toHaveLength(5);
		expect(msg.emi_array.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
	});

	test("the header stamp is a plausible wall time", () => {
		const s = stampSeconds(msg.header.stamp);
		// Between 2020 and 2035 — a field-order error lands in 1970 or in the
		// far future.
		expect(s).toBeGreaterThan(1_577_836_800);
		expect(s).toBeLessThan(2_051_222_400);
		expect(msg.header.frame_id).toBe("emi_frame");
	});

	test("the threshold is the value that recording ran at", () => {
		expect(msg.atr_threshold).toBe(600);
	});

	test("raw counts are integers and alert is a real boolean", () => {
		for (const coil of msg.emi_array) {
			expect(Number.isInteger(coil.raw1)).toBe(true);
			expect(Number.isInteger(coil.raw2)).toBe(true);
			expect(typeof coil.alert).toBe("boolean");
		}
	});

	test("static_transform is a PLACEHOLDER, not the rake — do not read geometry from it", () => {
		// This is the trap. The field exists, decodes cleanly, and contains the
		// unit basis vectors rather than any part of a rake:
		//   coil1 (1,0,0)  coil2 (0,1,0)  coil3 (-1,0,0)  coil4 (0,-1,0)  coil5 (0,0,1)
		// Anything that took the geometry from here would place every detection
		// a metre from where it belongs, silently. params.yaml says as much:
		// "TF IS AUTHORITATIVE ... it does not read this file."
		const placeholder: Array<[number, number, number]> = [
			[1, 0, 0],
			[0, 1, 0],
			[-1, 0, 0],
			[0, -1, 0],
			[0, 0, 1],
		];
		msg.emi_array.forEach((coil, i) => {
			const t = coil.static_transform.translation;
			expect([t.x, t.y, t.z]).toEqual(placeholder[i]!);
		});
	});

	test("rtk_pose is zero-filled — the fix comes from /teodora/xsens/gnss", () => {
		// Same trap, same reason: the field is present and empty on every
		// recorded EMI topic.
		expect(msg.rtk_pose.latitude).toBe(0);
		expect(msg.rtk_pose.longitude).toBe(0);
		expect(msg.rtk_pose.header.frame_id).toBe("");
	});

	test("the downstream ATR topic carries the same shape", () => {
		const atr = decodeTopic<EMIMessage>("/emi/offset_removed/filtered/atr");
		expect(atr.emi_array).toHaveLength(5);
		expect(atr.atr_threshold).toBe(600);
	});
});

describe("coil geometry from tf_static", () => {
	const geometry = resolveCoilGeometry(tfStaticMessages());

	test("comes from the tree rather than the fallback", () => {
		expect(geometry.fromTf).toBe(true);
		expect(Array.from(geometry.coilIds)).toEqual([1, 2, 3, 4, 5]);
	});

	test("is the real rake, composed through base_link -> emi_link", () => {
		// emi_link sits at (0.8, 0, -0.3) on base_link, and the coils hang off
		// it at x = -0.2 / +0.2. In body frame that is:
		const expected: Array<[number, number]> = [
			[0.6, 0.4],
			[0.6, 0.0],
			[0.6, -0.4],
			[1.0, -0.2],
			[1.0, 0.2],
		];
		expected.forEach(([x, y], i) => {
			expect(geometry.offsets[i * 3]!).toBeCloseTo(x, 5);
			expect(geometry.offsets[i * 3 + 1]!).toBeCloseTo(y, 5);
		});
	});

	test("the lever arm is base_link -> xsens_link", () => {
		expect(geometry.leverArm[0]).toBeCloseTo(0.165, 6);
		expect(geometry.leverArm[1]).toBeCloseTo(0.15, 6);
	});

	test("the drawable tree carries the whole robot, not just the rake", () => {
		// What the map's ghosts are stroked from. Five coil offsets draw a shape;
		// the chassis, the antenna and the sensor mounts are what make that shape
		// read as a vehicle with a front and a back, which is the entire point of
		// drawing it over the detections it placed.
		const tree = resolveFrameTree(collectEdges(tfStaticMessages()))!;
		expect(tree).not.toBeNull();
		expect(tree.nodes["base_link"]).toEqual([0, 0]);
		// Composed through base_link -> emi_link, exactly as the rake is.
		expect(tree.nodes["coil1_link"]![0]).toBeCloseTo(0.6, 5);
		expect(tree.nodes["coil1_link"]![1]).toBeCloseTo(0.4, 5);
		expect(tree.nodes["xsens_link"]![0]).toBeCloseTo(0.165, 5);
		// Every edge names two frames the tree actually placed, or it would be
		// drawn from the origin — a limb the robot does not have.
		for (const [parent, child] of tree.edges) {
			expect(tree.nodes[parent]).toBeDefined();
			expect(tree.nodes[child]).toBeDefined();
		}
		expect(tree.edges.length).toBeGreaterThanOrEqual(8);
	});

	test("a frame that does not descend from the root is left out entirely", () => {
		const edges = collectEdges([
			{
				transforms: [
					{
						header: { frame_id: "base_link" },
						child_frame_id: "emi_link",
						transform: {
							translation: { x: 0.8, y: 0, z: -0.3 },
							rotation: { x: 0, y: 0, z: 0, w: 1 },
						},
					},
					{
						header: { frame_id: "odom" },
						child_frame_id: "floating_link",
						transform: {
							translation: { x: 5, y: 5, z: 0 },
							rotation: { x: 0, y: 0, z: 0, w: 1 },
						},
					},
				],
			},
		]);
		const tree = resolveFrameTree(edges)!;
		expect(tree.nodes["emi_link"]).toBeDefined();
		expect(tree.nodes["floating_link"]).toBeUndefined();
		expect(tree.edges).toEqual([["base_link", "emi_link"]]);
	});

	test("no tree at all is null rather than an empty drawing", () => {
		expect(resolveFrameTree(collectEdges([{ transforms: [] }]))).toBeNull();
	});

	test("a tree with no coil frames falls back, and says so", () => {
		const empty = resolveCoilGeometry([{ transforms: [] }]);
		expect(empty.fromTf).toBe(false);
		expect(empty.resolvedFromTf).toBe(0);
		expect(Array.from(empty.coilIds)).toEqual([1, 2, 3, 4, 5]);
	});

	test("a PARTIAL tree falls back rather than yielding a short rake", () => {
		// ncoil strides every per-coil column of a run, so a four-coil geometry
		// filled from five-coil messages misaligns the entire run — and would do
		// so while claiming the geometry was authoritative.
		const partial = tfStaticMessages().map((m) => ({
			transforms: m.transforms.filter(
				(t) => t.child_frame_id !== "coil3_link",
			),
		}));
		const geo = resolveCoilGeometry(partial);
		expect(geo.fromTf).toBe(false);
		expect(geo.resolvedFromTf).toBe(4);
		expect(geo.coilIds).toHaveLength(5);
	});

	test("the fallback hands out fresh arrays, never a shared constant", () => {
		// A run stores coilIds and offsets by reference; a shared constant would
		// let one run's geometry be mutated through another's.
		const a = fallbackGeometry();
		const b = fallbackGeometry();
		expect(a.offsets).not.toBe(b.offsets);
		expect(a.coilIds).not.toBe(b.coilIds);
		a.offsets[0] = 999;
		expect(b.offsets[0]).not.toBe(999);
	});

	test("the fallback agrees with what tf_static actually publishes", () => {
		// If these ever diverge, a run built without tf_static is quietly wrong.
		for (let i = 0; i < 5; i++) {
			expect(fallbackGeometry().offsets[i * 3]!).toBeCloseTo(
				geometry.offsets[i * 3]!,
				5,
			);
			expect(fallbackGeometry().offsets[i * 3 + 1]!).toBeCloseTo(
				geometry.offsets[i * 3 + 1]!,
				5,
			);
		}
		expect(fallbackGeometry().leverArm[0]).toBeCloseTo(
			geometry.leverArm[0],
			6,
		);
		expect(fallbackGeometry().leverArm[1]).toBeCloseTo(
			geometry.leverArm[1],
			6,
		);
	});

	test("a cyclic tree terminates instead of hanging", () => {
		const cyc = resolveCoilGeometry([
			{
				transforms: [
					{
						header: { frame_id: "b" },
						child_frame_id: "coil1_link",
						transform: {
							translation: { x: 1, y: 0, z: 0 },
							rotation: { x: 0, y: 0, z: 0, w: 1 },
						},
					},
					{
						header: { frame_id: "coil1_link" },
						child_frame_id: "b",
						transform: {
							translation: { x: 0, y: 1, z: 0 },
							rotation: { x: 0, y: 0, z: 0, w: 1 },
						},
					},
				],
			},
		]);
		// The chain never reaches base_link, so no coil resolves and it falls back.
		expect(cyc.fromTf).toBe(false);
	});
});

describe("emi_msgs/msg/EMIGnss against recorded bytes", () => {
	const msg = decodeTopic<EMIGnssMessage>("/teodora/emi/gnss");

	test("every coil carries its own absolute fix", () => {
		expect(msg.emi_array).toHaveLength(5);
		for (const coil of msg.emi_array) {
			expect(Math.abs(coil.gnss.latitude)).toBeLessThanOrEqual(90);
			expect(Math.abs(coil.gnss.longitude)).toBeLessThanOrEqual(180);
			// Not the null island: a mis-decode lands on 0,0.
			expect(Math.abs(coil.gnss.latitude)).toBeGreaterThan(0.001);
		}
	});

	test("the five coil fixes sit within a rake's width of each other", () => {
		// The 0.8 m swath is ~1e-5 degrees; anything larger means these are not
		// five coils of one array.
		const lats = msg.emi_array.map((c) => c.gnss.latitude);
		const lons = msg.emi_array.map((c) => c.gnss.longitude);
		expect(Math.max(...lats) - Math.min(...lats)).toBeLessThan(1e-4);
		expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(1e-4);
	});

	test("each coil frame names itself", () => {
		msg.emi_array.forEach((coil, i) => {
			expect(coil.gnss.header.frame_id).toBe(`coil${i + 1}_link`);
		});
	});

	test("the covariance yields a plausible horizontal sigma", () => {
		const sigma = fixSigma(msg.emi_array[0]!.gnss);
		expect(Number.isFinite(sigma)).toBe(true);
		// The recordings measure 0.5–2 m; allow a wide band, reject nonsense.
		expect(sigma).toBeGreaterThan(0);
		expect(sigma).toBeLessThan(100);
	});

	test("this is the topic that is actually georeferenced", () => {
		// Stated as a test because it is the design's load-bearing fact: the
		// robot has already placed every coil, so nothing here has to.
		const gnss = decodeTopic<EMIGnssMessage>("/teodora/emi/gnss");
		const raw = decodeTopic<EMIMessage>("/emi/raw");
		expect(gnss.emi_array[0]!.gnss.latitude).not.toBe(0);
		expect(raw.rtk_pose.latitude).toBe(0);
	});
});

describe("ancillary types against recorded bytes", () => {
	test("NavSatFix decodes to the robot's own fix", () => {
		const fix = decodeTopic<NavSatFix>("/teodora/xsens/gnss");
		expect(Math.abs(fix.latitude)).toBeGreaterThan(0.001);
		expect(Number.isFinite(fixSigma(fix))).toBe(true);
	});

	test("QuaternionStamped decodes to a unit quaternion", () => {
		const q = decodeTopic<QuaternionStamped>(
			"/teodora/xsens/filter/quaternion",
		);
		const { x, y, z, w } = q.quaternion;
		expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 5);
	});

	test("yaw from that quaternion is in range", () => {
		const q = decodeTopic<QuaternionStamped>(
			"/teodora/xsens/filter/quaternion",
		);
		const yaw = yawFromQuaternion(q.quaternion);
		expect(yaw).toBeGreaterThanOrEqual(-Math.PI);
		expect(yaw).toBeLessThanOrEqual(Math.PI);
	});

	test("yaw discards roll and pitch, as the live node does", () => {
		// A pure roll must read as zero yaw, or the rake is drawn turned when
		// the robot merely leaned.
		const halfRoll = Math.PI / 6;
		expect(
			yawFromQuaternion({
				x: Math.sin(halfRoll),
				y: 0,
				z: 0,
				w: Math.cos(halfRoll),
			}),
		).toBeCloseTo(0, 9);
		// A pure yaw reads as itself.
		const halfYaw = Math.PI / 8;
		expect(
			yawFromQuaternion({
				x: 0,
				y: 0,
				z: Math.sin(halfYaw),
				w: Math.cos(halfYaw),
			}),
		).toBeCloseTo(Math.PI / 4, 9);
	});

	test("TFMessage decodes to named, stamped transforms", () => {
		const msgs = tfStaticMessages();
		expect(msgs.length).toBeGreaterThan(1);
		for (const m of msgs) {
			for (const t of m.transforms) {
				expect(t.child_frame_id.length).toBeGreaterThan(0);
				expect(Number.isFinite(t.transform.translation.x)).toBe(true);
			}
		}
	});
});

describe("payload-shape parity with the live datasource", () => {
	test("EMI types pass through untouched, as foxglove leaves them", () => {
		// emi_msgs has no converter, so the live path publishes the raw parsed
		// message. The replay must do the same or the map marker that works
		// online breaks offline.
		expect(webappTypeFor("emi_msgs/msg/EMI")).toBe("emi_msgs/msg/EMI");
		const raw = { emi_array: [{ id: 1 }] };
		expect(convertToWebapp("emi_msgs/msg/EMI", raw, 0)).toBe(raw);
	});

	test("NavSatFix is converted to the webapp geolocation shape", () => {
		expect(webappTypeFor("sensor_msgs/msg/NavSatFix")).toBe(
			"GeolocationPosition",
		);
		const out = convertToWebapp(
			"sensor_msgs/msg/NavSatFix",
			{
				latitude: 50.1,
				longitude: 4.2,
				altitude: 115,
				position_covariance: [1.5, 0, 0, 0, 1.5, 0, 0, 0, 2],
			},
			1234,
		) as {
			coords: { latitude: number; accuracy: number };
			timestamp: number;
		};
		expect(out.coords.latitude).toBe(50.1);
		expect(out.coords.accuracy).toBe(1.5);
		expect(out.timestamp).toBe(1234);
	});

	test("the derived fields come from the same covariance cells foxglove uses", () => {
		// UnifiedConverter reads altitudeAccuracy/heading/speed from cells
		// 2/4/8. They are not what those cells mean in sensor_msgs/NavSatFix,
		// but they are what every widget on the live path already receives —
		// so a replay that picked different cells would be the divergence this
		// module exists to prevent.
		const out = convertToWebapp(
			"sensor_msgs/msg/NavSatFix",
			{
				latitude: 1,
				longitude: 2,
				altitude: 3,
				position_covariance: [10, 11, 12, 13, 14, 15, 16, 17, 18],
			},
			0,
		) as {
			coords: {
				altitudeAccuracy: number;
				heading: number;
				speed: number;
			};
		};
		expect(out.coords.altitudeAccuracy).toBe(12);
		expect(out.coords.heading).toBe(14);
		expect(out.coords.speed).toBe(18);
	});

	test("a typed-array covariance yields zeros, exactly as the live path does", () => {
		// The CDR reader returns Float64Array for float64[9], and the upstream
		// converter guards with Array.isArray — so the live path really does
		// publish zeros here. Mirrored deliberately; if upstream is fixed, fix
		// this in the same change.
		const out = convertToWebapp(
			"sensor_msgs/msg/NavSatFix",
			{
				latitude: 1,
				longitude: 2,
				altitude: 3,
				position_covariance: new Float64Array([
					9, 0, 0, 0, 0, 0, 0, 0, 0,
				]),
			},
			0,
		) as { coords: { accuracy: number } };
		expect(out.coords.accuracy).toBe(0);
	});

	test("the timestamp comes from the header when there is one", () => {
		const out = convertToWebapp(
			"sensor_msgs/msg/NavSatFix",
			{
				header: { stamp: { sec: 2, nanosec: 500_000_000 } },
				latitude: 1,
				longitude: 2,
				altitude: 3,
				position_covariance: [],
			},
			999,
		) as { timestamp: number };
		expect(out.timestamp).toBe(2500);
	});

	test("QuaternionStamped is left raw, because the live path leaves it raw", () => {
		// The registry has no QuaternionStamped conversion and no "Quaternion"
		// webapp type, so converting here would create a divergence in the
		// opposite direction.
		expect(webappTypeFor("geometry_msgs/msg/QuaternionStamped")).toBe(
			"geometry_msgs/msg/QuaternionStamped",
		);
		const raw = { header: {}, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
		expect(
			convertToWebapp("geometry_msgs/msg/QuaternionStamped", raw, 0),
		).toBe(raw);
	});
});

describe("two live message layouts", () => {
	// EMICoilGnss gained `float64 yaw` and EMITarget gained `string source` in
	// the robot's working tree. Both are additive on the robot — existing
	// subscribers ignore them — but neither is additive to a CDR reader: they
	// sit inside sequence elements, so the extra bytes shift every element after
	// the first. A recording and a live robot therefore speak different wire
	// layouts and both have to decode.

	test("the types that drifted ship two layouts; the rest ship one", () => {
		expect(SCHEMAS["emi_msgs/msg/EMIGnss"]).toHaveLength(2);
		expect(SCHEMAS["emi_msgs/msg/EMITargetList"]).toHaveLength(2);
		expect(SCHEMAS["emi_msgs/msg/EMITarget"]).toHaveLength(2);
		expect(SCHEMAS["emi_msgs/msg/EMI"]).toHaveLength(1);
		// Newest first, so a live robot decodes on the first attempt.
		expect(SCHEMAS["emi_msgs/msg/EMIGnss"]![0]!.label).toBe("with-yaw");
	});

	test("the two EMIGnss layouts are genuinely incompatible", () => {
		// If they were not, none of this machinery would be needed — so pin it.
		const legacyBytes = payload("/teodora/emi/gnss");
		const [withYaw] = readersFor("emi_msgs/msg/EMIGnss");
		expect(() => withYaw!.reader.readMessage(legacyBytes)).toThrow();
	});

	test("a recorded (pre-yaw) EMIGnss selects the legacy layout", () => {
		clearReaderCache();
		const msg = decodeTopic<EMIGnssMessage>("/teodora/emi/gnss");
		expect(msg.emi_array).toHaveLength(5);
		expect(activeVariant("emi_msgs/msg/EMIGnss")).toBe("legacy");
		expect(msg.emi_array[0]!.yaw).toBeUndefined();
	});

	test("a current-build EMIGnss selects the with-yaw layout and carries the heading", () => {
		clearReaderCache();
		const schema = SCHEMAS["emi_msgs/msg/EMIGnss"]![0]!.text;
		const writer = new MessageWriter(parse(schema, { ros2: true }));
		const coil = (id: number, yaw: number) => ({
			id,
			gnss: {
				header: {
					stamp: { sec: 1, nanosec: 2 },
					frame_id: `coil${id}_link`,
				},
				status: { status: 0, service: 0 },
				latitude: 59.07 + id * 1e-6,
				longitude: 17.81,
				altitude: 100,
				position_covariance: new Float64Array(9).fill(0.31),
				position_covariance_type: 2,
			},
			alert: id === 3,
			raw1: id * 10,
			raw2: id * -10,
			yaw,
		});
		const bytes = writer.writeMessage({
			header: {
				stamp: { sec: 1, nanosec: 2 },
				frame_id: "emi_gnss_frame",
			},
			atr_threshold: 5000,
			emi_array: [1, 2, 3, 4, 5].map((id) => coil(id, 1.25)),
		});
		const msg = decodeMessage<EMIGnssMessage>(
			"emi_msgs/msg/EMIGnss",
			bytes,
		)!;
		expect(activeVariant("emi_msgs/msg/EMIGnss")).toBe("with-yaw");
		expect(msg.emi_array).toHaveLength(5);
		expect(msg.emi_array[2]!.alert).toBe(true);
		expect(msg.emi_array[0]!.yaw).toBeCloseTo(1.25, 9);
	});

	test("the layout can change mid-session without a restart", () => {
		// A page can review a recording and then connect to a live robot on the
		// same topic. Five coils is the real case: under the wrong layout the
		// second sequence element onward mis-parses and the id/frame_id
		// agreement breaks, which is what the structural check detects.
		clearReaderCache();
		decodeTopic<EMIGnssMessage>("/teodora/emi/gnss");
		expect(activeVariant("emi_msgs/msg/EMIGnss")).toBe("legacy");

		const schema = SCHEMAS["emi_msgs/msg/EMIGnss"]![0]!.text;
		const writer = new MessageWriter(parse(schema, { ros2: true }));
		const bytes = writer.writeMessage({
			header: {
				stamp: { sec: 1, nanosec: 2 },
				frame_id: "emi_gnss_frame",
			},
			atr_threshold: 5000,
			emi_array: [1, 2, 3, 4, 5].map((id) => ({
				id,
				gnss: {
					header: {
						stamp: { sec: 1, nanosec: 2 },
						frame_id: `coil${id}_link`,
					},
					status: { status: 0, service: 0 },
					latitude: 59.07,
					longitude: 17.81,
					altitude: 100,
					position_covariance: new Float64Array(9).fill(0.3),
					position_covariance_type: 2,
				},
				alert: false,
				raw1: id,
				raw2: -id,
				yaw: 0.75,
			})),
		});
		const msg = decodeMessage<EMIGnssMessage>(
			"emi_msgs/msg/EMIGnss",
			bytes,
		)!;
		expect(activeVariant("emi_msgs/msg/EMIGnss")).toBe("with-yaw");
		expect(msg.emi_array[4]!.yaw).toBeCloseTo(0.75, 9);
	});

	test("a SINGLE-coil payload is inherently ambiguous, and does not flip the choice", () => {
		// With one sequence element the shorter layout parses the element
		// correctly and simply ignores the trailing yaw, so both layouts produce
		// a self-consistent message. Nothing can distinguish them, and nothing
		// should pretend to.
		clearReaderCache();
		decodeTopic<EMIGnssMessage>("/teodora/emi/gnss");
		expect(activeVariant("emi_msgs/msg/EMIGnss")).toBe("legacy");

		const schema = SCHEMAS["emi_msgs/msg/EMIGnss"]![0]!.text;
		const writer = new MessageWriter(parse(schema, { ros2: true }));
		const bytes = writer.writeMessage({
			header: {
				stamp: { sec: 1, nanosec: 2 },
				frame_id: "emi_gnss_frame",
			},
			atr_threshold: 5000,
			emi_array: [
				{
					id: 1,
					gnss: {
						header: {
							stamp: { sec: 1, nanosec: 2 },
							frame_id: "coil1_link",
						},
						status: { status: 0, service: 0 },
						latitude: 59.07,
						longitude: 17.81,
						altitude: 100,
						position_covariance: new Float64Array(9).fill(0.3),
						position_covariance_type: 2,
					},
					alert: false,
					raw1: 1,
					raw2: 2,
					yaw: 0.75,
				},
			],
		});
		const msg = decodeMessage<EMIGnssMessage>(
			"emi_msgs/msg/EMIGnss",
			bytes,
		)!;
		// The coil itself still reads correctly under either layout.
		expect(msg.emi_array[0]!.id).toBe(1);
		expect(activeVariant("emi_msgs/msg/EMIGnss")).toBe("legacy");
	});

	test("an EMPTY coil array is genuinely ambiguous between the layouts", () => {
		// The layouts differ only inside sequence elements, so a message with no
		// elements decodes identically under both and the selection sticks with
		// whatever was already in force. Harmless — there is nothing to read —
		// but worth pinning so it is not mistaken for a selection bug.
		clearReaderCache();
		decodeTopic<EMIGnssMessage>("/teodora/emi/gnss");
		expect(activeVariant("emi_msgs/msg/EMIGnss")).toBe("legacy");

		const schema = SCHEMAS["emi_msgs/msg/EMIGnss"]![0]!.text;
		const writer = new MessageWriter(parse(schema, { ros2: true }));
		const empty = writer.writeMessage({
			header: {
				stamp: { sec: 1, nanosec: 2 },
				frame_id: "emi_gnss_frame",
			},
			atr_threshold: 5000,
			emi_array: [],
		});
		const msg = decodeMessage<EMIGnssMessage>(
			"emi_msgs/msg/EMIGnss",
			empty,
		)!;
		expect(msg.emi_array).toHaveLength(0);
		// It carries no evidence, so it must not be able to unset a layout that
		// earlier messages established.
		expect(activeVariant("emi_msgs/msg/EMIGnss")).toBe("legacy");
	});

	test("EMITargetList round-trips on both layouts", () => {
		// No recording carries a target topic — the trackers are newer than the
		// bags — so this is the only check these schemas get.
		const target = (withSource: boolean) => ({
			id: 7,
			gnss: {
				header: { stamp: { sec: 3, nanosec: 4 }, frame_id: "map" },
				status: { status: 0, service: 0 },
				latitude: 59.075,
				longitude: 17.82,
				altitude: 100,
				position_covariance: new Float64Array(9).fill(0.25),
				position_covariance_type: 2,
			},
			centroid_latitude: 59.0751,
			centroid_longitude: 17.8201,
			best_amplitude: 4321,
			best_coil: 4,
			atr_threshold: 5000,
			first_seen: { sec: 3, nanosec: 0 },
			last_seen: { sec: 9, nanosec: 0 },
			n_detections: 3,
			coils: new Uint8Array([1, 4, 5]),
			spread: 0.63,
			...(withSource ? { source: "fixed+chain" } : {}),
			gate_used: 0,
			sigma_at_creation: 0.5,
			degraded_fix: true,
		});

		for (const [idx, withSource] of [
			[0, true],
			[1, false],
		] as const) {
			clearReaderCache();
			const schema = SCHEMAS["emi_msgs/msg/EMITargetList"]![idx]!.text;
			const writer = new MessageWriter(parse(schema, { ros2: true }));
			const bytes = writer.writeMessage({
				header: {
					stamp: { sec: 3, nanosec: 4 },
					frame_id: "emi_target_list",
				},
				n_targets: 1,
				targets: [target(withSource)],
			});
			const msg = decodeMessage<EMITargetListMessage>(
				"emi_msgs/msg/EMITargetList",
				bytes,
			)!;
			expect(msg).not.toBeNull();
			expect(msg.targets).toHaveLength(1);
			expect(msg.targets[0]!.id).toBe(7);
			expect(msg.targets[0]!.best_amplitude).toBe(4321);
			expect(msg.targets[0]!.degraded_fix).toBe(true);
			expect(Array.from(msg.targets[0]!.coils)).toEqual([1, 4, 5]);
			if (withSource) expect(msg.targets[0]!.source).toBe("fixed+chain");
		}
	});

	test("decodeMessage is total — a garbled payload returns null, never throws", () => {
		// A replay loop must skip one bad message, not die on it, and a schema
		// mismatch is exactly how a bad message arrives.
		clearReaderCache();
		expect(
			decodeMessage("emi_msgs/msg/EMIGnss", new Uint8Array([1, 2, 3, 4])),
		).toBeNull();
		expect(decodeMessage("emi_msgs/msg/EMI", new Uint8Array(0))).toBeNull();
	});

	test("readerFor still answers before anything has been decoded", () => {
		clearReaderCache();
		expect(readerFor("emi_msgs/msg/EMIGnss")).not.toBeNull();
	});
});
