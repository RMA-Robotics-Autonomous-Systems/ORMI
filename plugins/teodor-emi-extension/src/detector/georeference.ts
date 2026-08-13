/**
 * Placing a detection on the ground, and the equirectangular projection the
 * whole toolchain gates in.
 *
 * Ported from `emi_ws/tools/report/detector.js` and `serve.py`'s `to_enu`.
 */

import type { AtrMode, Detection, GeoDetection } from "./detector-types";
import type { EmiRun } from "./run-types";
import type { GnssFrame, YawAt } from "./params";

/** Earth radius used by the tracker's `geo_distance`, metres. */
export const EARTH_RADIUS = 6378137.0;

/**
 * Equirectangular projection to local metres.
 *
 * Same formula as the C++ tracker's `geo_distance`, so a Euclidean distance in
 * this frame equals the distance the node would compute — association can gate
 * in plain metres without re-deriving anything.
 *
 * @param lat - Latitude in degrees.
 * @param lon - Longitude in degrees.
 * @param lat0 - Origin latitude in degrees.
 * @param lon0 - Origin longitude in degrees.
 * @returns `[east, north]` in metres.
 */
export function toEnu(
	lat: number,
	lon: number,
	lat0: number,
	lon0: number,
): [number, number] {
	const rad = Math.PI / 180;
	const x = (lon - lon0) * rad * Math.cos(lat0 * rad) * EARTH_RADIUS;
	const y = (lat - lat0) * rad * EARTH_RADIUS;
	return [x, y];
}

/**
 * Inverse of {@link toEnu}.
 *
 * @param x - Easting in metres.
 * @param y - Northing in metres.
 * @param lat0 - Origin latitude in degrees.
 * @param lon0 - Origin longitude in degrees.
 * @returns `[latitude, longitude]` in degrees.
 */
export function fromEnu(
	x: number,
	y: number,
	lat0: number,
	lon0: number,
): [number, number] {
	const rad = Math.PI / 180;
	const lat = lat0 + y / EARTH_RADIUS / rad;
	const lon = lon0 + x / (EARTH_RADIUS * Math.cos(lat0 * rad)) / rad;
	return [lat, lon];
}

/** Inputs `georeference` reads beyond the run itself. */
export interface GeoConfig {
	mode: AtrMode;
	yawAt: YawAt;
	/**
	 * Frame the coil offsets were resolved against — the frame the pose columns
	 * are the origin of.
	 *
	 * Not read by {@link georeference} itself, which is handed offsets already
	 * resolved. It travels with the result so that anything *drawing* the pose
	 * can put the robot on the same origin the placement used; a ghost drawn in
	 * `base_link` against a fix that is `xsens_link` is displaced by the lever
	 * arm, which is exactly the quantity this choice exists to expose.
	 */
	frame: GnssFrame;
}

/**
 * Place each detection in local metres, rotating the coil offset by yaw.
 *
 * No search is needed: the run has the fix, the orientation and the sigma
 * resolved onto every EMI sample time, so a detection's position is an array
 * index away.
 *
 * @param dets - Detections from the ATR or MAD stage.
 * @param run - The run they were detected in.
 * @param offsets - Coil offsets keyed by coil id, `[x, y]` in metres.
 * @param p - Which sample supplies position and orientation.
 * @returns Georeferenced detections; coils without a known offset are dropped.
 */
/**
 * Which samples a detection's position and heading are read from.
 *
 * Exported because more than one place needs *the same* answer. Anything
 * drawing the pose a detection was placed from — the map's robot ghosts, above
 * all — must resolve it identically, or the raising coil does not land on the
 * detection's own mark and the drawing quietly contradicts the placement it
 * exists to check. That is not a hypothetical: the ghosts read `iPeak` for both
 * and were wrong under every preset that takes orientation at release, which is
 * what the robot itself does.
 *
 * @param d - The detection.
 * @param p - Detector mode and orientation choice.
 * @returns Sample indices for the position and for the heading.
 */
export function poseIndices(
	d: Pick<Detection, "iPeak" | "iRel" | "iPub">,
	p: GeoConfig,
): { iPos: number; iYaw: number } {
	const iPos = p.mode === "legacy" ? d.iPub : d.iPeak;
	return { iPos, iYaw: p.yawAt === "release" ? d.iRel : iPos };
}

export function georeference(
	dets: Detection[],
	run: EmiRun,
	offsets: Map<number, readonly [number, number]>,
	p: GeoConfig,
): GeoDetection[] {
	const out: GeoDetection[] = [];
	for (const d of dets) {
		const { iPos, iYaw } = poseIndices(d, p);
		const off = offsets.get(d.coil);
		if (!off) continue;
		const yaw = run.yaw[iYaw];
		// Without a heading there is no way to rotate the coil offset, and a
		// NaN here would propagate into x/y and then into every downstream
		// distance as a comparison that is quietly false. Dropping the
		// detection is the same choice made for a coil with no known offset,
		// one line up.
		if (yaw === undefined || !Number.isFinite(yaw)) continue;
		const cy = Math.cos(yaw);
		const sy = Math.sin(yaw);
		out.push({
			...d,
			t: run.t[iPos]!,
			x: run.sx[iPos]! + cy * off[0] - sy * off[1],
			y: run.sy[iPos]! + sy * off[0] + cy * off[1],
			sigma: run.sigma[iPos]!,
			targetId: -1,
		});
	}
	return out;
}

/**
 * Coil offsets in the requested frame.
 *
 * The run stores offsets relative to `emi_link` as the messages carry them;
 * `xsens_link` additionally removes the GNSS antenna lever arm, which is the
 * difference the georeferencing choice exposes. The lever arm is a property of
 * the robot, taken from the run.
 *
 * @param run - The run supplying the offsets.
 * @param frame - Frame the offsets should be resolved against.
 * @param leverArm - `[x, y]` of the antenna relative to the body frame.
 * @returns Offsets keyed by coil id.
 */
export function offsetsForFrame(
	run: EmiRun,
	frame: "xsens_link" | "base_link",
	leverArm: readonly [number, number],
): Map<number, readonly [number, number]> {
	const out = new Map<number, readonly [number, number]>();
	const shiftX = frame === "xsens_link" ? leverArm[0] : 0;
	const shiftY = frame === "xsens_link" ? leverArm[1] : 0;
	for (let c = 0; c < run.ncoil; c++) {
		out.set(run.coilIds[c]!, [
			run.offsets[c * 3]! - shiftX,
			run.offsets[c * 3 + 1]! - shiftY,
		]);
	}
	return out;
}
