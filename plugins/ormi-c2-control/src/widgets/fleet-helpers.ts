import { C2Vehicle } from "../types/c2-types";

/**
 * Pure helpers for the fleet status widget: defensively read the live
 * `task_msgs/msg/Feedback` agent telemetry and merge it with the
 * `c2.vehicles.list` roster.
 *
 * ⚠ The `Feedback.msg` shape has two divergent variants in the C2
 * submodules — a `nav_msgs/Odometry` copy and a `Localization` + `speed` copy.
 * Everything here reads defensively: tolerate either, or missing position
 * fields, and never throw on an unexpected shape.
 */

/** A 3D position read out of whichever `Feedback.msg` variant arrived. */
export interface AgentPosition {
	x: number;
	y: number;
	z?: number;
}

/** Live presence/health for one agent, derived from `/edge/feedback`. */
export interface AgentTelemetry {
	agent_id: string;
	state?: string | number;
	position?: AgentPosition;
}

/** A roster vehicle cross-referenced with its live telemetry (if present). */
export interface FleetRow {
	agent_id: string;
	/** The roster record (last-known-value), if the agent is registered. */
	vehicle?: C2Vehicle;
	/** Live telemetry, if the agent is currently reporting. */
	telemetry?: AgentTelemetry;
	/** True when the agent is reporting live but not in the roster. */
	unregistered: boolean;
}

/** Pick the first finite number from a list of candidates. */
function firstFinite(...candidates: unknown[]): number | undefined {
	for (const c of candidates) {
		if (typeof c === "number" && Number.isFinite(c)) return c;
	}
	return undefined;
}

/**
 * Defensively extract a position from a raw `Feedback.msg` value, tolerating
 * both the Odometry and Localization variants (and missing fields).
 *
 * Probes, in order:
 *  - `odometry.pose.pose.position` / `pose.pose.position` (nav_msgs/Odometry)
 *  - `localization.position` / `localization` (centralized Localization)
 *  - top-level `position`
 *
 * @param raw - A raw agent feedback object.
 * @returns The position, or undefined when none can be read.
 */
export function extractAgentPosition(raw: unknown): AgentPosition | undefined {
	if (raw == null || typeof raw !== "object") return undefined;
	const obj = raw as Record<string, any>;

	const candidates: unknown[] = [
		obj?.odometry?.pose?.pose?.position,
		obj?.pose?.pose?.position,
		obj?.localization?.position,
		obj?.localization,
		obj?.position,
	];

	for (const candidate of candidates) {
		if (candidate == null || typeof candidate !== "object") continue;
		const p = candidate as Record<string, unknown>;
		const x = firstFinite(p.x, p.latitude, p.lat);
		const y = firstFinite(p.y, p.longitude, p.lon, p.lng);
		if (x === undefined || y === undefined) continue;
		const z = firstFinite(p.z, p.altitude, p.alt);
		return z === undefined ? { x, y } : { x, y, z };
	}
	return undefined;
}

/**
 * Defensively normalize a raw `/edge/feedback` message into per-agent telemetry.
 *
 * Accepts either a single agent feedback object or a wrapper carrying an array
 * (`agents` / `feedbacks` / `feedback`). Entries without an `agent_id` are
 * dropped; nothing throws on an unexpected shape.
 *
 * @param raw - The latest raw `/edge/feedback` value.
 * @returns One telemetry record per identifiable agent.
 */
export function extractAgentTelemetry(raw: unknown): AgentTelemetry[] {
	if (raw == null || typeof raw !== "object") return [];
	const obj = raw as Record<string, any>;

	const list: unknown[] = Array.isArray(obj)
		? obj
		: Array.isArray(obj.agents)
			? obj.agents
			: Array.isArray(obj.feedbacks)
				? obj.feedbacks
				: Array.isArray(obj.feedback)
					? obj.feedback
					: [obj];

	const out: AgentTelemetry[] = [];
	for (const item of list) {
		if (item == null || typeof item !== "object") continue;
		const entry = item as Record<string, any>;
		const agentId = entry.agent_id ?? entry.agentId ?? entry.id;
		if (typeof agentId !== "string" || agentId === "") continue;
		out.push({
			agent_id: agentId,
			state: entry.state,
			position: extractAgentPosition(entry),
		});
	}
	return out;
}

/**
 * Collect the latest telemetry per agent from a window of buffered
 * `/edge/feedback` messages.
 *
 * Each `task_msgs/msg/Feedback` message carries a **single** `agent_id` — every
 * agent runs its own publisher on the shared `/multi_robot/edge/feedback` topic,
 * so messages from N agents arrive interleaved. Reading only the newest message
 * would show one agent at a time; folding every buffered message into a map
 * keyed by `agent_id` (last wins) surfaces the last-known telemetry for **all**
 * agents present in the buffer window simultaneously. Pure — the caller sizes
 * the buffer to cover the recent set.
 *
 * @param buffers - Per-source buffered message arrays (chronological).
 * @returns One telemetry record per agent seen in the window (latest each).
 */
export function collectTelemetry(
	buffers: Iterable<unknown[]>,
): AgentTelemetry[] {
	const byAgent = new Map<string, AgentTelemetry>();
	for (const buffer of buffers) {
		for (const value of buffer) {
			if (value == null) continue;
			for (const t of extractAgentTelemetry(value)) {
				byAgent.set(t.agent_id, t);
			}
		}
	}
	return [...byAgent.values()];
}

/**
 * How old an agent's last feedback may be before it stops reading as live.
 * Feedback is periodic, so a few missed periods is a robot that went quiet.
 */
export const FEEDBACK_STALE_MS = 5_000;

/**
 * Whether an agent is reporting: `live` (feedback younger than
 * {@link FEEDBACK_STALE_MS} on an online datasource), `stale` (seen, but not
 * recently), `none` (never seen, or the datasource is offline).
 */
export type AgentPresence = "live" | "stale" | "none";

/** The newest feedback message seen for an agent and when it was first seen. */
export interface AgentArrival {
	message: unknown;
	/** Browser clock (ms) at the tick that first observed `message`. */
	at: number;
}

/**
 * Stamp each agent's newest buffered feedback with the time it was first
 * observed.
 *
 * The buffer's own `times` are not usable for this: a datasource fills them
 * from the message's header stamp when it has one, which is the robot's clock
 * and cannot be compared with the browser's. So arrival is detected by message
 * **identity**: an agent whose newest message is the object recorded last time
 * keeps its stamp, any other gets `now`. An agent no longer in the buffer is
 * dropped, in step with {@link collectTelemetry}. Pure.
 *
 * @param previous - The arrivals from the previous call.
 * @param buffer - The buffered `/edge/feedback` messages (chronological).
 * @param now - The current browser time (ms).
 * @returns The arrivals for every agent present in the buffer.
 */
export function stampArrivals(
	previous: ReadonlyMap<string, AgentArrival>,
	buffer: unknown[],
	now: number,
): Map<string, AgentArrival> {
	const newest = new Map<string, unknown>();
	for (const message of buffer) {
		if (message == null) continue;
		for (const t of extractAgentTelemetry(message)) {
			newest.set(t.agent_id, message);
		}
	}
	const next = new Map<string, AgentArrival>();
	for (const [agentId, message] of newest) {
		const known = previous.get(agentId);
		next.set(
			agentId,
			known && known.message === message ? known : { message, at: now },
		);
	}
	return next;
}

/**
 * Resolve an agent's presence from when its feedback last arrived.
 *
 * @param lastSeenAt - When the agent's newest feedback arrived, if any.
 * @param now - The current browser time (ms).
 * @param health - The feedback topic's datasource health.
 * @returns The presence to display.
 */
export function resolveAgentPresence(
	lastSeenAt: number | undefined,
	now: number,
	health: string,
): AgentPresence {
	if (lastSeenAt == null || health === "offline") return "none";
	if (health === "online" && now - lastSeenAt < FEEDBACK_STALE_MS) {
		return "live";
	}
	return "stale";
}

/**
 * The words beside the presence dot (tooltip and screen reader).
 *
 * @param presence - The resolved presence.
 * @param ageMs - Time since the agent's last feedback, when it was seen.
 * @returns The label.
 */
export function presenceLabel(presence: AgentPresence, ageMs?: number): string {
	if (presence === "live") return "live telemetry";
	if (presence === "none" || ageMs == null) return "no live telemetry";
	const seconds = Math.max(0, Math.round(ageMs / 1000));
	return seconds < 60
		? `last feedback ${seconds} s ago`
		: `last feedback ${Math.floor(seconds / 60)} min ago`;
}

/**
 * Probe a vehicle/agent_profile object for the friendly namespace name.
 *
 * Checks, in order, a top-level `namespace`, a nested `agent_profile.namespace`,
 * then a top-level `name`. Returns the first non-blank trimmed string, else
 * undefined. Used to feed `publishAgentProfiles` (see `c2-agents-store.ts`).
 *
 * @param v - A raw vehicle or parsed agent_profile object.
 * @returns The namespace name, or undefined when none can be read.
 */
export function readNamespace(v: Record<string, unknown>): string | undefined {
	const candidates = [
		v.namespace,
		(v.agent_profile as Record<string, unknown>)?.namespace,
		v.name,
	];
	for (const c of candidates) {
		if (typeof c === "string") {
			const t = c.trim();
			if (t !== "") return t;
		}
	}
	return undefined;
}

/**
 * Extract a GEOGRAPHIC lng/lat from a raw `nav_msgs/msg/Odometry` value, gated
 * on the message's `frame_id`.
 *
 * Per the verified C2 contract, the per-agent `localization` Odometry carries a
 * geographic position ONLY when `header.frame_id === "map"`, with
 * `pose.pose.position.x = longitude` and `.y = latitude` (degrees). For any
 * other frame the position is a local/metric pose with no map meaning, so we
 * return null (the caller renders no marker). Reuses {@link extractAgentPosition}
 * to find `pose.pose.position` defensively; the frame is read at the call site
 * (`odom.header.frame_id`) and passed in. Never throws.
 *
 * @param odom - A raw Odometry message (the message IS the Odometry).
 * @param frameId - The message's `header.frame_id`.
 * @returns `{ lng, lat }` when geographic (`frame_id === "map"`), else null.
 */
export function extractOdometryLngLat(
	odom: unknown,
	frameId: string | undefined,
): { lng: number; lat: number } | null {
	if (frameId !== "map") return null;
	const pos = extractAgentPosition(odom);
	if (!pos) return null;
	return { lng: pos.x, lat: pos.y };
}

/** Autonomy status code → label (`autonomy_msgs/msg/AutonomyStatus.status`). */
export const AUTONOMY_STATUS_LABELS: Record<number, string> = {
	0: "PENDING",
	1: "ACTIVE",
	2: "COMPLETED",
	3: "FAILED",
	4: "ABORTED",
};

/**
 * Resolve an autonomy status code to its label, tolerating unknown codes.
 * @param n - The numeric status code.
 * @returns The label, or `Status <n>` for an unrecognized code.
 */
export function autonomyStatusLabel(n: number): string {
	return AUTONOMY_STATUS_LABELS[n] ?? `Status ${n}`;
}

/**
 * Defensively parse a raw `autonomy_msgs/msg/AutonomyStatus` message.
 *
 * Reads the numeric `status` and the `primitive_statuses[].progress` list
 * (`0..1` or `0..100` — tolerated either way, the caller just displays it).
 * Non-numeric / missing progress entries are dropped. Returns null when the
 * input is not an object. Never throws.
 *
 * @param raw - A raw AutonomyStatus message.
 * @returns `{ status, primitives }`, or null on a non-object input.
 */
export function parseAutonomyStatus(
	raw: unknown,
): { status: number; primitives: { progress: number }[] } | null {
	if (raw == null || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;
	const status =
		typeof obj.status === "number" && Number.isFinite(obj.status)
			? obj.status
			: 0;
	const primitives: { progress: number }[] = [];
	const list = obj.primitive_statuses;
	if (Array.isArray(list)) {
		for (const entry of list) {
			if (entry == null || typeof entry !== "object") continue;
			const progress = (entry as Record<string, unknown>).progress;
			if (typeof progress === "number" && Number.isFinite(progress)) {
				primitives.push({ progress });
			}
		}
	}
	return { status, primitives };
}

/** `autonomy_msgs/msg/VehicleHealth.level`. */
export type VehicleHealthLevel = "unknown" | "ok" | "warn" | "error";
/** `autonomy_msgs/msg/VehicleHealth.estop`. */
export type VehicleEstop = "unknown" | "released" | "engaged";
/** `autonomy_msgs/msg/VehicleHealth.control_mode`. */
export type VehicleControlMode = "unknown" | "standby" | "autonomy" | "remote";

/**
 * The platform's live state, as the robot's base driver reports it
 * (`agent_profile.vehicle_health`). A value the platform does not report is
 * `"unknown"` (the enums) or absent (the numbers): nothing is invented here.
 */
export type VehicleHealth = {
	level: VehicleHealthLevel;
	estop: VehicleEstop;
	controlMode: VehicleControlMode;
	batteryPct?: number;
	batteryVoltage?: number;
	batteryCurrent?: number;
	batteryHours?: number;
	temperatureC?: number;
	/** Human labels of the set `faults` bits, in bit order. */
	faults: string[];
	/** The platform's own error code, 0 when it reports none. */
	nativeErrorCode: number;
};

const HEALTH_LEVELS: VehicleHealthLevel[] = ["unknown", "ok", "warn", "error"];
const ESTOP_STATES: VehicleEstop[] = ["unknown", "released", "engaged"];
const CONTROL_MODES: VehicleControlMode[] = [
	"unknown",
	"standby",
	"autonomy",
	"remote",
];
/** `VehicleHealth.FAULT_*`, by bit position. */
const FAULT_LABELS = [
	"battery low",
	"motor overheat",
	"driver overheat",
	"driver overload",
	"sensor",
	"driver",
	"communication",
	"system",
];

/**
 * Defensively read `agent_profile.vehicle_health` (the supervisor's JSON of
 * `autonomy_msgs/msg/VehicleHealth`). Enum numbers outside the message's
 * constants read as `"unknown"`; a `null` number (the platform does not report
 * it) is omitted; a fault bit without a label is shown by its number.
 *
 * @param raw - The `vehicle_health` value of a parsed agent_profile.
 * @returns The health, or undefined when the profile carries none.
 */
export function parseVehicleHealth(raw: unknown): VehicleHealth | undefined {
	if (raw == null || typeof raw !== "object") return undefined;
	const h = raw as Record<string, unknown>;
	const pick = <T>(names: T[], value: unknown): T =>
		(typeof value === "number" ? names[value] : undefined) ??
		(names[0] as T);
	const bits = firstFinite(h.faults) ?? 0;
	const faults: string[] = [];
	for (let bit = 0; bit < 32; bit++) {
		if (((bits >>> bit) & 1) === 1) {
			faults.push(FAULT_LABELS[bit] ?? `fault bit ${bit}`);
		}
	}
	return {
		level: pick(HEALTH_LEVELS, h.level),
		estop: pick(ESTOP_STATES, h.estop),
		controlMode: pick(CONTROL_MODES, h.control_mode),
		batteryPct: firstFinite(h.battery_pct),
		batteryVoltage: firstFinite(h.battery_voltage),
		batteryCurrent: firstFinite(h.battery_current),
		batteryHours: firstFinite(h.battery_hours),
		temperatureC: firstFinite(h.temperature_c),
		faults,
		nativeErrorCode: firstFinite(h.native_error_code) ?? 0,
	};
}

/**
 * Defensively read battery/fuel/sensor telemetry out of a parsed agent_profile.
 *
 * Reads `vehicle_info.battery_status_pct`, `vehicle_info.fuel_status_pct`,
 * `vehicle_info.sensor_list[].status` and `vehicle_health`. Missing/garbage
 * fields are omitted (the percentages) or skipped (sensor entries). Never throws.
 *
 * When the profile carries `vehicle_health`, the battery level is the live one
 * from there, and absent when the platform does not report a level: the bridge
 * then writes 0 into `vehicle_info.battery_status_pct`, which is a placeholder
 * and must not be shown as an empty battery.
 *
 * @param parsed - A parsed agent_profile object.
 * @returns Battery/fuel percentages (when present), sensor statuses, and the
 *   platform's health (when the profile carries it).
 */
export function parseAgentProfileTelemetry(parsed: unknown): {
	batteryPct?: number;
	fuelPct?: number;
	sensors: { status: number }[];
	health?: VehicleHealth;
} {
	const sensors: { status: number }[] = [];
	if (parsed == null || typeof parsed !== "object") return { sensors };
	const profile = parsed as Record<string, unknown>;
	const health = parseVehicleHealth(profile.vehicle_health);
	const info = profile.vehicle_info;
	if (info == null || typeof info !== "object") {
		return health
			? { batteryPct: health.batteryPct, sensors, health }
			: { sensors };
	}
	const vi = info as Record<string, unknown>;
	const batteryPct = health
		? health.batteryPct
		: firstFinite(vi.battery_status_pct);
	const fuelPct = firstFinite(vi.fuel_status_pct);
	const list = vi.sensor_list;
	if (Array.isArray(list)) {
		for (const entry of list) {
			if (entry == null || typeof entry !== "object") continue;
			const status = (entry as Record<string, unknown>).status;
			if (typeof status === "number" && Number.isFinite(status)) {
				sensors.push({ status });
			}
		}
	}
	return health
		? { batteryPct, fuelPct, sensors, health }
		: { batteryPct, fuelPct, sensors };
}

/**
 * The battery line of a fleet row: the level, the pack voltage, both, or
 * "n/a". A platform that reports a voltage but no level shows the voltage.
 */
export function formatBattery(telemetry: {
	batteryPct?: number;
	health?: VehicleHealth;
}): string {
	const parts: string[] = [];
	if (telemetry.batteryPct != null) {
		parts.push(`${Math.round(telemetry.batteryPct)}%`);
	}
	const volts = telemetry.health?.batteryVoltage;
	if (volts != null) parts.push(`${volts.toFixed(1)} V`);
	return parts.length > 0 ? parts.join(" · ") : "n/a";
}

/**
 * Build a per-agent namespaced topic name from an agent's namespace.
 *
 * Produces `/${ns}/edge/multi_robot/${suffix}` with a LEADING SLASH — the real
 * ROS graph exposes these topics fully-qualified (`/Themis_Fr/edge/multi_robot/
 * localization`). Slash normalization: leading/trailing slashes on `namespace`
 * are stripped and the suffix's leading slash trimmed, so neither a bare nor a
 * slash-wrapped namespace yields double slashes. Pure.
 *
 * @param namespace - The agent's `AUTONOMY_TOPIC_PREFIX` namespace.
 * @param suffix - The topic suffix (e.g. `localization`, `autonomy_status`).
 * @returns The full topic name, with a leading slash.
 */
export function buildNamespacedTopic(
	namespace: string,
	suffix: string,
): string {
	const ns = namespace.replace(/^\/+/, "").replace(/\/+$/, "");
	const tail = suffix.replace(/^\/+/, "");
	return `/${ns}/edge/multi_robot/${tail}`;
}

/** Read an agent id off a roster vehicle, tolerating field-name variants. */
export function vehicleAgentId(vehicle: C2Vehicle): string | undefined {
	const id =
		vehicle.agent_id ??
		(vehicle as Record<string, unknown>).agentId ??
		(vehicle as Record<string, unknown>).id;
	return typeof id === "string" && id !== "" ? id : undefined;
}

/**
 * Merge the roster (last-known-value) with live telemetry into display rows.
 *
 * Every registered vehicle yields a row (so the roster never blanks when
 * telemetry is offline); any agent reporting live but absent from the roster is
 * appended as an `unregistered` row. Result is sorted by `agent_id` for a
 * stable render order.
 *
 * @param vehicles - The roster from `c2.vehicles.list`.
 * @param telemetry - Live per-agent telemetry from `/edge/feedback`.
 * @returns The merged fleet rows.
 */
export function mergeFleet(
	vehicles: C2Vehicle[],
	telemetry: AgentTelemetry[],
): FleetRow[] {
	const byAgent = new Map<string, AgentTelemetry>();
	for (const t of telemetry) byAgent.set(t.agent_id, t);

	const rows: FleetRow[] = [];
	const seen = new Set<string>();

	for (const vehicle of vehicles) {
		const agentId = vehicleAgentId(vehicle);
		if (!agentId) continue;
		seen.add(agentId);
		rows.push({
			agent_id: agentId,
			vehicle,
			telemetry: byAgent.get(agentId),
			unregistered: false,
		});
	}

	for (const t of telemetry) {
		if (seen.has(t.agent_id)) continue;
		rows.push({
			agent_id: t.agent_id,
			telemetry: t,
			unregistered: true,
		});
	}

	return rows.sort((a, b) => a.agent_id.localeCompare(b.agent_id));
}
