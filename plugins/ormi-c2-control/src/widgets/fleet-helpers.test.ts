import { describe, expect, it } from "bun:test";

import { C2Vehicle } from "../types/c2-types";
import {
	autonomyStatusLabel,
	buildNamespacedTopic,
	collectTelemetry,
	extractAgentPosition,
	extractAgentTelemetry,
	extractOdometryLngLat,
	FEEDBACK_STALE_MS,
	mergeFleet,
	formatBattery,
	parseAgentProfileTelemetry,
	parseAutonomyStatus,
	parseVehicleHealth,
	presenceLabel,
	readNamespace,
	resolveAgentPresence,
	stampArrivals,
} from "./fleet-helpers";

describe("readNamespace (namespace probe order)", () => {
	it("prefers a top-level namespace", () => {
		expect(
			readNamespace({
				namespace: "Themis_Fr",
				agent_profile: { namespace: "Other" },
				name: "Also",
			}),
		).toBe("Themis_Fr");
	});

	it("falls back to agent_profile.namespace", () => {
		expect(
			readNamespace({ agent_profile: { namespace: "Atlas_Be" } }),
		).toBe("Atlas_Be");
	});

	it("falls back to name when no namespace is present", () => {
		expect(readNamespace({ name: "Rover_1" })).toBe("Rover_1");
	});

	it("trims and rejects blank/whitespace-only candidates", () => {
		expect(readNamespace({ namespace: "  Spaced  " })).toBe("Spaced");
		expect(readNamespace({ namespace: "   ", name: "Fallback" })).toBe(
			"Fallback",
		);
	});

	it("returns undefined when nothing usable is present", () => {
		expect(readNamespace({})).toBeUndefined();
		expect(readNamespace({ namespace: "", name: "" })).toBeUndefined();
		expect(readNamespace({ namespace: 42 } as never)).toBeUndefined();
	});
});

describe("extractAgentPosition (defensive, two Feedback.msg variants)", () => {
	it("reads the nav_msgs/Odometry variant", () => {
		const raw = { pose: { pose: { position: { x: 1, y: 2, z: 3 } } } };
		expect(extractAgentPosition(raw)).toEqual({ x: 1, y: 2, z: 3 });
	});

	it("reads a nested odometry.pose.pose.position", () => {
		const raw = {
			odometry: { pose: { pose: { position: { x: 4, y: 5 } } } },
		};
		expect(extractAgentPosition(raw)).toEqual({ x: 4, y: 5 });
	});

	it("reads the Localization variant (lat/lon)", () => {
		const raw = { localization: { latitude: 50.1, longitude: 4.2 } };
		expect(extractAgentPosition(raw)).toEqual({ x: 50.1, y: 4.2 });
	});

	it("returns undefined on missing/garbage shapes (no throw)", () => {
		expect(extractAgentPosition(null)).toBeUndefined();
		expect(extractAgentPosition({})).toBeUndefined();
		expect(extractAgentPosition({ pose: {} })).toBeUndefined();
		expect(extractAgentPosition(42)).toBeUndefined();
	});
});

describe("extractAgentTelemetry (defensive)", () => {
	it("normalizes a single agent feedback object", () => {
		const raw = {
			agent_id: "a1",
			state: "ACTIVE",
			pose: { pose: { position: { x: 1, y: 1 } } },
		};
		expect(extractAgentTelemetry(raw)).toEqual([
			{ agent_id: "a1", state: "ACTIVE", position: { x: 1, y: 1 } },
		]);
	});

	it("normalizes a wrapper carrying an agents[] array", () => {
		const raw = {
			agents: [
				{ agent_id: "a1", state: 0 },
				{ agent_id: "a2", state: 1 },
			],
		};
		const out = extractAgentTelemetry(raw);
		expect(out.map((t) => t.agent_id)).toEqual(["a1", "a2"]);
	});

	it("drops entries without an agent id and never throws", () => {
		expect(extractAgentTelemetry({ agents: [{ state: 1 }, null] })).toEqual(
			[],
		);
		expect(extractAgentTelemetry(undefined)).toEqual([]);
	});
});

describe("collectTelemetry (per-agent, interleaved single-agent messages)", () => {
	// One Feedback message per agent, interleaved on the shared topic — the
	// real /multi_robot/edge/feedback shape (each agent has its own publisher).
	const buffer: unknown[] = [
		{ agent_id: "a1", state: 0 },
		{ agent_id: "a2", state: 0 },
		{ agent_id: "a3", state: 0 },
		{ agent_id: "a1", state: 1 }, // a1 updates later in the window
	];

	it("surfaces the latest message for every agent simultaneously", () => {
		const out = collectTelemetry([buffer]);
		expect(out.map((t) => t.agent_id).sort()).toEqual(["a1", "a2", "a3"]);
		expect(out.find((t) => t.agent_id === "a1")?.state).toBe(1); // last wins
	});

	it("dedupes across multiple per-source buffers", () => {
		const out = collectTelemetry([
			[{ agent_id: "a1", state: 0 }],
			[{ agent_id: "a2", state: 0 }],
		]);
		expect(out.map((t) => t.agent_id).sort()).toEqual(["a1", "a2"]);
	});

	it("ignores empty buffers and null entries (no throw)", () => {
		expect(collectTelemetry([[null, undefined], []])).toEqual([]);
	});
});

describe("agent presence (reporting now, not ever seen)", () => {
	const a1 = { agent_id: "a1", state: 0 };
	const a2 = { agent_id: "a2", state: 0 };

	it("stamps a first sighting and keeps the stamp while the message is unchanged", () => {
		const first = stampArrivals(new Map(), [a1, a2], 1_000);
		expect(first.get("a1")?.at).toBe(1_000);
		// Same objects, later tick: nothing arrived, so nothing is restamped.
		const second = stampArrivals(first, [a1, a2], 9_000);
		expect(second.get("a1")?.at).toBe(1_000);
		expect(second.get("a2")?.at).toBe(1_000);
	});

	it("restamps only the agent whose newest message is a new object", () => {
		const first = stampArrivals(new Map(), [a1, a2], 1_000);
		// Identical content, new object: that is a new message from a1.
		const second = stampArrivals(first, [a1, a2, { ...a1 }], 4_000);
		expect(second.get("a1")?.at).toBe(4_000);
		expect(second.get("a2")?.at).toBe(1_000);
	});

	it("drops an agent that has left the buffer and tolerates junk", () => {
		const first = stampArrivals(new Map(), [a1, a2], 1_000);
		const second = stampArrivals(first, [null, "x", a2], 2_000);
		expect([...second.keys()]).toEqual(["a2"]);
	});

	it("is live only for recent feedback on an online datasource", () => {
		const now = 100_000;
		const recent = now - (FEEDBACK_STALE_MS - 1);
		const old = now - FEEDBACK_STALE_MS;
		expect(resolveAgentPresence(recent, now, "online")).toBe("live");
		expect(resolveAgentPresence(old, now, "online")).toBe("stale");
		expect(resolveAgentPresence(recent, now, "connecting")).toBe("stale");
		expect(resolveAgentPresence(recent, now, "offline")).toBe("none");
		expect(resolveAgentPresence(undefined, now, "online")).toBe("none");
	});

	it("words the dot, with the age when the agent went quiet", () => {
		expect(presenceLabel("live", 200)).toBe("live telemetry");
		expect(presenceLabel("none")).toBe("no live telemetry");
		expect(presenceLabel("stale", 12_400)).toBe("last feedback 12 s ago");
		expect(presenceLabel("stale", 185_000)).toBe("last feedback 3 min ago");
	});
});

describe("extractOdometryLngLat (frame_id-gated geographic position)", () => {
	const odom = { pose: { pose: { position: { x: 4.2, y: 50.1, z: 12 } } } };

	it("maps a map-frame Odometry to { lng: x, lat: y }", () => {
		expect(extractOdometryLngLat(odom, "map")).toEqual({
			lng: 4.2,
			lat: 50.1,
		});
	});

	it("returns null for a non-map frame (local/metric)", () => {
		expect(extractOdometryLngLat(odom, "odom")).toBeNull();
		expect(extractOdometryLngLat(odom, "base_link")).toBeNull();
		expect(extractOdometryLngLat(odom, undefined)).toBeNull();
		expect(extractOdometryLngLat(odom, "")).toBeNull();
	});

	it("returns null when the position can't be read (no throw)", () => {
		expect(extractOdometryLngLat({}, "map")).toBeNull();
		expect(extractOdometryLngLat(null, "map")).toBeNull();
		expect(extractOdometryLngLat({ pose: {} }, "map")).toBeNull();
	});
});

describe("parseAutonomyStatus (defensive)", () => {
	it("parses a full message with primitives", () => {
		const raw = {
			status: 1,
			primitive_statuses: [{ progress: 0.5 }, { progress: 0.9 }],
		};
		expect(parseAutonomyStatus(raw)).toEqual({
			status: 1,
			primitives: [{ progress: 0.5 }, { progress: 0.9 }],
		});
	});

	it("tolerates a partial message (no primitives)", () => {
		expect(parseAutonomyStatus({ status: 2 })).toEqual({
			status: 2,
			primitives: [],
		});
	});

	it("drops non-numeric progress entries and defaults a missing status", () => {
		const raw = {
			primitive_statuses: [
				{ progress: 30 },
				{ progress: "nope" },
				{},
				null,
			],
		};
		expect(parseAutonomyStatus(raw)).toEqual({
			status: 0,
			primitives: [{ progress: 30 }],
		});
	});

	it("returns null on garbage / non-object input (no throw)", () => {
		expect(parseAutonomyStatus(null)).toBeNull();
		expect(parseAutonomyStatus(42)).toBeNull();
		expect(parseAutonomyStatus("x")).toBeNull();
	});

	it("labels known and unknown status codes", () => {
		expect(autonomyStatusLabel(0)).toBe("PENDING");
		expect(autonomyStatusLabel(1)).toBe("ACTIVE");
		expect(autonomyStatusLabel(4)).toBe("ABORTED");
		expect(autonomyStatusLabel(9)).toBe("Status 9");
	});
});

describe("parseAgentProfileTelemetry (vehicle_info.*)", () => {
	it("reads battery, fuel, and sensor statuses", () => {
		const parsed = {
			vehicle_info: {
				battery_status_pct: 87,
				fuel_status_pct: 42,
				sensor_list: [{ status: 1 }, { status: 0 }],
			},
		};
		expect(parseAgentProfileTelemetry(parsed)).toEqual({
			batteryPct: 87,
			fuelPct: 42,
			sensors: [{ status: 1 }, { status: 0 }],
		});
	});

	it("omits missing percentages and skips garbage sensor entries", () => {
		const parsed = {
			vehicle_info: {
				sensor_list: [{ status: 2 }, {}, null, { status: "x" }],
			},
		};
		expect(parseAgentProfileTelemetry(parsed)).toEqual({
			batteryPct: undefined,
			fuelPct: undefined,
			sensors: [{ status: 2 }],
		});
	});

	it("returns empty sensors on missing vehicle_info / garbage (no throw)", () => {
		expect(parseAgentProfileTelemetry({})).toEqual({ sensors: [] });
		expect(parseAgentProfileTelemetry(null)).toEqual({ sensors: [] });
		expect(parseAgentProfileTelemetry(42)).toEqual({ sensors: [] });
	});
});

describe("vehicle_health (the platform's live state)", () => {
	// What the supervisor writes for a robot that reports a voltage but no
	// level: null numbers, and a 0 placeholder in vehicle_info.
	const voltageOnly = {
		vehicle_info: { battery_status_pct: 0, fuel_status_pct: 0 },
		vehicle_health: {
			level: 1,
			estop: 1,
			control_mode: 2,
			battery_pct: null,
			battery_voltage: 73.04,
			battery_current: null,
			battery_hours: null,
			temperature_c: null,
			faults: 0,
			native_error_code: 0,
		},
	};

	it("reads the enums and omits the numbers the platform does not report", () => {
		expect(parseVehicleHealth(voltageOnly.vehicle_health)).toEqual({
			level: "ok",
			estop: "released",
			controlMode: "autonomy",
			batteryVoltage: 73.04,
			faults: [],
			nativeErrorCode: 0,
		});
	});

	it("does not show the 0 placeholder as an empty battery", () => {
		const telemetry = parseAgentProfileTelemetry(voltageOnly);
		expect(telemetry.batteryPct).toBeUndefined();
		expect(formatBattery(telemetry)).toBe("73.0 V");
	});

	it("prefers the live level over vehicle_info's static one", () => {
		const telemetry = parseAgentProfileTelemetry({
			vehicle_info: { battery_status_pct: 90 },
			vehicle_health: { battery_pct: 41.6, battery_voltage: 70.2 },
		});
		expect(telemetry.batteryPct).toBe(41.6);
		expect(formatBattery(telemetry)).toBe("42% · 70.2 V");
	});

	it("keeps vehicle_info's battery when the profile has no health", () => {
		const telemetry = parseAgentProfileTelemetry({
			vehicle_info: { battery_status_pct: 87 },
		});
		expect(telemetry.health).toBeUndefined();
		expect(formatBattery(telemetry)).toBe("87%");
		expect(formatBattery({})).toBe("n/a");
	});

	it("names the fault bits, and numbers the ones it has no name for", () => {
		const health = parseVehicleHealth({
			level: 3,
			estop: 2,
			control_mode: 3,
			faults: 1 | 128 | (1 << 20),
			native_error_code: 18,
		});
		expect(health?.level).toBe("error");
		expect(health?.estop).toBe("engaged");
		expect(health?.controlMode).toBe("remote");
		expect(health?.faults).toEqual([
			"battery low",
			"system",
			"fault bit 20",
		]);
		expect(health?.nativeErrorCode).toBe(18);
	});

	it("reads out-of-range or garbage enums as unknown (no throw)", () => {
		expect(parseVehicleHealth({ level: 9, estop: "x" })).toEqual({
			level: "unknown",
			estop: "unknown",
			controlMode: "unknown",
			faults: [],
			nativeErrorCode: 0,
		});
		expect(parseVehicleHealth(null)).toBeUndefined();
		expect(parseVehicleHealth(42)).toBeUndefined();
	});
});

describe("buildNamespacedTopic (slash normalization, leading slash)", () => {
	it("builds from a bare namespace with a leading slash", () => {
		expect(buildNamespacedTopic("Themis_Fr", "localization")).toBe(
			"/Themis_Fr/edge/multi_robot/localization",
		);
	});

	it("normalizes a leading slash on the namespace (no double slash)", () => {
		expect(buildNamespacedTopic("/Themis_Fr", "localization")).toBe(
			"/Themis_Fr/edge/multi_robot/localization",
		);
	});

	it("trims a trailing slash on the namespace", () => {
		expect(buildNamespacedTopic("Themis_Fr/", "autonomy_status")).toBe(
			"/Themis_Fr/edge/multi_robot/autonomy_status",
		);
	});

	it("handles a namespace wrapped in slashes (no double slashes)", () => {
		expect(buildNamespacedTopic("/Themis_Fr/", "localization")).toBe(
			"/Themis_Fr/edge/multi_robot/localization",
		);
	});

	it("strips a leading slash on the suffix too", () => {
		expect(buildNamespacedTopic("ns", "/localization")).toBe(
			"/ns/edge/multi_robot/localization",
		);
	});
});

describe("mergeFleet (roster is last-known-value, never blanks)", () => {
	const roster: C2Vehicle[] = [
		{ agent_id: "a1", name: "Rover-1" },
		{ agent_id: "a2", name: "Drone-2" },
	];

	it("keeps every registered vehicle even with no telemetry", () => {
		const rows = mergeFleet(roster, []);
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.vehicle && !r.telemetry)).toBe(true);
		expect(rows.every((r) => !r.unregistered)).toBe(true);
	});

	it("cross-references live telemetry onto roster rows", () => {
		const rows = mergeFleet(roster, [
			{ agent_id: "a1", state: "ACTIVE", position: { x: 1, y: 2 } },
		]);
		const a1 = rows.find((r) => r.agent_id === "a1")!;
		expect(a1.telemetry?.state).toBe("ACTIVE");
		const a2 = rows.find((r) => r.agent_id === "a2")!;
		expect(a2.telemetry).toBeUndefined();
	});

	it("appends agents reporting live but absent from the roster", () => {
		const rows = mergeFleet(roster, [{ agent_id: "ghost" }]);
		const ghost = rows.find((r) => r.agent_id === "ghost")!;
		expect(ghost.unregistered).toBe(true);
		expect(ghost.vehicle).toBeUndefined();
	});

	it("sorts rows by agent id", () => {
		const rows = mergeFleet(
			[{ agent_id: "z" }, { agent_id: "a" }],
			[{ agent_id: "m" }],
		);
		expect(rows.map((r) => r.agent_id)).toEqual(["a", "m", "z"]);
	});
});
