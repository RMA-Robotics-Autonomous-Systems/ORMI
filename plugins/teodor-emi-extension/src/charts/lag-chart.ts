/**
 * W7 — observed lag against the lag the geometry predicts.
 *
 * The rake is two interleaved rows about 0.4 m apart, so an object passes under
 * a front coil and then, that distance of travel later, under whichever rear
 * coils share its lane. Every pair is therefore a prediction — Δs ÷ v — and this
 * panel is the whole population of those predictions against what actually
 * happened.
 *
 * The along-track test is nearly free of GNSS error: both positions come out of
 * the same fix stream a fraction of a second apart, so the absolute error that
 * defeats association outright is common to both and cancels in the difference.
 * What survives is geometry.
 */

import type { CoilPair } from "../detector/geometry";
import type { EmiTheme } from "./emi-theme";
import { fmt, line, niceTicks, setupCanvas } from "./canvas-chart";

/** Padding around the scatter. */
const P = { l: 54, r: 14, t: 12, b: 38 } as const;

/** Everything a lag repaint reads. */
export interface LagOptions {
	pairs: CoilPair[];
	theme: EmiTheme;
	width: number;
	height: number;
}

/** What the repaint found. */
export interface LagReadout {
	/** Pairs with a usable prediction. */
	plotted: number;
	/** Pairs left outside the robust limits. */
	clipped: number;
	/**
	 * Median absolute disagreement, over the plotted front-to-rear pairs only.
	 *
	 * Same-row pairs and pairs outside the robust limits are excluded: the
	 * former predict zero by construction and the latter are not on screen.
	 */
	medianError: number;
}

/**
 * Draw the scatter.
 *
 * @param cv - The canvas.
 * @param o - Everything to draw.
 * @returns The readout, or null when there was nothing to plot.
 */
export function drawLagChart(
	cv: HTMLCanvasElement,
	o: LagOptions,
): LagReadout | null {
	const surface = setupCanvas(cv, o.height, o.width);
	if (!surface) return null;
	const { ctx, w, h } = surface;
	const { theme } = o;
	ctx.font = `10px ${theme.font}`;

	const pts = o.pairs.filter((L) => Number.isFinite(L.predicted));
	if (pts.length === 0) {
		ctx.fillStyle = theme.muted;
		ctx.fillText("no links to plot", P.l, P.t + 14);
		return { plotted: 0, clipped: 0, medianError: NaN };
	}

	// Robust limits. A few links happen while the robot is nearly stopped, where
	// a 0.4 m separation predicts a lag of many seconds; letting those set the
	// axes squeezes every ordinary link into the corner, which is precisely
	// where the agreement has to be read. The count left outside is reported
	// rather than hidden.
	const vals: number[] = [];
	for (const L of pts) vals.push(L.lag, L.predicted);
	vals.sort((a, b) => a - b);
	const q = (f: number) =>
		vals[
			Math.max(
				0,
				Math.min(vals.length - 1, Math.round(f * (vals.length - 1))),
			)
		]!;
	let lo = Math.min(q(0.03), -0.2);
	let hi = Math.max(q(0.97), 0.2);
	const pad = Math.max(0.1, (hi - lo) * 0.08);
	lo -= pad;
	hi += pad;

	const outside = (L: CoilPair) =>
		L.lag < lo || L.lag > hi || L.predicted < lo || L.predicted > hi;
	const clipped = pts.filter(outside).length;

	const X = (v: number) => P.l + ((v - lo) / (hi - lo)) * (w - P.l - P.r);
	const Y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (h - P.t - P.b);

	ctx.strokeStyle = theme.grid;
	ctx.lineWidth = 1;
	ctx.fillStyle = theme.muted;
	for (const v of niceTicks(lo, hi, 5)) {
		const x = Math.round(X(v)) + 0.5;
		const y = Math.round(Y(v)) + 0.5;
		line(ctx, x, P.t, x, h - P.b);
		line(ctx, P.l, y, w - P.r, y);
		ctx.textAlign = "center";
		ctx.fillText(fmt(v, 1), x, h - P.b + 14);
		ctx.textAlign = "right";
		ctx.fillText(fmt(v, 1), P.l - 6, y + 3);
	}

	// y = x: where a pair lands if the frame, the heading and the speed agree.
	ctx.strokeStyle = theme.axis;
	ctx.lineWidth = 2;
	ctx.setLineDash([5, 4]);
	line(ctx, X(lo), Y(lo), X(hi), Y(hi));
	ctx.setLineDash([]);

	// Filled for front-to-rear pairs, open for pairs inside one row: those have
	// a predicted lag of zero by construction and must not read as agreement.
	let plotted = 0;
	const errors: number[] = [];
	for (const L of pts) {
		const sameRow = Math.abs(L.predicted) < 1e-6;
		// Same-row pairs predict zero lag by construction, so their near-zero
		// error would pull the headline toward "the geometry agrees" using the
		// very pairs the legend disowns. Clipped pairs are excluded too, so the
		// number describes the population the caption reports beside it.
		if (!sameRow && !outside(L)) {
			errors.push(Math.abs(L.lag - L.predicted));
		}
		if (outside(L)) continue;
		plotted++;
		const x = X(L.predicted);
		const y = Y(L.lag);
		if (sameRow) {
			ctx.strokeStyle = theme.link;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(x, y, 4.5, 0, Math.PI * 2);
			ctx.stroke();
		} else {
			ctx.fillStyle = theme.link;
			ctx.strokeStyle = theme.surface;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(x, y, 4, 0, Math.PI * 2);
			ctx.stroke();
			ctx.fill();
		}
	}

	ctx.fillStyle = theme.muted;
	ctx.textAlign = "center";
	ctx.fillText("lag the geometry predicts (s)", (P.l + w - P.r) / 2, h - 8);
	ctx.save();
	ctx.translate(12, (P.t + h - P.b) / 2);
	ctx.rotate(-Math.PI / 2);
	ctx.fillText("lag observed (s)", 0, 0);
	ctx.restore();

	errors.sort((a, b) => a - b);
	const mid = errors.length >> 1;
	return {
		plotted,
		clipped,
		medianError:
			errors.length === 0
				? NaN
				: errors.length % 2 === 1
					? errors[mid]!
					: (errors[mid - 1]! + errors[mid]!) / 2,
	};
}
