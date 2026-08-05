import {
	MissionStatus,
	MissionStatusRequest,
	MissionBehavior,
} from "./c2-types";

/**
 * S2 — `mission_feedback` parser.
 *
 * `c2_msgs/MissionFeedback.mission_feedback` is a JSON **string**. Parse it once
 * into a typed shape. Two C2 quirks handled here:
 *  - waypoint `coordinates` are `[latitude, longitude]` — the reverse of
 *    GeoJSON/MapLibre `[longitude, latitude]`; `lngLat` exposes the swapped form.
 *  - `issue` is omitted (not `null`) when absent.
 */

export interface FeedbackWaypoint {
	/** Raw C2 order: [latitude, longitude]. */
	coordinates: [number, number];
	/** GeoJSON/MapLibre order: [longitude, latitude]. */
	lngLat: [number, number];
	average_speed?: number;
	eta?: string | null;
	orientation?: number | null;
}

export interface FeedbackTask {
	vehicle_id: string;
	est?: string | null;
	waypoints: FeedbackWaypoint[];
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
}

/**
 * A content signature of a parsed feedback's RENDERED plan: mission id, status,
 * issue, and per-task vehicle + waypoint geometry/ETA. Identical plans yield an
 * identical string.
 *
 * `mission_feedback` streams continuously, so consumers receive a fresh parsed
 * object on every message; comparing this signature lets them keep a stable
 * reference and skip rebuilding/repainting derived UI (GeoJSON, task rows) when
 * the plan hasn't actually changed.
 *
 * @param fb - The parsed feedback.
 * @returns A stable signature string for the plan content.
 */
export function feedbackPlanSignature(fb: MissionFeedback): string {
	const tasks = fb.tasks
		.map(
			(t) =>
				`${t.vehicle_id}:${t.est ?? ""}:${t.waypoints
					.map(
						(w) =>
							`${w.lngLat[0]},${w.lngLat[1]},${w.orientation ?? ""},${w.average_speed ?? ""},${w.eta ?? ""}`,
					)
					.join(";")}`,
		)
		.join("|");
	return `${fb.mission_id}|${fb.status}|${fb.issue ?? ""}|${tasks}`;
}

interface RawWaypoint {
	coordinates?: [number, number];
	average_speed?: number;
	eta?: string | null;
	orientation?: number | null;
}

interface RawTask {
	vehicle_id?: string;
	est?: string | null;
	waypoints?: RawWaypoint[];
}

interface RawFeedback {
	mission_id?: string;
	behavior?: number;
	status?: number;
	requested_status?: number;
	date?: string;
	issue?: number | null;
	tasks?: RawTask[];
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

	const tasks: FeedbackTask[] = (obj.tasks ?? []).map((t) => ({
		vehicle_id: t.vehicle_id ?? "",
		est: t.est ?? null,
		waypoints: (t.waypoints ?? [])
			.filter(
				(w) =>
					Array.isArray(w.coordinates) && w.coordinates.length >= 2,
			)
			.map((w) => {
				const [lat, lng] = w.coordinates as [number, number];
				return {
					coordinates: [lat, lng],
					lngLat: [lng, lat],
					average_speed: w.average_speed,
					eta: w.eta ?? null,
					orientation: w.orientation ?? null,
				} satisfies FeedbackWaypoint;
			}),
	}));

	return {
		mission_id: obj.mission_id,
		behavior: obj.behavior as MissionBehavior | undefined,
		status: (obj.status ?? MissionStatus.NONE) as MissionStatus,
		requested_status: obj.requested_status as
			| MissionStatusRequest
			| undefined,
		date: obj.date,
		issue: obj.issue ?? null,
		tasks,
	};
}
