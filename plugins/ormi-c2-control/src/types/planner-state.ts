/**
 * S — planner-state parser.
 *
 * The C2 planner publishes its per-mission planning state on a single rosbridge
 * topic (`std_msgs/String`, default `/multi_robot/planner/state`). The String's
 * `data` field carries a JSON object:
 *
 * ```json
 * { "planners": [ { "mission_id": "<id>", "state": <int> }, ... ] }
 * ```
 *
 * `state` is the planner's integer encoding (ground truth: the framework
 * `planner_node.py` `planner_states` map / `planning_timer_callback`):
 *  - 0 = initialized (mission accepted, not yet planning)
 *  - 1 = planning     (the planner is solving)
 *  - 2 = planned      (a plan was produced)
 *  - 3 = failed       (planning raised / produced no plan)
 *
 * The topic carries state for ALL missions interleaved in each message, so we
 * parse the whole `planners` list into a per-mission map and let consumers read
 * only the mission they care about. The planner emits ONLY the integer state (no
 * error string), so a `failed` carries no machine-readable reason.
 */

/** The planner's integer state encoding, normalized to a string union. */
export type PlannerState = "initialized" | "planning" | "planned" | "failed";

/** The planner's raw integer encoding for each {@link PlannerState}. */
export enum PlannerStateCode {
	INITIALIZED = 0,
	PLANNING = 1,
	PLANNED = 2,
	FAILED = 3,
}

/** mission_id → planner state. */
export type PlannerStateMap = Record<string, PlannerState>;

/** One entry in the published `planners` list. */
interface RawPlannerEntry {
	mission_id?: unknown;
	state?: unknown;
}

/** The shape wrapped in the `std_msgs/String` `data` field. */
interface RawPlannerStatePayload {
	planners?: RawPlannerEntry[];
}

/**
 * Map a planner integer state code to its {@link PlannerState} label, or null
 * when the code is unknown (the planner is the authority on the encoding and may
 * add codes — never crash on an out-of-range value).
 *
 * @param code - The integer `state` from a planner entry.
 * @returns The normalized state, or null when unrecognized.
 */
export function plannerStateFromCode(code: number): PlannerState | null {
	switch (code) {
		case PlannerStateCode.INITIALIZED:
			return "initialized";
		case PlannerStateCode.PLANNING:
			return "planning";
		case PlannerStateCode.PLANNED:
			return "planned";
		case PlannerStateCode.FAILED:
			return "failed";
		default:
			return null;
	}
}

/**
 * Parse a `/multi_robot/planner/state` payload into a per-mission state map.
 *
 * Tolerates:
 *  - the `std_msgs/String` wrapper (a JSON string in `data`),
 *  - an already-parsed object (e.g. a topic `property` pointing at the payload),
 *  - missing/garbage entries (skipped, never throw),
 *  - unknown integer state codes (entry skipped).
 *
 * @param raw - The String message (`{ data: string }`), the parsed payload
 *   object, or the JSON string itself.
 * @returns A `mission_id → state` map (possibly empty); never null.
 */
export function parsePlannerState(raw: unknown): PlannerStateMap {
	if (raw == null) return {};

	let payload: RawPlannerStatePayload | null = null;
	try {
		if (typeof raw === "string") {
			payload = JSON.parse(raw) as RawPlannerStatePayload;
		} else if (typeof raw === "object") {
			// `std_msgs/String` wrapper: the JSON sits in the `data` field.
			const data = (raw as { data?: unknown }).data;
			if (typeof data === "string") {
				payload = JSON.parse(data) as RawPlannerStatePayload;
			} else {
				// Already-parsed payload object (topic `property` into the field).
				payload = raw as RawPlannerStatePayload;
			}
		}
	} catch {
		return {};
	}

	if (!payload || !Array.isArray(payload.planners)) return {};

	const map: PlannerStateMap = {};
	for (const entry of payload.planners) {
		if (!entry || typeof entry.mission_id !== "string") continue;
		if (typeof entry.state !== "number") continue;
		const state = plannerStateFromCode(entry.state);
		if (state == null) continue;
		map[entry.mission_id] = state;
	}
	return map;
}

/**
 * A stable content signature of a per-mission state map — identical maps yield
 * an identical string. Lets the store dedupe identical republishes (the topic
 * streams continuously) without churning consumers.
 *
 * @param map - The per-mission state map.
 * @returns A stable signature string.
 */
export function plannerStateSignature(map: PlannerStateMap): string {
	return Object.keys(map)
		.sort()
		.map((id) => `${id}:${map[id]}`)
		.join("|");
}
