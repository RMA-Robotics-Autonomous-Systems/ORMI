/**
 * W3 — the rake from above, in body frame.
 *
 * The one panel that shows the *geometry* of an association rather than its
 * result. A detection is the position of the coil that raised it at its peak, so
 * at that instant the mark sits exactly on its own coil and afterwards drifts
 * astern at survey speed. Scrubbing time therefore walks an object down the
 * panel: under the front row first, under the rear row a fraction of a second
 * later.
 *
 * Two marks that stay on top of each other as they pass are two coils agreeing
 * about where an object is. A mark that slides past a coil which stayed quiet is
 * the unpartnered case — visible here as geometry, where everywhere else in the
 * tool it is a number in a table.
 *
 * There is no analogue anywhere in ORMI: the 3D scene is a world view, the map
 * is geographic, and the transform-tree widget is a node-link schematic that is
 * deliberately not metric. This is a metric top-down of one robot's sensor.
 */

import type { EmiRun } from "../detector/run-types";
import type { EmiParams } from "../detector/params";
import { armThresholdAt, type ReplayResult } from "../detector/replay";
import type { Target } from "../detector/detector-types";
import { offsetsForFrame } from "../detector/georeference";
import type { EmiTheme } from "./emi-theme";
import {
	arrowHead,
	fmt,
	line,
	lowerBound,
	setupCanvas,
	shortNum,
} from "./canvas-chart";

/**
 * Smallest box the array can be drawn in, CSS pixels.
 *
 * Below it the scale is negative and there is nothing to show; the widget uses
 * this rather than a guess of its own, so a bail-out is never a blank canvas.
 */
export const MIN_ARRAY_PX = 2 * 26 + 26 + 40;

/** Height reserved at the bottom for the two readout lines. */
const FOOT_H = 26;
/** Margin around the rake. */
const PAD_PX = 26;
/** Range-ladder steps, coarsest that keeps rungs about a centimetre apart. */
const LADDER_STEPS = [0.25, 0.5, 1, 2, 5] as const;
/** Below this the velocity arrow is noise rather than travel, m/s. */
const MIN_ARROW_MS = 0.02;

/**
 * Ground kept in view beyond the rake, metres.
 *
 * The scale used to be fitted to the rake and nothing else, which framed the
 * subject and cropped the point: what this panel is for is watching an object
 * travel *through* the array, and at that framing an object was on screen for
 * about a second either side. Padding the fitted box trades a smaller rake for
 * several seconds of approach and several more of departure.
 *
 * Along-track and across-track are separate because the panel is not square and
 * the two directions do not mean the same thing — astern is history, beside is
 * ground the array never covered.
 */
const ASTERN_M = 1.5;
/** @see ASTERN_M */
const BESIDE_M = 0.4;

/**
 * Ground speckle spacing, metres — one mark per cell of this size.
 *
 * The speckles are anchored in **world** coordinates, not screen ones, which is
 * the whole reason they exist: the rake is held still and the ground moves under
 * it, so without something textured on the ground there is nothing on this panel
 * that visibly moves between two nearly identical frames. A pattern locked to
 * the canvas would be worse than none — it would say the ground was still.
 */
const GROUND_CELL_M = 0.18;

/** Alpha levels the speckles are quantised into, faintest first. */
const GROUND_ALPHA = [0.05, 0.09, 0.14] as const;

/** Everything one array repaint reads. */
export interface CoilArrayOptions {
	run: EmiRun;
	result: ReplayResult;
	params: EmiParams;
	theme: EmiTheme;
	leverArm: readonly [number, number];
	/** The instant to show, seconds from run start. */
	atTime: number;
	/** Index into `result.geoNew` under the pointer, or -1. */
	hoverDet: number;
	width: number;
	height: number;
}

/** What the repaint found worth saying in the footer. */
export interface CoilArrayReadout {
	/** Sample index actually drawn. */
	index: number;
	/** Detections inside the panel. */
	objects: number;
	/** Along-track distance of the hovered mark, metres astern when positive. */
	back: number | null;
	/** Age of the hovered mark, seconds. */
	ago: number | null;
}

/**
 * Draw the array.
 *
 * @param cv - The canvas.
 * @param o - Everything to draw.
 * @returns The readout, or null when there is nothing to draw.
 */
export function drawCoilArray(
	cv: HTMLCanvasElement,
	o: CoilArrayOptions,
): CoilArrayReadout | null {
	const { run, result, params, theme } = o;
	if (run.n === 0) return null;
	const surface = setupCanvas(cv, o.height, o.width);
	if (!surface) return null;
	const { ctx, w, h } = surface;

	// The SAME frame the detections were georeferenced in. Drawing the rake in
	// base_link while the objects arrive in xsens_link puts every object a lever
	// arm away from the coil that actually found it.
	const offsets = offsetsForFrame(run, params.gnssFrame, o.leverArm);
	const pts: Array<[number, number]> = [];
	for (let c = 0; c < run.ncoil; c++) {
		pts.push([...(offsets.get(run.coilIds[c]!) ?? [0, 0])] as [
			number,
			number,
		]);
	}
	if (pts.length === 0) return null;

	// Centred on the rake, not on the frame origin — in base_link the coils sit
	// most of a metre ahead of it, which would push the whole array off the top
	// of a panel whose job is to show what passes under it.
	let mx = 0;
	let my = 0;
	for (const [x, y] of pts) {
		mx += x;
		my += y;
	}
	mx /= pts.length;
	my /= pts.length;

	let xr = 0.3;
	let yr = 0.3;
	for (const [x, y] of pts) {
		xr = Math.max(xr, Math.abs(x - mx));
		yr = Math.max(yr, Math.abs(y - my));
	}

	// Screen right is starboard (−y), screen up is forward (+x).
	// Both terms include the body outline's overhang (0.25 m beyond the extreme
	// coils), or the outline is drawn off the edges and reads as a plain rule
	// rather than as the shape of a vehicle.
	const s = Math.min(
		(w - 2 * PAD_PX) / (2 * yr + 0.5 + 2 * BESIDE_M),
		(h - 2 * PAD_PX - FOOT_H) / (2 * xr + 0.5 + ASTERN_M),
	);
	if (!(s > 0) || !Number.isFinite(s)) return null;
	// Rake above centre, so most of the panel is the ground already passed —
	// which is where an object spends the seconds after it is found.
	const cx = w / 2;
	const cy = (h - FOOT_H) * 0.34;
	const X = (x: number, y: number) => cx - (y - my) * s;
	const Y = (x: number) => cy - (x - mx) * s;

	// Clamped against the *replay's* sample count, not the run's. The run is
	// appended to continuously while the replay is recomputed on a 100 ms
	// commit, so between commits `run.n` runs ahead of every column in
	// `result` — and an index past the end reads as `undefined`, which turns
	// the coil fill into a silently ignored NaN alpha.
	const nResult = Math.floor(result.value.length / Math.max(1, run.ncoil));
	const nSafe = Math.max(1, Math.min(run.n, nResult));
	const i = Math.min(
		nSafe - 1,
		Math.max(0, lowerBound(run.t, o.atTime, nSafe)),
	);
	const bottom = h - FOOT_H;

	// Under everything else: it is ground, and the rake and the objects are on
	// top of it.
	drawGround(ctx, o, i, X, Y, w, bottom, s, cx, cy, mx, my);

	// ── the range ladder ──────────────────────────────────────────────
	// So a mark drifting down the panel is a distance rather than a vague "a
	// while ago". Measured along track from the middle of the array, which is
	// the same thing the ground has travelled since the detection was raised.
	const step = LADDER_STEPS.find((v) => v * s >= 34) ?? 5;
	const rungs: Array<[string, number]> = [];
	ctx.strokeStyle = theme.grid;
	ctx.lineWidth = 1;
	for (let k = -30; k <= 30; k++) {
		if (k === 0) continue;
		const y = Y(mx + k * step);
		if (y < 12 || y > bottom - 2) continue;
		line(ctx, 4, Math.round(y) + 0.5, w - 4, Math.round(y) + 0.5);
		const d = Math.abs(k * step);
		rungs.push([`${fmt(d, d < 1 ? 2 : 1)} m`, y]);
	}

	// Body outline, so the rows read as a rake and not as scattered dots.
	ctx.strokeStyle = theme.grid;
	ctx.beginPath();
	ctx.moveTo(X(0, my + yr + 0.25), Y(mx - xr - 0.25));
	ctx.lineTo(X(0, my - yr - 0.25), Y(mx - xr - 0.25));
	ctx.stroke();

	// Travel under the coils, objects over them: an object hidden exactly when
	// it passes beneath a coil is hidden at the only moment that matters.
	drawTravel(ctx, o, i, X, Y, mx, my);

	// ── the coils ─────────────────────────────────────────────────────
	for (let c = 0; c < run.ncoil; c++) {
		const v = result.value[i * run.ncoil + c]!;
		const arm = armThresholdAt(result, params, run.ncoil, i, c);
		// Fill is the level as a fraction of this coil's OWN arm threshold, so
		// a quiet coil near its bar looks as urgent as a loud one near its bar.
		const frac = Math.max(0, Math.min(1, v / Math.max(1, arm)));
		const [ox, oy] = pts[c]!;
		const x = X(ox, oy);
		const y = Y(ox);
		const r = Math.max(9, Math.min(20, s * 0.16));
		const over = v >= arm;

		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fillStyle = theme.grid;
		ctx.fill();

		ctx.globalAlpha = 0.12 + 0.88 * frac;
		ctx.fillStyle = over ? theme.replayed : theme.signal;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 1;

		ctx.strokeStyle = over ? theme.replayed : theme.axis;
		ctx.lineWidth = over ? 2 : 1;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.stroke();

		ctx.fillStyle = theme.text;
		ctx.font = `10px ${theme.font}`;
		ctx.textAlign = "center";
		ctx.fillText(String(run.coilIds[c]), x, y + 3.5);

		ctx.fillStyle = theme.muted;
		ctx.font = `9px ${theme.font}`;
		ctx.fillText(shortNum(v), x, y + r + 10);
		if (params.detector === "mad") {
			ctx.fillStyle = theme.threshold;
			ctx.fillText(`/${shortNum(arm)}`, x, y + r + 19);
		}
	}

	const objects = drawObjects(ctx, o, i, X, Y, w, bottom, cy, mx);

	// The rungs are named last, over a surface halo: the nearest one lands under
	// the rear row where the per-coil readouts already are, and a scale nobody
	// can read is not a scale.
	ctx.font = `9px ${theme.font}`;
	ctx.textAlign = "left";
	ctx.strokeStyle = theme.surface;
	ctx.lineWidth = 3;
	ctx.lineJoin = "round";
	for (const [text, y] of rungs) {
		ctx.strokeText(text, 6, y - 3);
		ctx.fillStyle = theme.muted;
		ctx.fillText(text, 6, y - 3);
	}

	ctx.fillStyle = theme.muted;
	ctx.font = `10px ${theme.font}`;
	ctx.textAlign = "center";
	ctx.fillText(`t = ${fmt(run.t[i]!, 1)} s`, w / 2, h - 12);
	const footer =
		objects.back != null && objects.ago != null
			? `${fmt(Math.abs(objects.back), 2)} m ${objects.back >= 0 ? "astern" : "ahead"} · ` +
				`${fmt(Math.abs(objects.ago), 1)} s ${objects.ago >= 0 ? "ago" : "ahead"}`
			: objects.n > 0
				? `${objects.n} object${objects.n > 1 ? "s" : ""} in range`
				: params.detector === "mad"
					? "value / own threshold"
					: "value";
	ctx.fillText(footer, w / 2, h - 2);

	return {
		index: i,
		objects: objects.n,
		back: objects.back,
		ago: objects.ago,
	};
}

/**
 * A stable pseudo-random number for a ground cell.
 *
 * Deterministic in the cell's world index, which is what makes a speckle stay on
 * its patch of ground as the robot drives over it. Anything seeded from the
 * frame — or from a screen position — would shimmer in place and say the exact
 * opposite of what this texture is for.
 *
 * @param a - Cell index along east.
 * @param b - Cell index along north.
 * @param salt - Distinguishes the jitter from the brightness draw.
 * @returns A number in `[0, 1)`.
 */
export function cellNoise(a: number, b: number, salt: number): number {
	let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ salt;
	h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
	h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
	return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * The ground, as a faint speckle locked to the world.
 *
 * Two consecutive frames of this panel are nearly identical — the rake does not
 * move in its own frame, and a detection a metre astern moves a few pixels per
 * second. That makes travel almost impossible to read, which is a problem for a
 * panel whose subject *is* travel. Texturing the ground fixes it for free: the
 * speckles are placed on a fixed world grid and transformed through the same
 * pose the detections are, so they stream astern at exactly survey speed and
 * swing when the robot turns.
 *
 * Low contrast on purpose. It has to be legible as motion at the edge of
 * attention and invisible as content — a reader must never wonder whether a
 * speckle is a detection.
 */
function drawGround(
	ctx: CanvasRenderingContext2D,
	o: CoilArrayOptions,
	i: number,
	X: (x: number, y: number) => number,
	Y: (x: number) => number,
	w: number,
	bottom: number,
	s: number,
	cx: number,
	cy: number,
	mx: number,
	my: number,
): void {
	const { run, theme } = o;
	const yaw = run.yaw[i]!;
	const px = run.sx[i]!;
	const py = run.sy[i]!;
	if (!Number.isFinite(yaw) || !Number.isFinite(px) || !Number.isFinite(py)) {
		return;
	}
	const ch = Math.cos(yaw);
	const sh = Math.sin(yaw);

	// The visible box, in body metres. Inverting the projection rather than
	// guessing an extent, so the texture covers the panel exactly however it is
	// shaped — and no cell outside it is ever hashed.
	const bx0 = mx - (bottom - cy) / s;
	const bx1 = mx + cy / s;
	const by0 = my - (w - cx) / s;
	const by1 = my + cx / s;

	// The body box's four corners, in world metres, and their bounding box: the
	// robot is rotated against the world grid, so the cells to visit are the
	// ones inside the *rotated* rectangle's extent.
	const corners: Array<[number, number]> = [
		[bx0, by0],
		[bx0, by1],
		[bx1, by0],
		[bx1, by1],
	];
	let wx0 = Infinity;
	let wx1 = -Infinity;
	let wy0 = Infinity;
	let wy1 = -Infinity;
	for (const [bx, by] of corners) {
		const wx = px + ch * (bx - mx) - sh * (by - my);
		const wy = py + sh * (bx - mx) + ch * (by - my);
		if (wx < wx0) wx0 = wx;
		if (wx > wx1) wx1 = wx;
		if (wy < wy0) wy0 = wy;
		if (wy > wy1) wy1 = wy;
	}
	if (!Number.isFinite(wx0) || !Number.isFinite(wy0)) return;

	const c0 = Math.floor(wx0 / GROUND_CELL_M);
	const c1 = Math.ceil(wx1 / GROUND_CELL_M);
	const d0 = Math.floor(wy0 / GROUND_CELL_M);
	const d1 = Math.ceil(wy1 / GROUND_CELL_M);
	// A guard, not a policy: at a very low scale the world box is enormous and
	// this would hash tens of thousands of cells for a texture nobody can see.
	if ((c1 - c0) * (d1 - d0) > 4000) return;

	const dot = Math.max(1, Math.min(3, s * 0.015));
	// One path per alpha level: six hundred `globalAlpha` changes cost more than
	// the speckles do.
	const paths = GROUND_ALPHA.map(() => new Path2D());

	for (let c = c0; c <= c1; c++) {
		for (let d = d0; d <= d1; d++) {
			const wx = (c + cellNoise(c, d, 0x9e37)) * GROUND_CELL_M;
			const wy = (d + cellNoise(c, d, 0x85eb)) * GROUND_CELL_M;
			const dx = wx - px;
			const dy = wy - py;
			const bx = ch * dx + sh * dy;
			const by = -sh * dx + ch * dy;
			const sx = X(bx, by);
			const sy = Y(bx);
			if (sx < 0 || sx > w || sy < 0 || sy > bottom) continue;
			const level = Math.min(
				GROUND_ALPHA.length - 1,
				Math.floor(cellNoise(c, d, 0xc2b2) * GROUND_ALPHA.length),
			);
			paths[level]!.rect(sx, sy, dot, dot);
		}
	}

	ctx.save();
	ctx.fillStyle = theme.muted;
	for (let k = 0; k < paths.length; k++) {
		ctx.globalAlpha = GROUND_ALPHA[k]!;
		ctx.fill(paths[k]!);
	}
	ctx.restore();
}

/**
 * One second of the current velocity, rotated into the array's own frame.
 *
 * Taken from the fix rather than assumed, so a reverse or a crab shows as
 * itself; the length is the speed, which is also what sets the lag between the
 * front row and the rear.
 */
function drawTravel(
	ctx: CanvasRenderingContext2D,
	o: CoilArrayOptions,
	i: number,
	X: (x: number, y: number) => number,
	Y: (x: number) => number,
	mx: number,
	my: number,
): void {
	const { run, theme } = o;
	const yaw = run.yaw[i]!;
	if (!Number.isFinite(yaw)) return;
	const ch = Math.cos(yaw);
	const sh = Math.sin(yaw);
	const k = Math.max(1, Math.round((run.sampleRateHz || 32) * 0.25));
	const a = Math.max(0, i - k);
	const b = Math.min(run.n - 1, i + k);
	const dt = run.t[b]! - run.t[a]!;
	if (!(dt > 1e-6)) return;
	const vx = (run.sx[b]! - run.sx[a]!) / dt;
	const vy = (run.sy[b]! - run.sy[a]!) / dt;
	if (!Number.isFinite(vx) || !Number.isFinite(vy)) return;
	const fwd = ch * vx + sh * vy;
	const lat = -sh * vx + ch * vy;
	const speed = Math.hypot(fwd, lat);
	if (speed < MIN_ARROW_MS) return;

	const x0 = X(mx, my);
	const y0 = Y(mx);
	const x1 = X(mx + fwd, my + lat);
	const y1 = Y(mx + fwd);
	ctx.strokeStyle = theme.muted;
	ctx.lineWidth = 2;
	ctx.globalAlpha = 0.75;
	line(ctx, x0, y0, x1, y1);
	ctx.fillStyle = theme.muted;
	arrowHead(ctx, x0, y0, x1, y1, 8);
	ctx.globalAlpha = 1;

	// Top-left, not beside the arrowhead: at survey speed the head lands right
	// on the front row, and a label there sits on top of a coil.
	ctx.fillStyle = theme.muted;
	ctx.font = `9px ${theme.font}`;
	ctx.textAlign = "left";
	ctx.fillText(`${fmt(speed, 2)} m/s`, 4, 11);
}

/** Every detection placed in the array's frame at the instant being shown. */
function drawObjects(
	ctx: CanvasRenderingContext2D,
	o: CoilArrayOptions,
	i: number,
	X: (x: number, y: number) => number,
	Y: (x: number) => number,
	w: number,
	bottom: number,
	cy: number,
	mx: number,
): { n: number; back: number | null; ago: number | null } {
	const { run, result, theme } = o;
	const yaw = run.yaw[i]!;
	if (!Number.isFinite(yaw)) return { n: 0, back: null, ago: null };
	const ch = Math.cos(yaw);
	const sh = Math.sin(yaw);
	const px = run.sx[i]!;
	const py = run.sy[i]!;
	if (!Number.isFinite(px) || !Number.isFinite(py)) {
		return { n: 0, back: null, ago: null };
	}

	const hov = o.hoverDet >= 0 ? (result.geoNew[o.hoverDet] ?? null) : null;
	const hovTarget = hov ? hov.targetId : -1;
	let n = 0;
	let back: number | null = null;
	let ago: number | null = null;

	const toBody = (wx: number, wy: number): [number, number] => {
		const dx = wx - px;
		const dy = wy - py;
		// Forward and to port, the array's own axes.
		const bx = ch * dx + sh * dy;
		const by = -sh * dx + ch * dy;
		return [X(bx, by), Y(bx)];
	};
	const onScreen = (x: number, y: number) =>
		x >= 4 && x <= w - 4 && y >= 4 && y <= bottom;

	// Spokes first, under everything: a centroid joined to the detections that
	// made it. The association drawn as what it is — several passes of the array
	// over one object, averaged.
	const drawn: Target[] = [];
	for (const t of result.targets) {
		if (t.members.length < 2) continue;
		const [tcx, tcy] = toBody(t.cx, t.cy);
		let any = onScreen(tcx, tcy);
		const ends: Array<[number, number]> = [];
		for (const m of t.members) {
			const end = toBody(m.x, m.y);
			if (onScreen(end[0], end[1])) any = true;
			ends.push(end);
		}
		if (!any) continue;
		drawn.push(t);
		ctx.strokeStyle = theme.target;
		ctx.globalAlpha = t.id === hovTarget ? 0.9 : 0.35;
		ctx.lineWidth = t.id === hovTarget ? 1.5 : 1;
		for (const [ex, ey] of ends) line(ctx, tcx, tcy, ex, ey);
		ctx.globalAlpha = 1;
	}

	for (const d of result.geoNew) {
		const [x, y] = toBody(d.x, d.y);
		if (!onScreen(x, y)) continue;
		n++;

		const isHov = d === hov;
		const sibling = hovTarget >= 0 && d.targetId === hovTarget && !isHov;
		// Fade with distance from the rake in either direction: the subject is
		// what is passing under the coils, and what is a metre ahead or behind
		// is context. Anything the cursor points at stays full.
		ctx.globalAlpha =
			isHov || sibling
				? 1
				: Math.max(
						0.22,
						1 - (Math.abs(y - cy) / Math.max(1, bottom - cy)) * 0.8,
					);

		if (isHov || sibling) {
			ctx.fillStyle = theme.link;
			ctx.globalAlpha = isHov ? 0.3 : 0.16;
			ctx.beginPath();
			ctx.arc(x, y, isHov ? 15 : 11, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = 1;
		}

		ctx.fillStyle = theme.replayed;
		ctx.strokeStyle = theme.surface;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(x, y, isHov ? 5.5 : 4, 0, Math.PI * 2);
		ctx.stroke();
		ctx.fill();

		if (d.targetId >= 0) {
			ctx.strokeStyle = theme.link;
			ctx.lineWidth = isHov || sibling ? 2.5 : 1.5;
			ctx.beginPath();
			ctx.arc(x, y, isHov ? 9 : 7.5, 0, Math.PI * 2);
			ctx.stroke();
		}

		// The exact number the range ladder exists to make readable. Only on the
		// mark under the cursor: the panel is a couple of hundred pixels wide
		// and two labels 0.2 m apart would sit on top of each other.
		if (isHov) {
			const dx = d.x - px;
			const dy = d.y - py;
			back = mx - (ch * dx + sh * dy);
			ago = run.t[i]! - d.t;
			const right = x > w * 0.55;
			ctx.font = `9px ${theme.font}`;
			ctx.textAlign = right ? "right" : "left";
			const lx = x + (right ? -18 : 18);
			const txt = `${fmt(Math.abs(back), 2)} m`;
			ctx.strokeStyle = theme.surface;
			ctx.lineWidth = 3;
			ctx.lineJoin = "round";
			ctx.strokeText(txt, lx, y + 3);
			ctx.fillStyle = theme.text;
			ctx.fillText(txt, lx, y + 3);
		}
		ctx.globalAlpha = 1;
	}

	// Centroids on top: the position the system actually reports for an object,
	// as opposed to the several places its coils each thought it was.
	for (const t of drawn) {
		const [tcx, tcy] = toBody(t.cx, t.cy);
		if (!onScreen(tcx, tcy)) continue;
		const on = t.id === hovTarget;
		ctx.globalAlpha = on
			? 1
			: Math.max(
					0.3,
					1 - (Math.abs(tcy - cy) / Math.max(1, bottom - cy)) * 0.8,
				);
		ctx.fillStyle = theme.target;
		ctx.strokeStyle = theme.surface;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(tcx, tcy, on ? 6 : 4.5, 0, Math.PI * 2);
		ctx.stroke();
		ctx.fill();
		ctx.globalAlpha = 1;
	}

	return { n, back, ago };
}
