import { FeedbackTask } from "../types/mission-feedback";

/**
 * Pure helpers for the mission **plan** — per-vehicle attribution and plan-level
 * metrics shared by the map overlay (route colour) and the feedback task list
 * (colour swatch + distance/duration). Keeping these pure and module-level lets
 * the SAME {@link vehicleColor} feed both surfaces, so a robot's route colour on
 * the map matches its swatch in the list — the linchpin of "what robot does
 * what".
 *
 * Everything here degrades honestly: a vehicle's `eta`/`est` may be null/absent,
 * so {@link taskDurationSeconds} returns null rather than guessing; distance is a
 * geometric sum over the waypoints we have. No React — pure data.
 *
 * ⚠ COORDINATE RULE — distance reads `waypoint.lngLat` ([lng, lat], already
 * swapped by S2). NEVER use `coordinates` ([lat, lng] raw); NEVER re-swap.
 */

/**
 * A fixed, deterministic palette for per-vehicle attribution. Chosen for
 * distinctness on the map base layers and the dark/light task list. The colour
 * for a vehicle is `PALETTE[hash(id) % PALETTE.length]`, so it is stable across
 * renders and identical in every widget that calls {@link vehicleColor}.
 */
const VEHICLE_PALETTE = [
	"#2563eb", // blue
	"#16a34a", // green
	"#db2777", // pink
	"#d97706", // amber
	"#7c3aed", // violet
	"#0891b2", // cyan
	"#dc2626", // red
	"#65a30d", // lime
	"#c026d3", // fuchsia
	"#0d9488", // teal
] as const;

/**
 * Deterministic, stable colour for a vehicle id.
 *
 * Hashes the id (FNV-1a-style, order-sensitive) to a palette index, so the same
 * id always yields the same colour and different ids spread across the palette.
 * An empty/missing id falls back to the first palette entry rather than
 * throwing. This SAME function feeds the map route `line-color` and the
 * task-list swatch — do not introduce a second colour source.
 *
 * @param vehicleId - The vehicle's id.
 * @returns A hex colour string from {@link VEHICLE_PALETTE}.
 */
export function vehicleColor(vehicleId: string): string {
	if (!vehicleId) return VEHICLE_PALETTE[0];
	let hash = 0x811c9dc5;
	for (let i = 0; i < vehicleId.length; i++) {
		hash ^= vehicleId.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	const index = (hash >>> 0) % VEHICLE_PALETTE.length;
	return VEHICLE_PALETTE[index] ?? VEHICLE_PALETTE[0];
}

/** Earth mean radius in metres (haversine). */
const EARTH_RADIUS_M = 6_371_008.8;

/** Degrees → radians. */
function toRadians(deg: number): number {
	return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance in metres between two `[lng, lat]` points (haversine).
 * @param a - Start `[lng, lat]`.
 * @param b - End `[lng, lat]`.
 * @returns Distance in metres.
 */
function haversineMeters(a: [number, number], b: [number, number]): number {
	const [lng1, lat1] = a;
	const [lng2, lat2] = b;
	const dLat = toRadians(lat2 - lat1);
	const dLng = toRadians(lng2 - lng1);
	const sinLat = Math.sin(dLat / 2);
	const sinLng = Math.sin(dLng / 2);
	const h =
		sinLat * sinLat +
		Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinLng * sinLng;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Total route length of a task: the haversine sum over consecutive waypoint
 * `lngLat` pairs. A task with fewer than two waypoints has length 0. Non-finite
 * coordinates are skipped defensively.
 *
 * @param task - The feedback task.
 * @returns Route length in metres.
 */
export function taskDistanceMeters(task: FeedbackTask): number {
	const pts = task.waypoints
		.map((w) => w.lngLat)
		.filter(
			(p): p is [number, number] =>
				Array.isArray(p) &&
				Number.isFinite(p[0]) &&
				Number.isFinite(p[1]),
		);
	let total = 0;
	for (let i = 1; i < pts.length; i++) {
		const prev = pts[i - 1];
		const cur = pts[i];
		if (prev && cur) total += haversineMeters(prev, cur);
	}
	return total;
}

/**
 * Parse a waypoint `eta` into epoch milliseconds.
 *
 * C2 serializes `eta`/`est` via `Isotime::ToIso8601` (`%FT%TZ` over `gmtime`), so
 * the wire value is always a `T`-separated ISO-8601 UTC timestamp
 * (e.g. `2026-06-25T07:11:00Z`), which `Date.parse` handles natively. Returns
 * null when the value is missing or unparseable so callers degrade rather than
 * guess.
 *
 * @param eta - The waypoint `eta` (ISO-8601 string, null, or undefined).
 * @returns Epoch milliseconds, or null.
 */
function parseEtaMillis(eta: string | null | undefined): number | null {
	if (eta == null) return null;
	const trimmed = eta.trim();
	if (trimmed === "") return null;
	const ms = Date.parse(trimmed);
	return Number.isNaN(ms) ? null : ms;
}

/**
 * Duration of a task in seconds, from the first vs last waypoint `eta`.
 *
 * Returns null unless BOTH the first and last waypoint `eta` parse as ISO-8601
 * times. Never negative — a non-monotonic pair yields the absolute span.
 * Degrades to null rather than fabricating a value.
 *
 * @param task - The feedback task.
 * @returns Duration in seconds, or null when it can't be derived.
 */
export function taskDurationSeconds(task: FeedbackTask): number | null {
	const wps = task.waypoints;
	const first = wps[0];
	const last = wps[wps.length - 1];
	if (!first || !last || first === last) return null;
	const start = parseEtaMillis(first.eta);
	const end = parseEtaMillis(last.eta);
	if (start == null || end == null) return null;
	return Math.abs(end - start) / 1000;
}

/** Plan-level rollup across all per-vehicle tasks. */
export interface PlanSummary {
	/** Number of vehicles (tasks) in the plan. */
	vehicleCount: number;
	/** Sum of every task's route length, in metres. */
	totalDistanceMeters: number;
	/**
	 * Makespan: the longest per-vehicle duration (the plan finishes when the
	 * slowest vehicle does). Null when no task has a derivable duration.
	 */
	makespanSeconds: number | null;
}

/**
 * Roll a set of per-vehicle tasks up into a plan summary.
 *
 * `makespanSeconds` is the MAX per-vehicle duration (not the sum) because
 * vehicles execute in parallel; it is null only when no task yields a duration.
 *
 * @param tasks - The feedback tasks.
 * @returns The plan summary.
 */
export function planSummary(tasks: FeedbackTask[]): PlanSummary {
	let totalDistanceMeters = 0;
	let makespanSeconds: number | null = null;
	for (const task of tasks) {
		totalDistanceMeters += taskDistanceMeters(task);
		const dur = taskDurationSeconds(task);
		if (dur != null) {
			makespanSeconds =
				makespanSeconds == null ? dur : Math.max(makespanSeconds, dur);
		}
	}
	return {
		vehicleCount: tasks.length,
		totalDistanceMeters,
		makespanSeconds,
	};
}

/**
 * Format a distance in metres for display: metres below 1 km, else kilometres
 * with one decimal. A negative/non-finite input renders as "—".
 *
 * @param meters - The distance in metres.
 * @returns A short display string (e.g. "740 m", "3.2 km").
 */
export function formatDistance(meters: number): string {
	if (!Number.isFinite(meters) || meters < 0) return "—";
	if (meters < 1000) return `${Math.round(meters)} m`;
	return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format a duration in seconds for display: `Hh Mm`, `Mm Ss`, or `Ss`. Null /
 * non-finite / negative renders as "—".
 *
 * @param seconds - The duration in seconds, or null.
 * @returns A short display string (e.g. "1h 05m", "12m 30s", "45s").
 */
export function formatDuration(seconds: number | null | undefined): string {
	if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
	const total = Math.round(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
	if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
	return `${s}s`;
}
