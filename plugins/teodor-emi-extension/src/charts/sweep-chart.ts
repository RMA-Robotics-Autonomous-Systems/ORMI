/**
 * W6 — detections against the parameter that produces them.
 *
 * Both detectors on the same axes, so the distance between the two curves is
 * the algorithm and nothing else: same signal, same filter, same run.
 *
 * The swept quantity follows the active detector. Sweeping a threshold while the
 * MAD detector is running would draw a curve describing an algorithm that is not
 * the one selected — and the page opens on MAD, so that would be the default
 * view.
 */

import type { EmiParams } from "../detector/params";
import type { Sweep } from "../detector/replay";
import type { EmiTheme } from "./emi-theme";
import {
	decadeTicks,
	fmt,
	line,
	niceTicks,
	setupCanvas,
	shortNum,
} from "./canvas-chart";

/** Padding around the sweep plot. */
const P = { l: 52, r: 14, t: 12, b: 34 } as const;

/** Tick positions for a MAD-factor axis, which is not decade-shaped. */
const FACTOR_TICKS = [2, 5, 10, 15, 20, 30, 45, 60];

/** Everything a sweep repaint reads. */
export interface SweepOptions {
	sweep: Sweep;
	params: EmiParams;
	theme: EmiTheme;
	/** Detections the recording itself contains, for the reference dot. */
	recordedCount: number;
	/** ATR threshold the recording ran under, or 0 when it varied. */
	recordedThreshold: number;
	width: number;
	height: number;
}

/**
 * Draw the sweep.
 *
 * @param cv - The canvas.
 * @param o - Everything to draw.
 * @returns True when something was drawn.
 */
export function drawSweep(cv: HTMLCanvasElement, o: SweepOptions): boolean {
	const surface = setupCanvas(cv, o.height, o.width);
	if (!surface) return false;
	const { ctx, w, h } = surface;
	const { sweep, params, theme } = o;
	const pts = sweep.points;

	ctx.font = `10px ${theme.font}`;
	if (pts.length < 2) {
		ctx.fillStyle = theme.muted;
		ctx.fillText("not enough data to sweep", P.l, P.t + 14);
		return false;
	}

	const x0 = pts[0]!.x;
	const x1 = pts[pts.length - 1]!.x;
	if (!(x0 > 0) || !(x1 > x0)) return false;
	const xmin = Math.log10(x0);
	const xmax = Math.log10(x1);
	let ymax = 1;
	for (const p of pts) ymax = Math.max(ymax, p.current, p.shipped);
	// The recorded count too, when it will be drawn. The case where it exceeds
	// both curves is the case where the replay is *not* faithful — which is the
	// disagreement the dot exists to expose, and it would otherwise be exposed
	// by drawing it off the top of the canvas.
	const showDot =
		sweep.mode === "fixed" &&
		o.recordedThreshold > 0 &&
		o.recordedThreshold >= x0 &&
		o.recordedThreshold <= x1;
	if (showDot) ymax = Math.max(ymax, o.recordedCount);
	ymax *= 1.08;

	const X = (v: number) =>
		P.l + ((Math.log10(v) - xmin) / (xmax - xmin)) * (w - P.l - P.r);
	const Y = (v: number) => P.t + (1 - v / ymax) * (h - P.t - P.b);

	ctx.strokeStyle = theme.grid;
	ctx.lineWidth = 1;
	ctx.fillStyle = theme.muted;
	ctx.textAlign = "right";
	for (const v of niceTicks(0, ymax, 5)) {
		const y = Math.round(Y(v)) + 0.5;
		line(ctx, P.l, y, w - P.r, y);
		ctx.fillText(String(Math.round(v)), P.l - 6, y + 3);
	}
	ctx.textAlign = "center";
	const xTicks = sweep.mode === "mad" ? FACTOR_TICKS : decadeTicks(x0, x1);
	for (const v of xTicks) {
		if (v < x0 || v > x1) continue;
		const x = Math.round(X(v)) + 0.5;
		line(ctx, x, P.t, x, h - P.b);
		ctx.fillText(
			sweep.mode === "mad" ? String(v) : shortNum(v),
			x,
			h - P.b + 14,
		);
	}

	const plot = (get: (i: number) => number, color: string) => {
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.beginPath();
		pts.forEach((p, i) => {
			const px = X(p.x);
			const py = Y(get(i));
			if (i) ctx.lineTo(px, py);
			else ctx.moveTo(px, py);
		});
		ctx.stroke();
	};
	// Blue is what the system reported on the day, everywhere on this page; the
	// shipped single-threshold curve is the closest thing to it here.
	plot((i) => pts[i]!.shipped, theme.recorded);
	plot((i) => pts[i]!.current, theme.replayed);

	// What this recording actually produced, plotted on the shipped curve. If
	// the replay is faithful the point sits ON that line — the whole comparison
	// rests on it, so it is worth being able to see.
	if (showDot) {
		const rx = X(o.recordedThreshold);
		const ry = Y(o.recordedCount);
		ctx.fillStyle = theme.recorded;
		ctx.strokeStyle = theme.surface;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(rx, ry, 5, 0, Math.PI * 2);
		ctx.stroke();
		ctx.fill();
		ctx.fillStyle = theme.muted;
		ctx.textAlign = rx > w / 2 ? "right" : "left";
		ctx.fillText(
			` recorded: ${o.recordedCount} `,
			rx + (rx > w / 2 ? -8 : 8),
			ry - 8,
		);
	}

	// Where the current setting sits.
	const current = sweep.mode === "mad" ? params.madFactor : params.threshold;
	if (current >= x0 && current <= x1) {
		const xc = X(current);
		ctx.strokeStyle = theme.muted;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 3]);
		line(ctx, xc, P.t, xc, h - P.b);
		ctx.setLineDash([]);
		ctx.fillStyle = theme.muted;
		ctx.textAlign = xc > w / 2 ? "right" : "left";
		ctx.fillText(
			sweep.mode === "mad"
				? ` ${fmt(current, 1)}× `
				: ` ${Math.round(current)} `,
			xc,
			P.t + 10,
		);
	}

	ctx.textAlign = "center";
	ctx.fillStyle = theme.muted;
	ctx.fillText(
		sweep.mode === "mad"
			? "factor × MAD (log scale)"
			: "arm threshold (counts, log scale)",
		(P.l + w - P.r) / 2,
		h - 6,
	);
	ctx.save();
	ctx.translate(12, (P.t + h - P.b) / 2);
	ctx.rotate(-Math.PI / 2);
	ctx.fillText("detections over the whole run", 0, 0);
	ctx.restore();
	return true;
}
