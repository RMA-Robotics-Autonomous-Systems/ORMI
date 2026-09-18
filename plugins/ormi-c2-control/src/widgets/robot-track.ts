import { haversineMeters } from "./plan-metrics";

/**
 * Pure helpers for the two per-robot map traces:
 *
 *  - **What the robot is planning** — the Nav2 global plan, published by the
 *    bridge on `{ns}/edge/multi_robot/autonomy_trajectory`
 *    (`autonomy_msgs/msg/AutonomyTrajectory`, whose `trajectory` is a JSON
 *    string). Only the v2 payload is geographic:
 *    `{version: 2, crs: "EPSG:4326", order: "lonlat", points: [[lon, lat], …]}`.
 *    The older `{frame_id: "map", points: …}` carries METRES under a frame label
 *    that means degrees elsewhere, so it is ignored rather than
 *    guessed at.
 *  - **Where it has been** — a client-side breadcrumb from live localization,
 *    decimated to ~0.5 m and capped, for the current session only (no backfill).
 *
 * ⚠ COORDINATE RULE — everything returned here is `[lng, lat]` (GeoJSON order).
 */

// ---------------------------------------------------------------------------
// autonomy_trajectory v2
// ---------------------------------------------------------------------------

/** Is `[lng, lat]` a plausible geographic position? */
function isLngLat(lng: number, lat: number): boolean {
	return (
		Number.isFinite(lng) &&
		Number.isFinite(lat) &&
		Math.abs(lng) <= 180 &&
		Math.abs(lat) <= 90
	);
}

/**
 * Parse an `autonomy_trajectory` message into a `[lng, lat]` polyline.
 *
 * Accepts the whole ROS message (`{ trajectory: "<json>" }`), the inner JSON
 * string, or the already-parsed object. Returns null for anything that is not a
 * v2 geographic payload: the legacy metric format, another CRS, malformed JSON,
 * or fewer than two valid points. `order: "latlon"` is swapped (cheap insurance
 * against a producer that mislabels nothing but the order); a point that is not
 * a finite, in-range pair is dropped.
 *
 * @param raw - The message, JSON string, or parsed object.
 * @returns The polyline, or null.
 */
export function parseAutonomyTrajectory(
	raw: unknown,
): [number, number][] | null {
	let payload: unknown = raw;
	if (
		payload != null &&
		typeof payload === "object" &&
		"trajectory" in payload
	) {
		payload = (payload as { trajectory: unknown }).trajectory;
	}
	if (typeof payload === "string") {
		try {
			payload = JSON.parse(payload);
		} catch {
			return null;
		}
	}
	if (payload == null || typeof payload !== "object") return null;
	const obj = payload as {
		version?: unknown;
		crs?: unknown;
		order?: unknown;
		points?: unknown;
	};
	if (obj.version !== 2) return null;
	if (obj.crs != null && obj.crs !== "EPSG:4326") return null;
	const swap = obj.order === "latlon";
	if (obj.order != null && obj.order !== "lonlat" && !swap) return null;
	if (!Array.isArray(obj.points)) return null;

	const out: [number, number][] = [];
	for (const p of obj.points) {
		if (!Array.isArray(p) || p.length < 2) continue;
		const a = p[0];
		const b = p[1];
		if (typeof a !== "number" || typeof b !== "number") continue;
		const lng = swap ? b : a;
		const lat = swap ? a : b;
		if (!isLngLat(lng, lat)) continue;
		out.push([lng, lat]);
	}
	return out.length >= 2 ? out : null;
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

/** Default breadcrumb spacing: a new point once the robot moved this far. */
export const BREADCRUMB_MIN_STEP_M = 0.5;

/**
 * Default breadcrumb length cap (points). At 0.5 m spacing that is ~2.5 km of
 * trail per robot, which covers a mission without growing without bound.
 */
export const BREADCRUMB_MAX_POINTS = 5000;

/**
 * Past this jump between two fixes the trail restarts instead of drawing a
 * straight line across the map: a relocalisation, a sim reset, or a long gap in
 * the stream is not a path the robot drove.
 */
export const BREADCRUMB_MAX_JUMP_M = 250;

/** Breadcrumb tuning. */
export interface BreadcrumbOptions {
	minStepM?: number;
	maxPoints?: number;
	maxJumpM?: number;
}

/** What {@link classifyBreadcrumbFix} decided for one fix. */
export type BreadcrumbFix = "drop" | "append" | "restart";

/**
 * Decide what one localization fix does to a breadcrumb trail, without building
 * the next trail: `"drop"` (not a valid position, or closer than `minStepM` to
 * the last kept point), `"restart"` (a jump longer than `maxJumpM` — begin a new
 * one-point trail), or `"append"`. The decision behind {@link appendBreadcrumb},
 * exposed so a store can apply it to a trail it owns without copying it per fix.
 *
 * @param trail - The trail so far, `[lng, lat]`, oldest first.
 * @param point - The new fix, `[lng, lat]`.
 * @param options - Spacing / jump tuning.
 * @returns The decision.
 */
export function classifyBreadcrumbFix(
	trail: readonly [number, number][],
	point: [number, number],
	options: BreadcrumbOptions = {},
): BreadcrumbFix {
	const minStepM = options.minStepM ?? BREADCRUMB_MIN_STEP_M;
	const maxJumpM = options.maxJumpM ?? BREADCRUMB_MAX_JUMP_M;
	if (!isLngLat(point[0], point[1])) return "drop";
	const last = trail[trail.length - 1];
	if (last) {
		const step = haversineMeters(last, point);
		if (step < minStepM) return "drop";
		if (step > maxJumpM) return "restart";
	}
	return "append";
}

/**
 * Append a localization fix to a breadcrumb trail, decimated.
 *
 * Returns the SAME array when the fix is dropped (closer than `minStepM` to the
 * last kept point, or not a valid position), so a caller can detect "no change"
 * by identity and skip a re-render. Otherwise returns a NEW array (never mutates
 * the input): the fix appended, the oldest points dropped past `maxPoints`, or a
 * fresh one-point trail after a jump longer than `maxJumpM`.
 *
 * @param trail - The trail so far, `[lng, lat]`, oldest first.
 * @param point - The new fix, `[lng, lat]`.
 * @param options - Spacing / cap / jump tuning.
 * @returns The trail (same reference when unchanged).
 */
export function appendBreadcrumb(
	trail: readonly [number, number][],
	point: [number, number],
	options: BreadcrumbOptions = {},
): [number, number][] {
	const maxPoints = options.maxPoints ?? BREADCRUMB_MAX_POINTS;
	const fix = classifyBreadcrumbFix(trail, point, options);
	if (fix === "drop") return trail as [number, number][];
	if (fix === "restart") return [point];
	const next = [...trail, point];
	if (next.length > maxPoints) next.splice(0, next.length - maxPoints);
	return next;
}
