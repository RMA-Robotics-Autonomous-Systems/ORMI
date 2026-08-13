/**
 * W2 — how the robot was moving, on the signal stack's time axis.
 *
 * Two panels rather than two scales on one: metres per second and degrees per
 * second share no axis, and putting them together invites reading a crossing as
 * a coincidence when it is an artefact of whichever ranges happened to be
 * picked.
 *
 * Both limits are drawn as shaded regions rather than as lines, because what
 * matters is being *inside* them. Below {@link STILL_MS} the robot is parked and
 * its detections are the same ground measured again, not new coverage. Inside
 * ±{@link STRAIGHT_DPS} the rake is sweeping a lane and the cross-coil geometry
 * holds; outside it the array is rotating under the object and the predicted lag
 * means much less.
 */

import type { EmiRun } from "../detector/run-types";
import type { ReplayResult } from "../detector/replay";
import type { EmiTheme } from "./emi-theme";
import {
	fmt,
	line,
	lowerBound,
	niceTicks,
	PAD,
	setupCanvas,
	strokeMinMax,
	timeGeom,
	type PanelGeom,
	type Projection,
} from "./canvas-chart";

/** Below this the robot is not surveying, m/s. */
export const STILL_MS = 0.08;
/** Beyond this the rake is turning rather than sweeping a lane, °/s. */
export const STRAIGHT_DPS = 8;

/** What the robot was doing at one sample. */
export type MotionState = "stationary" | "turning" | "moving";

/** Classify one sample. */
export function motionState(speed: number, turn: number): MotionState {
	if (speed < STILL_MS) return "stationary";
	if (Math.abs(turn) > STRAIGHT_DPS) return "turning";
	return "moving";
}

/** Extra height the bottom panel needs for its time labels. */
const AXIS_H = 22;
/** Below this the two panels plus the axis have no room to be read. */
export const MIN_TOTAL_H = 102;

/** What one motion repaint produced. */
export interface MotionLayout {
	geoms: PanelGeom[];
	height: number;
	/** Fraction of the visible window spent in each state. */
	shares: Record<MotionState, number>;
	/** Detections in the window, and how many were raised while parked. */
	detsHere: number;
	detsStill: number;
}

/** Everything a motion repaint reads. */
export interface MotionOptions {
	run: EmiRun;
	result: ReplayResult;
	theme: EmiTheme;
	view: [number, number];
	width: number;
	height: number;
}

/** A linear projection over an explicit range — the motion panels are not log. */
function linear(lo: number, hi: number, tickTarget = 3): Projection {
	return {
		proj: (v: number) => v,
		ymin: lo,
		ymax: hi,
		ticks: niceTicks(lo, hi, tickTarget),
		isLog: false,
	};
}

/**
 * Draw the speed and turn-rate panels.
 *
 * @param canvases - Two canvases: speed, then turn rate.
 * @param o - Everything to draw.
 * @returns The layout and the window's motion summary, or null when unusable.
 */
export function drawMotionChart(
	canvases: (HTMLCanvasElement | null)[],
	o: MotionOptions,
): MotionLayout | null {
	const { run, result, theme, view } = o;
	const [vt0, vt1] = view;
	if (!(vt1 > vt0) || run.n === 0) return null;

	const speed = result.speed;
	const turn = result.turn;
	const i0 = lowerBound(run.t, vt0, run.n);
	const i1 = Math.min(run.n, lowerBound(run.t, vt1, run.n) + 1);

	// Floors on both ranges: a robot that never exceeded 2 cm/s would otherwise
	// get a full-height trace of noise and read as if it had been driving.
	let vmax = 0.4;
	let tmax = 12;
	for (let i = i0; i < i1; i++) {
		if (speed[i]! > vmax) vmax = speed[i]!;
		const a = Math.abs(turn[i]!);
		if (a > tmax) tmax = a;
	}

	const specs = [
		{
			arr: speed,
			lo: 0,
			hi: vmax * 1.1,
			dec: 2,
			band: [0, STILL_MS] as [number, number],
			label: "ground speed (m/s)",
			note: "stationary",
			ticks: true,
		},
		{
			arr: turn,
			lo: -tmax * 1.1,
			hi: tmax * 1.1,
			dec: 0,
			band: [-STRAIGHT_DPS, STRAIGHT_DPS] as [number, number],
			label: "turn rate (°/s)",
			note: "straight",
			ticks: false,
		},
	];

	// Speed takes the smaller share: it is the simpler story and the turn-rate
	// panel needs room for a signed axis. The two must sum to exactly the box —
	// a floor on each would overflow the host on a short tile and push the time
	// axis out of sight with no scrollbar to reveal it.
	if (o.height < MIN_TOTAL_H) return null;
	const speedH = Math.round((o.height - AXIS_H) * 0.45);
	const turnH = o.height - speedH;
	const heights = [speedH, turnH];

	const geoms: PanelGeom[] = [];
	let top = 0;

	specs.forEach((sp, k) => {
		const cv = canvases[k];
		const panelH = heights[k]!;
		if (!cv) {
			top += panelH;
			return;
		}
		const surface = setupCanvas(cv, panelH, o.width);
		if (!surface) {
			top += panelH;
			return;
		}
		const { ctx, w } = surface;
		const isLast = k === specs.length - 1;
		const plotH = panelH - PAD.t - (isLast ? AXIS_H : PAD.b);
		const projection = linear(sp.lo, sp.hi, 3);
		const g = timeGeom(w, PAD.t, plotH, vt0, vt1, projection, top);
		geoms[k] = g;

		ctx.font = `10px ${theme.font}`;
		ctx.strokeStyle = theme.grid;
		ctx.lineWidth = 1;
		ctx.fillStyle = theme.muted;
		ctx.textAlign = "right";
		for (const v of projection.ticks) {
			const y = Math.round(g.Y(v)) + 0.5;
			if (y < g.y0 - 1 || y > g.y1 + 1) continue;
			line(ctx, g.x0, y, g.x1, y);
			ctx.fillText(fmt(v, sp.dec), g.x0 - 6, y + 3);
		}

		// The "not surveying" / "not turning" band.
		const yb0 = g.Y(Math.max(sp.lo, sp.band[0]));
		const yb1 = g.Y(Math.min(sp.hi, sp.band[1]));
		ctx.fillStyle = theme.band;
		ctx.fillRect(
			g.x0,
			Math.min(yb0, yb1),
			g.x1 - g.x0,
			Math.abs(yb1 - yb0),
		);

		strokeMinMax(
			ctx,
			g,
			run.t,
			run.n,
			vt0,
			vt1,
			(i) => sp.arr[i]!,
			theme.signal,
			1.5,
		);

		// Detections as ticks along the top of the speed panel: the correlation
		// worth seeing is whether a burst happened while the robot was parked.
		if (sp.ticks) {
			ctx.strokeStyle = theme.replayed;
			ctx.lineWidth = 1;
			ctx.globalAlpha = 0.75;
			for (const d of result.geoNew) {
				if (d.t < vt0 || d.t > vt1) continue;
				const x = Math.round(g.X(d.t)) + 0.5;
				line(ctx, x, g.y0, x, g.y0 + 5);
			}
			ctx.globalAlpha = 1;
		}

		ctx.strokeStyle = theme.axis;
		ctx.lineWidth = 1;
		line(ctx, g.x0, g.y1 + 0.5, g.x1, g.y1 + 0.5);

		if (isLast) {
			ctx.fillStyle = theme.muted;
			ctx.textAlign = "center";
			for (const t of niceTicks(vt0, vt1, 8)) {
				if (t < vt0 || t > vt1) continue;
				ctx.fillText(
					`${fmt(t, vt1 - vt0 < 20 ? 1 : 0)}s`,
					g.X(t),
					g.y1 + 14,
				);
			}
		}

		// Name the band where it is, on a patch of surface — at the right-hand
		// edge the label would otherwise sit on both the axis and the trace.
		ctx.textAlign = "right";
		const ly = Math.min(yb0, yb1) + Math.abs(yb1 - yb0) / 2 + 3;
		const tw = ctx.measureText(sp.note).width;
		ctx.fillStyle = theme.surface;
		ctx.fillRect(g.x1 - tw - 8, ly - 8, tw + 7, 11);
		ctx.fillStyle = theme.threshold;
		ctx.fillText(sp.note, g.x1 - 4, ly);

		ctx.textAlign = "left";
		ctx.fillStyle = theme.muted;
		ctx.fillText(sp.label, g.x0 + 4, g.y0 + 10);

		top += panelH;
	});

	// Time in each state over the visible window — the answer to "were we
	// actually surveying here?" without having to read the traces.
	const counts: Record<MotionState, number> = {
		stationary: 0,
		turning: 0,
		moving: 0,
	};
	let total = 0;
	// `i1` carries one sample past the right edge so the trace joins to it; the
	// shares are a statement about the window and must not.
	const iEnd = Math.min(i1, lowerBound(run.t, vt1, run.n));
	for (let i = i0; i < iEnd; i++) {
		const sp = speed[i];
		const tr = turn[i];
		if (sp === undefined || tr === undefined) continue;
		total++;
		counts[motionState(sp, tr)]++;
	}
	let detsHere = 0;
	let detsStill = 0;
	for (const d of result.geoNew) {
		if (d.t < vt0 || d.t > vt1) continue;
		detsHere++;
		// A missing sample is not a stationary one: `?? 0` would read as "below
		// the parked threshold" and inflate the count that accuses the survey.
		const v = speed[d.iPeak];
		if (v !== undefined && v < STILL_MS) detsStill++;
	}

	return {
		geoms,
		height: top,
		shares: {
			stationary: total ? counts.stationary / total : 0,
			turning: total ? counts.turning / total : 0,
			moving: total ? counts.moving / total : 0,
		},
		detsHere,
		detsStill,
	};
}

/**
 * The playhead across both motion panels.
 *
 * @param cv - Overlay canvas spanning both panels.
 * @param o - The options the panels were drawn with.
 * @param layout - The layout they produced.
 * @param cursorT - Playhead time, or null.
 */
export function drawMotionOverlay(
	cv: HTMLCanvasElement,
	o: MotionOptions,
	layout: MotionLayout,
	cursorT: number | null,
): void {
	const surface = setupCanvas(cv, layout.height, o.width);
	if (!surface) return;
	const { ctx, w, h } = surface;
	const [vt0, vt1] = o.view;
	if (cursorT == null || cursorT < vt0 || cursorT > vt1) return;
	const geoms = layout.geoms;
	if (!geoms[0]) return;

	const i = Math.max(
		0,
		Math.min(o.run.n - 1, lowerBound(o.run.t, cursorT, o.run.n)),
	);
	const x = geoms[0].X(cursorT);

	ctx.strokeStyle = o.theme.muted;
	ctx.lineWidth = 1;
	ctx.globalAlpha = 0.75;
	ctx.setLineDash([3, 3]);
	line(ctx, x, 0, x, h);
	ctx.setLineDash([]);
	ctx.globalAlpha = 1;

	const series = [o.result.speed, o.result.turn];
	ctx.fillStyle = o.theme.muted;
	for (let k = 0; k < geoms.length; k++) {
		const g = geoms[k];
		const v = series[k]?.[i];
		if (!g || v === undefined || !Number.isFinite(v)) continue;
		ctx.beginPath();
		ctx.arc(x, g.top + g.Y(v), 3, 0, Math.PI * 2);
		ctx.fill();
	}

	const label = `${fmt(cursorT, 2)} s`;
	ctx.font = `10px ${o.theme.font}`;
	const tw = ctx.measureText(label).width;
	const lx = Math.min(w - tw - 6, Math.max(2, x + 4));
	ctx.fillStyle = o.theme.surface;
	ctx.fillRect(lx - 2, 1, tw + 4, 12);
	ctx.fillStyle = o.theme.muted;
	ctx.textAlign = "left";
	ctx.fillText(label, lx, 10);
}
