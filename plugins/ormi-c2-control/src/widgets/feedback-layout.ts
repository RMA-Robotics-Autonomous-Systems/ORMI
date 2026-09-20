import { MissionStatus } from "../types/c2-types";
import {
	FeedbackTask,
	MissionFeedback,
	TaskState,
} from "../types/mission-feedback";
import { missionPhase, parseTime, taskProgress } from "./mission-progress";
import { haversineMeters, taskDistanceMeters } from "./plan-metrics";

/**
 * Pure layout helpers for the Mission Feedback widget's two views:
 *
 *  - the **Gantt** (time view): {@link fitTimeAxis}, {@link timeTicks},
 *    {@link ganttLane} — one lane per robot, grouped per mission;
 *  - the **route graph** (structure view): {@link layoutStations},
 *    {@link robotGlyphX} — a "metro line" per robot with waypoints as stations;
 *
 * plus the header's {@link overallProgress}. No React, no DOM: every number the
 * SVG draws comes from here, so it is unit-tested.
 */

// ---------------------------------------------------------------------------
// Overall progress
// ---------------------------------------------------------------------------

/**
 * One task's completed fraction (0..1), or null when unknown.
 *
 * Precedence: a COMPLETED task is 1; the producer's `progress`; `1 −
 * remaining_m / path length`; the waypoint ratio. A v1 task is null.
 */
export function taskFraction(task: FeedbackTask): number | null {
	if (task.state === TaskState.COMPLETED) return 1;
	if (task.progress != null) return task.progress;
	const length = taskDistanceMeters(task);
	if (task.remaining_m != null && length > 0) {
		return Math.min(1, Math.max(0, 1 - task.remaining_m / length));
	}
	const p = taskProgress(task);
	return p.known && p.total > 0 ? p.done / p.total : null;
}

/**
 * Mission progress across robots, weighted by each robot's path length (a robot
 * with 2 km to drive counts more than one with 50 m). Tasks with unknown
 * progress are left out; with no path lengths at all it is the plain mean.
 *
 * @param tasks - The mission's tasks.
 * @returns 0..1, or null when no task reports progress.
 */
export function overallProgress(tasks: FeedbackTask[]): number | null {
	let weighted = 0;
	let weight = 0;
	let sum = 0;
	let count = 0;
	for (const task of tasks) {
		const f = taskFraction(task);
		if (f == null) continue;
		const length = taskDistanceMeters(task);
		weighted += f * length;
		weight += length;
		sum += f;
		count += 1;
	}
	if (count === 0) return null;
	return weight > 0 ? weighted / weight : sum / count;
}

/**
 * The mission's projected end: the latest `eta_end` of its unfinished tasks.
 * @param fb - The feedback.
 * @returns An ISO time, or null.
 */
export function missionEtaEnd(fb: MissionFeedback): string | null {
	let best: string | null = null;
	let bestMs = -Infinity;
	for (const t of fb.tasks) {
		if (t.ended_at || !t.eta_end) continue;
		const ms = parseTime(t.eta_end);
		if (ms != null && ms > bestMs) {
			bestMs = ms;
			best = t.eta_end;
		}
	}
	return best;
}

// ---------------------------------------------------------------------------
// Time axis (Gantt)
// ---------------------------------------------------------------------------

/** A time range in epoch ms. */
export interface TimeRange {
	start: number;
	end: number;
}

/** Statuses that (re)initialise a mission: a new run starts at the last one. */
const RUN_START_STATUSES = new Set<MissionStatus>([
	MissionStatus.NONE,
	MissionStatus.PLANNED,
	MissionStatus.PLANNED_ALTERNATIVE,
	MissionStatus.PLANNED_FAILED,
]);

/**
 * When the mission's CURRENT run began, in ms.
 *
 * A mission that was stopped and re-planned keeps its whole `status_history`,
 * so fitting the axis to all of it squeezed the current run into the right
 * edge. The run begins at the last (re)initialisation — the last NONE / PLANNED
 * entry that comes after an earlier run's statuses, i.e. the last planning
 * entry whose predecessor is not itself a planning status (a PLANNED →
 * PLANNED_ALTERNATIVE pair is one initialisation, not two). Without history,
 * the earliest `dispatched_at` of the tasks. Null when neither is known.
 *
 * @param fb - The feedback.
 * @returns Start of the current run in ms, or null.
 */
export function currentRunStart(fb: MissionFeedback): number | null {
	const history = fb.status_history ?? [];
	for (let i = history.length - 1; i >= 0; i--) {
		const h = history[i]!;
		if (!RUN_START_STATUSES.has(h.status)) continue;
		// Walk back over a contiguous block of planning statuses to its start.
		let j = i;
		while (j > 0 && RUN_START_STATUSES.has(history[j - 1]!.status)) j--;
		const at = parseTime(history[j]!.at);
		if (at != null) return at;
		break;
	}
	let best: number | null = null;
	for (const t of fb.tasks) {
		const d = parseTime(t.dispatched_at);
		if (d != null && (best == null || d < best)) best = d;
	}
	return best;
}

/**
 * Whether the mission has history from BEFORE its current run (so the widget
 * can offer "show earlier runs").
 * @param fb - The feedback.
 * @returns True when some status change predates the current run.
 */
export function hasEarlierRuns(fb: MissionFeedback): boolean {
	const start = currentRunStart(fb);
	if (start == null) return false;
	return (fb.status_history ?? []).some((h) => {
		const at = parseTime(h.at);
		return at != null && at < start;
	});
}

/** Every time a mission's timeline can place, in ms. */
function missionTimes(fb: MissionFeedback): number[] {
	const out: number[] = [];
	const push = (iso: string | null | undefined) => {
		const ms = parseTime(iso);
		if (ms != null) out.push(ms);
	};
	push(fb.started_at);
	push(fb.ended_at);
	for (const h of fb.status_history ?? []) push(h.at);
	for (const t of fb.tasks) {
		push(t.dispatched_at);
		push(t.started_at);
		push(t.ended_at);
		push(t.eta_end);
		for (const w of t.waypoints) push(w.reached_at);
	}
	return out;
}

/** Shortest range the axis shows, so a mission a few seconds old is legible. */
export const MIN_AXIS_SPAN_MS = 60_000;

/**
 * Fit the Gantt's time axis to a set of missions.
 *
 * From the earliest time any of them reports — within each mission's CURRENT
 * run ({@link currentRunStart}) unless `earlierRuns` — to the latest of (every
 * reported time, and `now` while any of them is active), padded 3 % each side and at
 * least {@link MIN_AXIS_SPAN_MS} wide (widened to the right). Null when no
 * mission carries a single time (a v1 producer): there is nothing to place.
 *
 * @param missions - The missions on the chart.
 * @param now - The current time in ms.
 * @returns The range, or null.
 */
export function fitTimeAxis(
	missions: MissionFeedback[],
	now: number,
	options: { earlierRuns?: boolean } = {},
): TimeRange | null {
	let min = Infinity;
	let max = -Infinity;
	let anyActive = false;
	for (const fb of missions) {
		// Only the current run, unless the operator asked for earlier ones.
		const from = options.earlierRuns ? null : currentRunStart(fb);
		for (const ms of missionTimes(fb)) {
			if (from != null && ms < from) continue;
			if (ms < min) min = ms;
			if (ms > max) max = ms;
		}
		if (missionPhase(fb.status) === "active") anyActive = true;
	}
	if (!Number.isFinite(min)) return null;
	if (anyActive && now > max) max = now;
	let span = Math.max(max - min, 0);
	if (span < MIN_AXIS_SPAN_MS) {
		max = min + MIN_AXIS_SPAN_MS;
		span = MIN_AXIS_SPAN_MS;
	}
	const pad = span * 0.03;
	return { start: min - pad, end: max + pad };
}

/** Candidate tick steps, in ms. */
const TICK_STEPS_MS = [
	5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000,
	1_800_000, 3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000,
	86_400_000,
];

/**
 * Round-number tick times inside a range: the smallest step from a fixed ladder
 * (5 s … 1 day) that yields at most `maxTicks` ticks, aligned to multiples of
 * the step (local midnight-agnostic: epoch multiples, which are whole minutes
 * and hours in every whole-hour time zone).
 *
 * @param range - The axis range.
 * @param maxTicks - The most ticks that fit (≥ 1).
 * @returns Tick times in ms, ascending.
 */
export function timeTicks(range: TimeRange, maxTicks: number): number[] {
	const span = range.end - range.start;
	if (!(span > 0)) return [];
	const limit = Math.max(1, Math.floor(maxTicks));
	const step =
		TICK_STEPS_MS.find((s) => span / s <= limit) ??
		TICK_STEPS_MS[TICK_STEPS_MS.length - 1]!;
	const out: number[] = [];
	for (
		let t = Math.ceil(range.start / step) * step;
		t <= range.end;
		t += step
	) {
		out.push(t);
	}
	return out;
}

/**
 * Map a time to an x position.
 * @param t - Time in ms.
 * @param range - The axis range.
 * @param width - The plot width in px.
 * @returns x in px (unclamped).
 */
export function timeToX(t: number, range: TimeRange, width: number): number {
	return ((t - range.start) / (range.end - range.start)) * width;
}

/** One robot's lane on the Gantt, in ms (null parts are not drawn). */
export interface GanttLane {
	/** Dispatch → start wait, drawn as a thin line. */
	waitFrom: number | null;
	/** Actual execution: start → end, or → now while it runs. */
	actualFrom: number | null;
	actualTo: number | null;
	/** Projection: → `eta_end`, hatched. */
	projectedTo: number | null;
	/** Waypoint reached times, with the waypoint index and stop flag. */
	ticks: { index: number; at: number; stop: boolean }[];
}

/**
 * Lay out one robot's lane.
 *
 * The actual bar runs from `started_at` to `ended_at`; while the task runs (no
 * end), to `now` if the mission is active, else to the last edge feedback — a
 * finished mission's unterminated task must not grow with the wall clock. The
 * projected part runs on to `eta_end` when that is later. A task that was only
 * dispatched draws its wait line.
 *
 * @param task - The task.
 * @param missionActive - Whether its mission is active (bars may reach `now`).
 * @param now - The current time in ms.
 * @returns The lane.
 */
export function ganttLane(
	task: FeedbackTask,
	missionActive: boolean,
	now: number,
): GanttLane {
	const dispatched = parseTime(task.dispatched_at);
	const started = parseTime(task.started_at);
	const ended = parseTime(task.ended_at);
	const eta = parseTime(task.eta_end);
	const lastSeen = parseTime(task.last_edge_feedback_at);

	let actualTo: number | null = null;
	if (started != null) {
		actualTo =
			ended ??
			(missionActive ? Math.max(now, started) : (lastSeen ?? started));
	}
	const projectedTo =
		ended == null && eta != null && actualTo != null && eta > actualTo
			? eta
			: null;
	const waitFrom =
		dispatched != null && (started == null || dispatched < started)
			? dispatched
			: null;

	const ticks: GanttLane["ticks"] = [];
	task.waypoints.forEach((w, index) => {
		const at = parseTime(w.reached_at);
		if (at != null) ticks.push({ index, at, stop: w.stop === true });
	});

	return {
		waitFrom,
		actualFrom: started,
		actualTo,
		projectedTo,
		ticks,
	};
}

// ---------------------------------------------------------------------------
// Route graph (metro line)
// ---------------------------------------------------------------------------

/** One drawn station. */
export interface Station {
	/** Waypoint index (0-based). */
	index: number;
	/** x in px. */
	x: number;
	stop: boolean;
	/** Waypoints collapsed INTO this station's leg (hidden before it). */
	collapsedBefore: number;
}

/** A laid-out metro line. */
export interface StationLayout {
	stations: Station[];
	/** x of EVERY waypoint (hidden ones interpolated), for the robot glyph. */
	xs: number[];
}

/** Share of a station's position that follows path distance (rest: uniform). */
export const DISTANCE_WEIGHT = 0.6;

/** Cumulative path distance at each waypoint, in metres. */
export function cumulativeDistances(task: FeedbackTask): number[] {
	const out: number[] = [];
	let total = 0;
	task.waypoints.forEach((w, i) => {
		const prev = task.waypoints[i - 1];
		if (prev) total += haversineMeters(prev.lngLat, w.lngLat);
		out.push(total);
	});
	return out;
}

/**
 * Choose which waypoints are drawn as stations when they do not all fit.
 *
 * Always kept: the first and last, every stop point, the last passed and the
 * next waypoint (where the robot is), and every `k`-th waypoint with
 * `k = ceil(n / maxStations)`. Returned ascending.
 *
 * @param n - Waypoint count.
 * @param maxStations - How many stations fit.
 * @param stops - Indices of stop points.
 * @param currentIndex - The next waypoint, or null.
 * @returns The kept indices.
 */
export function selectStations(
	n: number,
	maxStations: number,
	stops: number[],
	currentIndex: number | null,
): number[] {
	if (n <= 0) return [];
	if (n <= maxStations) return Array.from({ length: n }, (_, i) => i);
	const keep = new Set<number>([0, n - 1, ...stops]);
	if (currentIndex != null) {
		keep.add(currentIndex);
		if (currentIndex > 0) keep.add(currentIndex - 1);
	}
	const k = Math.ceil(n / Math.max(2, maxStations));
	for (let i = 0; i < n; i += k) keep.add(i);
	return [...keep].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
}

/**
 * Lay out a robot's metro line across `width` px.
 *
 * Stations are spaced by path distance ({@link DISTANCE_WEIGHT}, blended with
 * uniform spacing), with at least `minGap`
 * px between neighbours (a cluster of close waypoints is pushed apart rather
 * than drawn on top of each other); when that overflows the width, the whole
 * line is compressed back into it. When there are more waypoints than fit at
 * `minGap`, only {@link selectStations} are drawn and the rest are collapsed
 * into the following station's leg (`collapsedBefore`). With no usable distance
 * (identical points) spacing is uniform.
 *
 * @param task - The task.
 * @param width - Drawable width in px.
 * @param minGap - Minimum px between drawn stations.
 * @returns The stations and every waypoint's x.
 */
export function layoutStations(
	task: FeedbackTask,
	width: number,
	minGap = 14,
): StationLayout {
	const n = task.waypoints.length;
	if (n === 0) return { stations: [], xs: [] };
	if (n === 1) {
		return {
			stations: [
				{
					index: 0,
					x: 0,
					stop: task.waypoints[0]!.stop === true,
					collapsedBefore: 0,
				},
			],
			xs: [0],
		};
	}
	const cum = cumulativeDistances(task);
	const total = cum[n - 1]!;
	// Mostly proportional to path distance, blended with uniform spacing so a
	// cluster of close waypoints (typically at the start) does not pile up and
	// then shove everything after it to the right.
	const prop = (i: number) => {
		const uniform = i / (n - 1);
		const distance = total > 0 ? cum[i]! / total : uniform;
		return (
			(DISTANCE_WEIGHT * distance + (1 - DISTANCE_WEIGHT) * uniform) *
			width
		);
	};

	const maxStations = Math.max(2, Math.floor(width / minGap) + 1);
	const stops = task.waypoints
		.map((w, i) => (w.stop === true ? i : -1))
		.filter((i) => i >= 0);
	const kept = selectStations(
		n,
		maxStations,
		stops,
		taskProgress(task).currentIndex,
	);

	// Proportional, then pushed apart to the minimum gap, then compressed back.
	const keptX = kept.map(prop);
	for (let j = 1; j < keptX.length; j++) {
		keptX[j] = Math.max(keptX[j]!, keptX[j - 1]! + minGap);
	}
	const last = keptX[keptX.length - 1]!;
	if (last > width && last > 0) {
		for (let j = 0; j < keptX.length; j++)
			keptX[j] = (keptX[j]! * width) / last;
	}

	// Every waypoint's x: kept ones as placed; hidden ones interpolated between
	// their kept neighbours by path distance.
	const xs = new Array<number>(n).fill(0);
	for (let j = 0; j < kept.length; j++) {
		xs[kept[j]!] = keptX[j]!;
		const next = kept[j + 1];
		if (next == null) continue;
		const a = kept[j]!;
		const span = cum[next]! - cum[a]!;
		for (let i = a + 1; i < next; i++) {
			const f =
				span > 0 ? (cum[i]! - cum[a]!) / span : (i - a) / (next - a);
			xs[i] = keptX[j]! + f * (keptX[j + 1]! - keptX[j]!);
		}
	}

	const stations: Station[] = kept.map((index, j) => ({
		index,
		x: keptX[j]!,
		stop: task.waypoints[index]!.stop === true,
		collapsedBefore: j === 0 ? 0 : index - kept[j - 1]! - 1,
	}));
	return { stations, xs };
}

/**
 * Where the robot glyph sits on its metro line, in px.
 *
 * Between the last passed waypoint and the next one, at the fraction of that
 * leg already driven: `1 − distance_to_next_m / leg length` (clamped). Without a
 * distance it sits mid-leg; before the first waypoint, at the start; on a
 * completed task, at the end. Null when progress is unknown (v1): no glyph.
 *
 * @param task - The task.
 * @param xs - Every waypoint's x (from {@link layoutStations}).
 * @returns x in px, or null.
 */
export function robotGlyphX(task: FeedbackTask, xs: number[]): number | null {
	const n = xs.length;
	if (n === 0) return null;
	const p = taskProgress(task);
	if (!p.known) return null;
	if (task.state === TaskState.COMPLETED || p.currentIndex == null) {
		return p.done >= n ? xs[n - 1]! : null;
	}
	const next = p.currentIndex;
	if (next === 0) return xs[0]!;
	const prev = next - 1;
	const a = task.waypoints[prev]!;
	const b = task.waypoints[next]!;
	const leg = haversineMeters(a.lngLat, b.lngLat);
	let f = 0.5;
	if (task.distance_to_next_m != null && leg > 0) {
		f = 1 - task.distance_to_next_m / leg;
	}
	f = Math.min(1, Math.max(0, f));
	return xs[prev]! + f * (xs[next]! - xs[prev]!);
}

// ---------------------------------------------------------------------------
// Status tone (shared by the pill and the Gantt markers)
// ---------------------------------------------------------------------------

/** Colour family of a mission status — same families as the lifecycle panel. */
export type StatusTone =
	"neutral" | "info" | "active" | "warn" | "fail" | "done";

/**
 * The colour family for a mission status: started = active (green), accepted /
 * planned = info, paused / planned-alternative = warn, failed = fail,
 * completed = done, the rest neutral.
 */
export function statusTone(
	status: MissionStatus | null | undefined,
): StatusTone {
	switch (status) {
		case MissionStatus.STARTED:
			return "active";
		case MissionStatus.ACCEPTED:
		case MissionStatus.PLANNED:
			return "info";
		case MissionStatus.PAUSED:
		case MissionStatus.PLANNED_ALTERNATIVE:
			return "warn";
		case MissionStatus.FAILED:
		case MissionStatus.PLANNED_FAILED:
			return "fail";
		case MissionStatus.COMPLETED:
			return "done";
		default:
			return "neutral";
	}
}

// ---------------------------------------------------------------------------
// De-cluttering and scale
// ---------------------------------------------------------------------------

/** A group of markers drawn as one. */
export interface MarkerCluster<T> {
	/** x of the drawn marker (the first member's x). */
	x: number;
	members: T[];
}

/**
 * Merge markers closer than `minPx` into one drawn marker (its tooltip lists
 * them all). Markers are taken in x order; a marker joins the current cluster
 * when it is within `minPx` of the cluster's FIRST marker, so a long run of
 * evenly spaced markers still breaks into several clusters.
 *
 * @param markers - Markers with an x in px.
 * @param minPx - Merge distance.
 * @returns Clusters in x order.
 */
export function clusterMarkers<T extends { x: number }>(
	markers: T[],
	minPx: number,
): MarkerCluster<T>[] {
	const sorted = [...markers].sort((a, b) => a.x - b.x);
	const out: MarkerCluster<T>[] = [];
	for (const m of sorted) {
		const last = out[out.length - 1];
		if (last && m.x - last.x < minPx) last.members.push(m);
		else out.push({ x: m.x, members: [m] });
	}
	return out;
}

/** Lane order by task state: moving first, finished last. */
const LANE_RANK: Record<number, number> = {
	[TaskState.STARTED]: 0,
	[TaskState.PAUSED]: 1,
	[TaskState.STOPPED]: 2,
	[TaskState.ABORTED]: 3,
	[TaskState.COMPLETED]: 4,
	[TaskState.DELETED]: 5,
};

/**
 * Order a mission's robot lanes: driving, then paused, not started, aborted,
 * completed, deleted; unknown state (v1) keeps its place after the known ones.
 * Stable within a rank.
 *
 * @param tasks - The tasks.
 * @returns A new, sorted array.
 */
export function sortLanes(tasks: FeedbackTask[]): FeedbackTask[] {
	return tasks
		.map((task, i) => ({ task, i }))
		.sort((a, b) => {
			const ra =
				a.task.state != null ? (LANE_RANK[a.task.state] ?? 6) : 7;
			const rb =
				b.task.state != null ? (LANE_RANK[b.task.state] ?? 6) : 7;
			return ra - rb || a.i - b.i;
		})
		.map(({ task }) => task);
}

/**
 * Whether a route is too long to draw station by station at `width`, and
 * should use the compact track + the zoomed strip instead.
 *
 * @param n - Waypoint count.
 * @param width - Drawable width in px.
 * @param minGap - Minimum px per station.
 * @returns True for the compact form.
 */
export function needsCompactRoute(
	n: number,
	width: number,
	minGap = 16,
): boolean {
	return n > Math.max(2, Math.floor(width / minGap) + 1);
}

/** The compact whole-route track: fractions of the path, 0..1. */
export interface RouteTrack {
	/** Passed waypoints. */
	passed: number;
	/** Waypoints still ahead (including the next one). */
	remaining: number;
	total: number;
	/** How far along the path the robot is, 0..1, or null when unknown. */
	robot: number | null;
	/** Stop points: waypoint index and its path fraction. */
	stops: { index: number; at: number }[];
}

/**
 * Summarise a route for the compact track. Positions are fractions of the path
 * length (uniform when the path has no length). Counts are exact — nothing is
 * aggregated away.
 *
 * @param task - The task.
 * @returns The track.
 */
export function routeTrack(task: FeedbackTask): RouteTrack {
	const n = task.waypoints.length;
	const cum = cumulativeDistances(task);
	const total = cum[n - 1] ?? 0;
	const frac = (i: number) =>
		total > 0 ? cum[i]! / total : n > 1 ? i / (n - 1) : 0;
	const p = taskProgress(task);
	const xs = task.waypoints.map((_, i) => frac(i));
	const robot = robotGlyphX(task, xs);
	return {
		passed: p.known ? p.done : 0,
		remaining: p.known ? n - p.done : n,
		total: n,
		robot,
		stops: task.waypoints
			.map((w, i) => (w.stop === true ? { index: i, at: frac(i) } : null))
			.filter((v): v is { index: number; at: number } => v != null),
	};
}

/** The zoomed strip around the robot. */
export interface StationWindow {
	/** Waypoint indices shown, ascending. */
	indices: number[];
	/** Waypoints before the window (not shown). */
	hiddenBefore: number;
	/** Waypoints after the window (not shown). */
	hiddenAfter: number;
}

/**
 * The few stations around the robot: `before` passed ones and `after` ahead
 * (the next one first), clamped to the route and shifted so the window keeps
 * its full size at either end. With unknown progress, the first stations.
 *
 * @param task - The task.
 * @param before - Passed stations to show.
 * @param after - Stations ahead to show (including the next one).
 * @returns The window.
 */
export function stationWindow(
	task: FeedbackTask,
	before = 3,
	after = 5,
): StationWindow {
	const n = task.waypoints.length;
	const size = Math.min(n, before + after);
	const p = taskProgress(task);
	const pivot = !p.known ? 0 : (p.currentIndex ?? n);
	let start = Math.max(0, pivot - before);
	if (start + size > n) start = Math.max(0, n - size);
	const indices = Array.from({ length: size }, (_, i) => start + i);
	return {
		indices,
		hiddenBefore: start,
		hiddenAfter: Math.max(0, n - (start + size)),
	};
}
