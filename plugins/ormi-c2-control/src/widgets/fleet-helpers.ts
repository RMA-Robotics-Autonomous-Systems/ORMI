import { C2Vehicle } from "../types/c2-types";

/**
 * Pure helpers for the F7 fleet widget: defensively read the live
 * `task_msgs/msg/Feedback` agent telemetry and merge it with the
 * `c2.vehicles.list` roster.
 *
 * ⚠ Per §7 the `Feedback.msg` shape has two divergent variants in the C2
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
 * Probe a vehicle/agent_profile object for the friendly namespace name.
 *
 * Checks, in order, a top-level `namespace`, a nested `agent_profile.namespace`,
 * then a top-level `name`. Returns the first non-blank trimmed string, else
 * undefined. Used to feed `publishAgentNames` (see `c2-agents-store.ts`).
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
