import {
	MissionStatus,
	MissionStatusRequest,
	MissionBehavior,
} from "./c2-types";

/**
 * `mission_feedback` parser.
 *
 * `c2_msgs/MissionFeedback.mission_feedback` is a JSON **string**. Parse it once
 * into a typed shape. Two C2 quirks handled here:
 *  - waypoint `coordinates` are `[latitude, longitude]` — the reverse of
 *    GeoJSON/MapLibre `[longitude, latitude]`; `lngLat` exposes the swapped form.
 *  - `issue` is omitted (not `null`) when absent.
 *
 * ## Schema v2
 *
 * Coordination adds progress and timing to the same JSON. **Every v2 key is
 * optional**, so the parser reads each one defensively and a v1 payload (no
 * `schema` key) parses exactly as before, with every v2 field left undefined.
 * Times are ISO-8601 UTC strings (like `est`/`eta`); coordinates are `[lat, lon]`
 * like the waypoint `coordinates`, and `position` gets the same `lngLat` swap.
 * A field of the wrong type is dropped rather than coerced: a wrong value on the
 * screen is worse than a dash.
 */

/** A `status_history` entry: the mission entered `status` at `at`. */
export interface StatusHistoryEntry {
	status: MissionStatus;
	/** ISO-8601 UTC time, or null when the producer left it out. */
	at: string | null;
}

/**
 * `task_msgs` `TaskState` (`task_msgs/json/Enums.hpp`), carried as the v2
 * per-task `state`.
 */
export enum TaskState {
	STOPPED = 0,
	STARTED = 1,
	PAUSED = 2,
	COMPLETED = 3,
	ABORTED = 4,
	DELETED = 5,
}

export interface FeedbackWaypoint {
	/** Raw C2 order: [latitude, longitude]. */
	coordinates: [number, number];
	/** GeoJSON/MapLibre order: [longitude, latitude]. */
	lngLat: [number, number];
	average_speed?: number;
	eta?: string | null;
	orientation?: number | null;
	// --- v2 (all optional) ---
	/** The waypoint's own unique primitive id. */
	waypoint_id?: string;
	/** The objective (leg) this waypoint belongs to. */
	objective_id?: string;
	/** True for a stop point; absent means the producer did not say. */
	stop?: boolean;
	/** When the robot reached this waypoint (ISO-8601), null/absent = not yet. */
	reached_at?: string | null;
}

export interface FeedbackTask {
	vehicle_id: string;
	est?: string | null;
	waypoints: FeedbackWaypoint[];
	// --- v2 (all optional) ---
	task_id?: string;
	/** {@link TaskState} (0-5). */
	state?: number;
	/** Index (0-based) of the waypoint the robot is driving to. */
	current_waypoint_index?: number;
	dispatched_at?: string | null;
	started_at?: string | null;
	ended_at?: string | null;
	/** Raw C2 order: [latitude, longitude]. */
	position?: [number, number];
	/** GeoJSON order of {@link position}: [longitude, latitude]. */
	positionLngLat?: [number, number];
	speed_mps?: number;
	distance_to_next_m?: number;
	remaining_m?: number;
	/** Task progress, 0..1. */
	progress?: number;
	eta_end?: string | null;
	last_edge_feedback_at?: string | null;
}

/** One `issue_conflicts` entry: `vehicle_id` is leased by `mission_id`. */
export interface FeedbackIssueConflict {
	vehicle_id: string;
	/** "" when the producer left it out. */
	mission_id: string;
}

export interface MissionFeedback {
	mission_id: string;
	behavior?: MissionBehavior;
	status: MissionStatus;
	requested_status?: MissionStatusRequest;
	date?: string;
	/** null when absent (the C2 omits the field). */
	issue: number | null;
	tasks: FeedbackTask[];
	// --- v2 (all optional) ---
	/** `2` for a v2 producer; undefined for v1. */
	schema?: number;
	plan_version?: number;
	planner_run_id?: string;
	/** Status changes, oldest first. Empty/undefined for v1. */
	status_history?: StatusHistoryEntry[];
	started_at?: string | null;
	ended_at?: string | null;
	// --- issue detail (all optional; present only while that issue is the
	// mission's CURRENT issue, next to the numeric `issue`) ---
	/**
	 * Stable machine-readable reason. Known codes: `"VEHICLE_BUSY"` (issue 13),
	 * `"EDGE_SILENT"`, `"EDGE_RESTARTED"`, `"TASK_RECOVERED"` (issue 15, warn;
	 * the latter two mean the task was re-sent and the mission PAUSED),
	 * `"TASK_DISPLACED"`, `"EDGE_TASK_LOST"` (issue 22, fail) and
	 * `"EDGE_LOST"` (issue 24, fail). Unknown codes are kept as-is.
	 */
	issue_code?: string;
	/** Human-readable explanation of the current issue. */
	issue_message?: string;
	/** `VEHICLE_BUSY` only: which vehicles are held by which missions. */
	issue_conflicts?: FeedbackIssueConflict[];
	/**
	 * Where each agent is in its behaviour-graph chain, keyed by agent id (the
	 * fog's program executor). Absent from producers without one.
	 */
	program?: Record<string, ProgramProgress>;
}

/** A chain step's state in the fog's program executor. */
export type ProgramStepState =
	| "WAITING"
	| "GATED"
	| "PLANNING"
	| "READY"
	| "RUNNING"
	| "LISTENING"
	| "DONE"
	| "FAILED";

/** One condition of the gate an agent waits at. */
export interface ProgramGateCondition {
	/** The graph node behind it: a condition node, or the step whose `done`. */
	node_id: string;
	op: string;
	key: string;
	threshold: number;
	negate: boolean;
	/** Whether this condition holds right now. */
	holds: boolean;
	/** ContactsFound: the mission's count so far. */
	value?: number;
}

/** One agent's position in its chain. */
export interface ProgramProgress {
	chain: number;
	/** Index of the current step in `steps` (a chain may loop back). */
	step_index: number;
	steps_total: number;
	/** Graph node of the current step (the last one once DONE). */
	step_id: string;
	state: ProgramStepState;
	/**
	 * The whole chain: each step's node (an action, or an On contact node),
	 * the Hold until in front of it ("" when none) and what is wired into it.
	 */
	steps: {
		step_id: string;
		kind: "STEP" | "ON_CONTACT";
		wait_node: string;
		/** Whether that Hold until needs all of its inputs, or any one. */
		mode: "all" | "any";
		gate_nodes: string[];
	}[];
	/** The steps of this chain that have completed at least once. */
	done_steps: string[];
	/** The contact the agent is visiting (from an On contact node). */
	contact?: { uid: string; lon: number; lat: number; node: string };
	/** At an On contact node: how many of its Coverage's contacts it took. */
	listening?: {
		node: string;
		source_step: string;
		taken: number;
		found: number;
		/** The Coverage is done: once every contact is taken, it moves on. */
		source_done: boolean;
	};
	/** Present while the step waits at its gate. */
	gate?: {
		node_ids: string[];
		/** The Wait node the agent is held at. */
		wait_node: string;
		/** Whether the Wait needs all of its conditions, or any one. */
		mode: "all" | "any";
		/** Run time spent at the gate (paused time excluded); null until START. */
		waited_s: number | null;
		conditions: ProgramGateCondition[];
	};
}

/**
 * A signature of a parsed feedback's PLAN: mission id, status, issue, plan
 * version, and per task the vehicle, task id and waypoint geometry (coordinates,
 * orientation, speed, id, stop flag). Identical plans yield an identical string.
 *
 * It deliberately EXCLUDES everything that moves while the plan does not —
 * waypoint `eta` (recomputed every second while a v2 mission runs), `reached_at`,
 * and every per-task progress/timing field — so a consumer that only draws the
 * plan can key on it and not rebuild once a second. The store's change detector
 * is {@link feedbackSignature}, which includes all of those.
 *
 * @param fb - The parsed feedback.
 * @returns A stable signature string for the plan.
 */
export function feedbackPlanSignature(fb: MissionFeedback): string {
	const tasks = fb.tasks
		.map(
			(t) =>
				`${t.vehicle_id}:${t.task_id ?? ""}:${t.est ?? ""}:${t.waypoints
					.map(
						(w) =>
							`${w.lngLat[0]},${w.lngLat[1]},${w.orientation ?? ""},${w.average_speed ?? ""}` +
							`,${w.waypoint_id ?? ""},${w.stop ?? ""}`,
					)
					.join(";")}`,
		)
		.join("|");
	return (
		`${fb.mission_id}|${fb.status}|${fb.issue ?? ""}|${tasks}` +
		`|${fb.plan_version ?? ""}|${fb.planner_run_id ?? ""}`
	);
}

/**
 * A signature of EVERYTHING a feedback renders: the plan
 * ({@link feedbackPlanSignature}) plus waypoint `eta` / `reached_at`, every v2
 * per-task progress and timing field, and the mission's status history.
 *
 * This is the per-mission store's content-change detector: the timeline and the
 * "now playing" strip must re-render when a robot passes a waypoint or its ETA
 * moves, which a plan-only signature would hide.
 *
 * @param fb - The parsed feedback.
 * @returns A stable signature string for the whole rendered content.
 */
export function feedbackSignature(fb: MissionFeedback): string {
	const progress = fb.tasks
		.map(
			(t) =>
				t.waypoints
					.map((w) => `${w.eta ?? ""}/${w.reached_at ?? ""}`)
					.join(";") +
				`#${t.state ?? ""},${t.current_waypoint_index ?? ""},` +
				`${t.dispatched_at ?? ""},${t.started_at ?? ""},${t.ended_at ?? ""},` +
				`${t.position?.join(",") ?? ""},${t.speed_mps ?? ""},` +
				`${t.distance_to_next_m ?? ""},${t.remaining_m ?? ""},${t.progress ?? ""},` +
				`${t.eta_end ?? ""},${t.last_edge_feedback_at ?? ""}`,
		)
		.join("|");
	const history = (fb.status_history ?? [])
		.map((h) => `${h.status}@${h.at ?? ""}`)
		.join(",");
	return (
		`${feedbackPlanSignature(fb)}||${progress}` +
		`|${fb.schema ?? ""}|${fb.started_at ?? ""}|${fb.ended_at ?? ""}|${history}` +
		`|${fb.issue_code ?? ""}|${fb.issue_message ?? ""}|` +
		(fb.issue_conflicts ?? [])
			.map((c) => `${c.vehicle_id}@${c.mission_id}`)
			.join(",") +
		// `date` is what v1 feedback sorts and ages on, and `requested_status`
		// is rendered; omitting either left the store holding a stale copy.
		`|${fb.date ?? ""}|${fb.requested_status ?? ""}`
	);
}

interface RawWaypoint {
	coordinates?: [number, number];
	average_speed?: number;
	eta?: string | null;
	orientation?: number | null;
	waypoint_id?: unknown;
	objective_id?: unknown;
	stop?: unknown;
	reached_at?: unknown;
}

interface RawTask {
	vehicle_id?: string;
	est?: string | null;
	waypoints?: RawWaypoint[];
	task_id?: unknown;
	state?: unknown;
	current_waypoint_index?: unknown;
	dispatched_at?: unknown;
	started_at?: unknown;
	ended_at?: unknown;
	position?: unknown;
	speed_mps?: unknown;
	distance_to_next_m?: unknown;
	remaining_m?: unknown;
	progress?: unknown;
	eta_end?: unknown;
	last_edge_feedback_at?: unknown;
}

interface RawFeedback {
	mission_id?: string;
	behavior?: number;
	status?: number;
	requested_status?: number;
	date?: string;
	issue?: number | null;
	tasks?: RawTask[];
	schema?: unknown;
	plan_version?: unknown;
	planner_run_id?: unknown;
	status_history?: unknown;
	started_at?: unknown;
	ended_at?: unknown;
	issue_code?: unknown;
	issue_message?: unknown;
	issue_conflicts?: unknown;
	program?: unknown;
}

/** A finite number, else undefined. */
function num(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

/** A finite non-negative integer, else undefined. */
function index(value: unknown): number | undefined {
	const n = num(value);
	return n != null && Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** A non-empty string, else undefined. */
function str(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * An optional time: a non-empty string, `null` when the producer sent an
 * explicit null ("not yet"), else undefined (absent / wrong type).
 */
function time(value: unknown): string | null | undefined {
	if (value === null) return null;
	return str(value);
}

/** A `[lat, lon]` pair of finite numbers, else undefined. */
function latLon(value: unknown): [number, number] | undefined {
	if (!Array.isArray(value) || value.length < 2) return undefined;
	const lat = num(value[0]);
	const lon = num(value[1]);
	return lat != null && lon != null ? [lat, lon] : undefined;
}

/** Parse `status_history`, dropping malformed entries. */
function statusHistory(value: unknown): StatusHistoryEntry[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const out: StatusHistoryEntry[] = [];
	for (const entry of value) {
		if (entry == null || typeof entry !== "object") continue;
		const e = entry as { status?: unknown; at?: unknown };
		const status = num(e.status);
		if (status == null) continue;
		out.push({ status: status as MissionStatus, at: str(e.at) ?? null });
	}
	return out;
}

/** Parse `issue_conflicts`, dropping entries without a string `vehicle_id`. */
function issueConflicts(value: unknown): FeedbackIssueConflict[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const out: FeedbackIssueConflict[] = [];
	for (const entry of value) {
		if (entry == null || typeof entry !== "object") continue;
		const e = entry as { vehicle_id?: unknown; mission_id?: unknown };
		const vehicle = str(e.vehicle_id);
		if (!vehicle) continue;
		out.push({ vehicle_id: vehicle, mission_id: str(e.mission_id) ?? "" });
	}
	return out;
}

const PROGRAM_STATES: readonly ProgramStepState[] = [
	"WAITING",
	"GATED",
	"PLANNING",
	"READY",
	"RUNNING",
	"LISTENING",
	"DONE",
	"FAILED",
];

/** Parse `program`, dropping agents whose entry is not usable. */
function programProgress(
	value: unknown,
): Record<string, ProgramProgress> | undefined {
	if (value == null || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const out: Record<string, ProgramProgress> = {};
	for (const [agent, entry] of Object.entries(value)) {
		if (entry == null || typeof entry !== "object") continue;
		const e = entry as Record<string, unknown>;
		const state = e.state as ProgramStepState;
		const stepIndex = index(e.step_index);
		const stepsTotal = index(e.steps_total);
		if (
			!PROGRAM_STATES.includes(state) ||
			stepIndex == null ||
			stepsTotal == null
		)
			continue;
		const progress: ProgramProgress = {
			chain: index(e.chain) ?? 0,
			step_index: stepIndex,
			steps_total: stepsTotal,
			step_id: str(e.step_id) ?? "",
			state,
			steps: (Array.isArray(e.steps) ? e.steps : [])
				.filter(
					(st): st is Record<string, unknown> =>
						st != null && typeof st === "object",
				)
				.map((st) => ({
					step_id: str(st.step_id) ?? "",
					kind:
						st.kind === "ON_CONTACT"
							? ("ON_CONTACT" as const)
							: ("STEP" as const),
					wait_node: str(st.wait_node) ?? "",
					mode:
						st.mode === "any" ? ("any" as const) : ("all" as const),
					gate_nodes: Array.isArray(st.gate_nodes)
						? st.gate_nodes.filter(
								(n): n is string => typeof n === "string",
							)
						: [],
				})),
			done_steps: Array.isArray(e.done_steps)
				? e.done_steps.filter((n): n is string => typeof n === "string")
				: [],
		};
		const contact = e.contact as Record<string, unknown> | undefined;
		if (contact != null && typeof contact === "object") {
			const lon = num(contact.lon);
			const lat = num(contact.lat);
			if (lon != null && lat != null) {
				progress.contact = {
					uid: str(contact.uid) ?? "",
					lon,
					lat,
					node: str(contact.node) ?? "",
				};
			}
		}
		const listening = e.listening as Record<string, unknown> | undefined;
		if (listening != null && typeof listening === "object") {
			progress.listening = {
				node: str(listening.node) ?? "",
				source_step: str(listening.source_step) ?? "",
				taken: index(listening.taken) ?? 0,
				found: index(listening.found) ?? 0,
				source_done: listening.source_done === true,
			};
		}
		const gate = e.gate as Record<string, unknown> | undefined;
		if (gate != null && typeof gate === "object") {
			const conditions = Array.isArray(gate.conditions)
				? gate.conditions
				: [];
			progress.gate = {
				node_ids: Array.isArray(gate.node_ids)
					? gate.node_ids.filter(
							(n): n is string => typeof n === "string",
						)
					: [],
				wait_node: str(gate.wait_node) ?? "",
				mode: gate.mode === "any" ? "any" : "all",
				waited_s: num(gate.waited_s) ?? null,
				conditions: conditions
					.filter(
						(c): c is Record<string, unknown> =>
							c != null && typeof c === "object",
					)
					.map((c) => ({
						node_id: str(c.node_id) ?? "",
						op: str(c.op) ?? "",
						key: str(c.key) ?? "",
						threshold: num(c.threshold) ?? 0,
						negate: c.negate === true,
						holds: c.holds === true,
						...(num(c.value) != null
							? { value: num(c.value) }
							: {}),
					})),
			};
		}
		out[agent] = progress;
	}
	return out;
}

/**
 * Assign only the keys whose value is not undefined, so a v1 payload yields an
 * object with exactly the v1 keys (existing `toEqual` expectations hold).
 */
function defined<T extends object>(target: T, extra: Partial<T>): T {
	for (const [key, value] of Object.entries(extra)) {
		if (value !== undefined)
			(target as Record<string, unknown>)[key] = value;
	}
	return target;
}

/**
 * Parse the JSON-string `mission_feedback` field into a typed object.
 * @param raw - The `mission_feedback` string (or an already-parsed object).
 * @returns The typed feedback, or null if it can't be parsed / lacks a mission id.
 */
export function parseMissionFeedback(
	raw: string | RawFeedback | null | undefined,
): MissionFeedback | null {
	if (raw == null) return null;

	let obj: RawFeedback;
	try {
		obj = typeof raw === "string" ? (JSON.parse(raw) as RawFeedback) : raw;
	} catch {
		return null;
	}
	if (!obj || typeof obj.mission_id !== "string") return null;

	const rawTasks = Array.isArray(obj.tasks) ? obj.tasks : [];
	const tasks: FeedbackTask[] = rawTasks
		.filter((t): t is RawTask => t != null && typeof t === "object")
		.map((t) => {
			const position = latLon(t.position);
			const progress = num(t.progress);
			return defined<FeedbackTask>(
				{
					vehicle_id: t.vehicle_id ?? "",
					est: t.est ?? null,
					waypoints: (Array.isArray(t.waypoints) ? t.waypoints : [])
						.filter(
							(w) =>
								w != null &&
								Array.isArray(w.coordinates) &&
								w.coordinates.length >= 2,
						)
						.map((w) => {
							const [lat, lng] = w.coordinates as [
								number,
								number,
							];
							return defined<FeedbackWaypoint>(
								{
									coordinates: [lat, lng],
									lngLat: [lng, lat],
									average_speed: w.average_speed,
									eta: w.eta ?? null,
									orientation: w.orientation ?? null,
								},
								{
									waypoint_id: str(w.waypoint_id),
									objective_id: str(w.objective_id),
									stop:
										typeof w.stop === "boolean"
											? w.stop
											: undefined,
									reached_at: time(w.reached_at),
								},
							);
						}),
				},
				{
					task_id: str(t.task_id),
					state: index(t.state),
					current_waypoint_index: index(t.current_waypoint_index),
					dispatched_at: time(t.dispatched_at),
					started_at: time(t.started_at),
					ended_at: time(t.ended_at),
					position,
					positionLngLat: position
						? [position[1], position[0]]
						: undefined,
					speed_mps: num(t.speed_mps),
					distance_to_next_m: num(t.distance_to_next_m),
					remaining_m: num(t.remaining_m),
					// Clamp: a producer rounding to 1.0000001 must not draw a
					// bar wider than its track.
					progress:
						progress != null
							? Math.min(1, Math.max(0, progress))
							: undefined,
					eta_end: time(t.eta_end),
					last_edge_feedback_at: time(t.last_edge_feedback_at),
				},
			);
		});

	return defined<MissionFeedback>(
		{
			mission_id: obj.mission_id,
			behavior: obj.behavior as MissionBehavior | undefined,
			status: (obj.status ?? MissionStatus.NONE) as MissionStatus,
			requested_status: obj.requested_status as
				MissionStatusRequest | undefined,
			date: obj.date,
			issue: obj.issue ?? null,
			tasks,
		},
		{
			schema: num(obj.schema),
			plan_version: num(obj.plan_version),
			planner_run_id: str(obj.planner_run_id),
			status_history: statusHistory(obj.status_history),
			started_at: time(obj.started_at),
			ended_at: time(obj.ended_at),
			issue_code: str(obj.issue_code),
			issue_message: str(obj.issue_message),
			issue_conflicts: issueConflicts(obj.issue_conflicts),
			program: programProgress(obj.program),
		},
	);
}
