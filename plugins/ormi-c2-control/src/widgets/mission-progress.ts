import { MissionStatus } from "../types/c2-types";
import {
	FeedbackTask,
	MissionFeedback,
	TaskState,
} from "../types/mission-feedback";
import { isMissionCommitted } from "./map-view-mode";
import { formatDistance } from "./plan-metrics";

/**
 * Pure mission-progress helpers for the "now playing" strip, the feedback
 * timeline and the map's done/remaining route split.
 *
 * Everything reads MissionFeedback v2 fields when they are there and degrades to
 * "unknown" when they are not: a v1 producer has no per-task progress, and the UI
 * must then say nothing rather than claim "WP 1/56". No React — pure data.
 *
 * ⚠ COORDINATE RULE — as in `plan-metrics.ts`, geometry reads `lngLat` /
 * `positionLngLat` (already swapped by the parser); never the raw `[lat, lon]`.
 */

// ---------------------------------------------------------------------------
// Mission phase
// ---------------------------------------------------------------------------

/** Where a mission is in its life, for grouping and banners. */
export type MissionPhase = "active" | "pending" | "finished";

/** Statuses after which the mission will not move again. */
const TERMINAL_STATUSES = new Set<MissionStatus>([
	MissionStatus.PLANNED_FAILED,
	MissionStatus.FAILED,
	MissionStatus.STOPPED,
	MissionStatus.DELETED,
	MissionStatus.COMPLETED,
]);

/**
 * Classify a mission status.
 *
 * `active` is the committed triple (ACCEPTED/STARTED/PAUSED — the same rule the
 * map's authoring stand-down uses, see `map-view-mode.ts`); `finished` is every
 * terminal status; anything else (NONE, PLANNED, PLANNED_ALTERNATIVE, unknown)
 * is `pending`.
 *
 * @param status - The mission status.
 * @returns The phase.
 */
export function missionPhase(
	status: MissionStatus | null | undefined,
): MissionPhase {
	if (isMissionCommitted(status)) return "active";
	if (status != null && TERMINAL_STATUSES.has(status)) return "finished";
	return "pending";
}

/**
 * Whether a mission is RUNNING — actually executing, the one state in which the
 * screen shows "live". A paused or merely accepted mission is active but not
 * running, and the banner says so.
 *
 * @param status - The mission status.
 * @returns True only for STARTED.
 */
export function isMissionRunning(
	status: MissionStatus | null | undefined,
): boolean {
	return status === MissionStatus.STARTED;
}

/**
 * Whether silence from a mission means something is wrong.
 *
 * A terminal mission (completed / stopped / deleted / failed) publishes one final
 * snapshot and then goes quiet on purpose, so its growing age is not
 * staleness — flagging it would cry wolf on every finished mission.
 *
 * @param stale - The raw age-based verdict (`feedbackFreshness(...).stale`).
 * @param status - The mission's last status.
 * @returns True only for a non-terminal mission past the threshold.
 */
export function isFeedbackStale(
	stale: boolean,
	status: MissionStatus | null | undefined,
): boolean {
	return stale && missionPhase(status) !== "finished";
}

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

/**
 * Parse an ISO-8601 time to epoch ms, or null when absent/unparseable.
 * @param iso - The time string.
 * @returns Epoch milliseconds, or null.
 */
export function parseTime(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? null : ms;
}

/**
 * Format an ISO time as a local wall-clock `HH:MM:SS` (or `HH:MM` when
 * `short`), "—" when absent. Local time on purpose: the operator reads it
 * against the clock on the wall, not against UTC.
 *
 * @param iso - The time string.
 * @param short - Drop the seconds.
 * @returns The formatted time.
 */
export function formatClock(
	iso: string | null | undefined,
	short = false,
): string {
	const ms = parseTime(iso);
	if (ms == null) return "—";
	const d = new Date(ms);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	if (short) return `${hh}:${mm}`;
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

/**
 * When the mission started: v2 `started_at`, else the first STARTED entry of
 * `status_history`. Null for a mission that never started (or a v1 producer).
 *
 * @param fb - The feedback.
 * @returns The start time as an ISO string, or null.
 */
export function missionStartedAt(fb: MissionFeedback): string | null {
	if (fb.started_at) return fb.started_at;
	const entry = (fb.status_history ?? []).find(
		(h) => h.status === MissionStatus.STARTED && h.at,
	);
	return entry?.at ?? null;
}

/**
 * When the mission ended: v2 `ended_at`, else — for a terminal mission — the
 * time of the last `status_history` entry. Null while it has not ended.
 *
 * @param fb - The feedback.
 * @returns The end time as an ISO string, or null.
 */
export function missionEndedAt(fb: MissionFeedback): string | null {
	if (fb.ended_at) return fb.ended_at;
	if (missionPhase(fb.status) !== "finished") return null;
	const history = fb.status_history ?? [];
	return history[history.length - 1]?.at ?? null;
}

/**
 * Elapsed mission time in ms: from the start to the end, or to `now` while it
 * runs. Null when the start is unknown.
 *
 * @param fb - The feedback.
 * @param now - The current time in ms.
 * @returns Elapsed milliseconds, or null.
 */
export function missionElapsedMs(
	fb: MissionFeedback,
	now: number,
): number | null {
	const start = parseTime(missionStartedAt(fb));
	if (start == null) return null;
	const end = parseTime(missionEndedAt(fb)) ?? now;
	return Math.max(0, end - start);
}

// ---------------------------------------------------------------------------
// Task state
// ---------------------------------------------------------------------------

const TASK_STATE_LABELS: Record<TaskState, string> = {
	[TaskState.STOPPED]: "Not started",
	[TaskState.STARTED]: "Driving",
	[TaskState.PAUSED]: "Paused",
	[TaskState.COMPLETED]: "Completed",
	[TaskState.ABORTED]: "Aborted",
	[TaskState.DELETED]: "Deleted",
};

/**
 * Display label for a v2 task `state`.
 *
 * `STOPPED` (0) is `task_msgs`' "stopped, but not completed or started", i.e.
 * not yet started — labelled that way, because "Stopped" would read as a halt.
 *
 * @param state - The task state, or undefined (v1).
 * @returns A label, or null when the producer did not say.
 */
export function taskStateLabel(state: number | undefined): string | null {
	if (state == null) return null;
	return TASK_STATE_LABELS[state as TaskState] ?? `State ${state}`;
}

/** Badge tone for a task state. */
export function taskStateTone(
	state: number | undefined,
): "active" | "done" | "fail" | "idle" {
	switch (state) {
		case TaskState.STARTED:
			return "active";
		case TaskState.COMPLETED:
			return "done";
		case TaskState.ABORTED:
		case TaskState.DELETED:
			return "fail";
		default:
			return "idle";
	}
}

// ---------------------------------------------------------------------------
// Task progress
// ---------------------------------------------------------------------------

/** Where a task is along its waypoints. */
export interface TaskProgress {
	/** Waypoint count. */
	total: number;
	/** Waypoints already passed. */
	done: number;
	/**
	 * 0-based index of the waypoint the robot is driving to; null when the task
	 * is finished or its progress is unknown.
	 */
	currentIndex: number | null;
	/** 0..1, or null when unknown. */
	fraction: number | null;
	/** False for a v1 producer: no per-waypoint progress was reported. */
	known: boolean;
}

/**
 * Derive a task's progress.
 *
 * Precedence: a COMPLETED task has passed everything; otherwise the v2
 * `current_waypoint_index` (the waypoint being driven to — every waypoint before
 * it is passed); otherwise the count of waypoints carrying `reached_at`. With
 * none of those (v1) the progress is unknown and `known` is false.
 *
 * `fraction` prefers the producer's `progress` (distance-based, so it moves
 * between waypoints) over the waypoint ratio.
 *
 * @param task - The feedback task.
 * @returns The task progress.
 */
export function taskProgress(task: FeedbackTask): TaskProgress {
	const total = task.waypoints.length;
	let done = 0;
	let currentIndex: number | null = null;
	let known = true;

	if (task.state === TaskState.COMPLETED) {
		done = total;
	} else if (task.current_waypoint_index != null) {
		done = Math.min(task.current_waypoint_index, total);
		currentIndex =
			task.current_waypoint_index < total
				? task.current_waypoint_index
				: null;
	} else if (task.waypoints.some((w) => w.reached_at)) {
		done = task.waypoints.filter((w) => w.reached_at).length;
		currentIndex = done < total ? done : null;
	} else if (task.state != null) {
		// v2 without an index yet (e.g. dispatched, not started): nothing passed.
		currentIndex = task.state === TaskState.STARTED && total > 0 ? 0 : null;
	} else {
		known = false;
	}

	const fraction =
		task.progress ?? (known && total > 0 ? done / total : null);
	return { total, done, currentIndex, fraction, known };
}

/**
 * The "WP 22/56 · 14 m · ETA 10:42" line for a task, or null when there is no
 * progress to report (v1).
 *
 * @param task - The feedback task.
 * @returns The line, or null.
 */
export function formatTaskProgressLine(task: FeedbackTask): string | null {
	const p = taskProgress(task);
	if (!p.known || p.total === 0) return null;
	const parts: string[] = [];
	if (p.currentIndex != null) {
		parts.push(`WP ${p.currentIndex + 1}/${p.total}`);
		if (task.distance_to_next_m != null) {
			parts.push(formatDistance(task.distance_to_next_m));
		}
	} else {
		parts.push(`${p.done}/${p.total} WP`);
	}
	if (task.eta_end && p.currentIndex != null) {
		parts.push(`ETA ${formatClock(task.eta_end, true)}`);
	}
	return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Route split (map)
// ---------------------------------------------------------------------------

/** A task route split into its driven and remaining parts. */
export interface RouteSplit {
	/** Already driven, `[lng, lat]`; fewer than 2 points means nothing to draw. */
	done: [number, number][];
	/** Still to drive, `[lng, lat]`; fewer than 2 points means nothing to draw. */
	remaining: [number, number][];
}

/**
 * Split a task's route by its progress.
 *
 * The leg being driven belongs to BOTH halves, joined at the robot's `position`
 * when the producer reports one (so the grey line ends where the robot is), else
 * at the last passed waypoint. Unknown progress (v1) leaves the whole route in
 * `remaining`, which draws exactly as before.
 *
 * @param task - The feedback task.
 * @returns The done / remaining polylines.
 */
export function splitRoute(task: FeedbackTask): RouteSplit {
	const pts = task.waypoints.map((w) => w.lngLat);
	const p = taskProgress(task);
	if (!p.known || p.done === 0) return { done: [], remaining: pts };
	if (p.done >= pts.length) return { done: pts, remaining: [] };
	const passed = pts.slice(0, p.done);
	const ahead = pts.slice(p.done);
	const pos = task.positionLngLat;
	if (pos) return { done: [...passed, pos], remaining: [pos, ...ahead] };
	const last = passed[passed.length - 1]!;
	return { done: passed, remaining: [last, ...ahead] };
}

// ---------------------------------------------------------------------------
// Mission list ordering
// ---------------------------------------------------------------------------

/** Sort rank per phase: active first, then pending, then finished. */
const PHASE_RANK: Record<MissionPhase, number> = {
	active: 0,
	pending: 1,
	finished: 2,
};

/**
 * The most recent time known for a mission (last status change, end, start),
 * for ordering. Null when the feedback carries no time at all (v1).
 */
function lastActivity(fb: MissionFeedback): number | null {
	const history = fb.status_history ?? [];
	return (
		parseTime(fb.ended_at) ??
		parseTime(history[history.length - 1]?.at) ??
		parseTime(fb.started_at) ??
		parseTime(fb.date)
	);
}

/**
 * Order missions for the timeline's mission list: active, then pending, then
 * finished; most recent first within a group; a stable original order when no
 * times are known.
 *
 * @param missions - The feedback of every known mission.
 * @returns A new, sorted array.
 */
export function sortMissions(missions: MissionFeedback[]): MissionFeedback[] {
	return missions
		.map((fb, i) => ({ fb, i }))
		.sort((a, b) => {
			const rank =
				PHASE_RANK[missionPhase(a.fb.status)] -
				PHASE_RANK[missionPhase(b.fb.status)];
			if (rank !== 0) return rank;
			const ta = lastActivity(a.fb);
			const tb = lastActivity(b.fb);
			if (ta != null && tb != null && ta !== tb) return tb - ta;
			return a.i - b.i;
		})
		.map(({ fb }) => fb);
}
