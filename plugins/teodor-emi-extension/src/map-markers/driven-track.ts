/**
 * The path the robot drove, as polylines.
 *
 * Pure and separate from the layer that draws it, because the two rules below
 * are the whole of the layer's correctness and neither is visible in a
 * screenshot: a track that silently bridges a dropout looks exactly like a track
 * that does not.
 */

import { fromEnu } from "../detector/georeference";
import type { EmiRun } from "../detector/run-types";

/**
 * Ground distance below which a fix is not worth its own vertex, metres.
 *
 * A survey runs at a couple of centimetres per sample, so a full-rate track is
 * tens of thousands of vertices describing a shape a tenth of that draws
 * identically. Well under the coil spacing (0.4 m), so nothing the map is asked
 * to judge can be changed by the thinning.
 */
export const TRACK_STEP_M = 0.15;

/**
 * Jump between consecutive fixes that breaks the line rather than being drawn,
 * metres.
 *
 * The robot does not teleport. A step this large means the fix was lost and came
 * back somewhere else, and joining the two ends draws a straight line across
 * ground that was never surveyed — which on a coverage map is not a cosmetic
 * problem, it is the map asserting the opposite of what happened.
 */
export const TRACK_BREAK_M = 5;

/**
 * Break the run's fix track into drawable stretches.
 *
 * @param run - The run supplying `sx`/`sy` and the projection origin.
 * @param n - Samples resolved so far; passed in rather than read off the run so
 * a growing mission re-evaluates (the run object's identity never changes).
 * @returns One `[lon, lat]` polyline per continuous stretch; stretches of fewer
 * than two vertices are dropped, since a single point is not a path.
 */
export function drivenTrack(
	run: EmiRun,
	n: number,
): Array<Array<[number, number]>> {
	const lines: Array<Array<[number, number]>> = [];
	let line: Array<[number, number]> = [];
	// The last *vertex kept* and the last *sample seen*, which are different
	// points: the break test is about consecutive fixes, and measuring it from
	// the last kept vertex would read ordinary thinning as a jump.
	let lastX = NaN;
	let lastY = NaN;
	let prevX = NaN;
	let prevY = NaN;

	const close = () => {
		if (line.length > 1) lines.push(line);
		line = [];
		lastX = NaN;
		lastY = NaN;
	};

	for (let i = 0; i < n; i++) {
		const x = run.sx[i]!;
		const y = run.sy[i]!;
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			close();
			prevX = NaN;
			prevY = NaN;
			continue;
		}
		if (
			Number.isFinite(prevX) &&
			Math.hypot(x - prevX, y - prevY) > TRACK_BREAK_M
		) {
			close();
		}
		prevX = x;
		prevY = y;
		if (
			line.length > 0 &&
			Math.hypot(x - lastX, y - lastY) < TRACK_STEP_M
		) {
			continue;
		}
		const [lat, lon] = fromEnu(x, y, run.originLat, run.originLon);
		line.push([lon, lat]);
		lastX = x;
		lastY = y;
	}
	// The tail of a growing mission is a partial stretch, not a discard.
	close();

	return lines;
}
