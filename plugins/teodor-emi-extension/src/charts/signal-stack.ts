/**
 * The signal stack, drawn.
 *
 * One panel per coil on a shared vertical scale, with the hysteresis band, the
 * threshold edges — moving curves under the MAD detector — the recorded and
 * replayed detection marks, and above all of them the cross-coil links.
 *
 * Kept out of the widget so the drawing can be reasoned about without React in
 * the way: everything here takes canvases and data and returns geometry.
 */

import type { EmiRun } from "../detector/run-types";
import type { EmiParams } from "../detector/params";
import {
	armThresholdAt,
	releaseThresholdAt,
	type ReplayResult,
} from "../detector/replay";
import type { GeoDetection } from "../detector/detector-types";
import type { EmiDisplay } from "../state/atoms";
import type { EmiTheme } from "./emi-theme";
import {
	arrowHead,
	bezierAt,
	fmt,
	line,
	lowerBound,
	makeProjection,
	niceTicks,
	PAD,
	setupCanvas,
	shortNum,
	strokeMinMax,
	timeGeom,
	type PanelGeom,
} from "./canvas-chart";

/** A detection reduced to what a mark needs. */
interface Mark {
	t: number;
	amp: number;
}

/** What one stack repaint produced. */
export interface StackLayout {
	/** Pixel mapping per coil panel, indexed by coil index. */
	geoms: PanelGeom[];
	/** Top of the shared vertical scale, counts. */
	ymax: number;
	/** Replayed detections per coil. */
	countsNew: number[];
	/** Recorded detections per coil. */
	countsOld: number[];
	/** Height consumed by the stack, CSS pixels. */
	height: number;
}

/** Everything a repaint reads. */
export interface StackOptions {
	run: EmiRun;
	result: ReplayResult;
	params: EmiParams;
	theme: EmiTheme;
	display: EmiDisplay;
	/** Visible time window, seconds from run start. */
	view: [number, number];
	/** Height available for the whole stack, CSS pixels. */
	height: number;
	/** Width of every panel, CSS pixels. */
	width: number;
}

/** Extra height the bottom panel needs for its time labels. */
const AXIS_H = 22;
/** Below this a panel is a smear rather than a reading. */
const MIN_PANEL_H = 34;

/**
 * How the available height divides between coil panels.
 *
 * Measured rather than assumed: the stack is handed a box by the widget host,
 * and a fixed per-panel height is what makes a five-coil stack unable to fit on
 * a laptop.
 *
 * @param height - Height available, CSS pixels.
 * @param ncoil - Number of panels.
 * @returns Height of a panel, and of the bottom one which carries the axis.
 */
export function panelHeights(
	height: number,
	ncoil: number,
): { coil: number; coilLast: number } {
	const n = Math.max(1, ncoil);
	const coil = Math.max(MIN_PANEL_H, Math.floor((height - AXIS_H) / n));
	return { coil, coilLast: coil + AXIS_H };
}

/**
 * Whether the detector releases below the level it arms at.
 *
 * @param params - Current parameters.
 * @returns True when there is a band to draw.
 */
function hasHysteresis(params: EmiParams): boolean {
	return params.detector === "mad"
		? params.madRearmRatio < 1
		: params.releaseRatio < 1;
}

/**
 * Group the robot's recorded alerts by the run's coil index.
 *
 * @param run - The run.
 * @returns One list per coil, in the run's stride order.
 */
export function recordedByCoil(run: EmiRun): Mark[][] {
	const out: Mark[][] = Array.from({ length: run.ncoil }, () => []);
	for (const a of run.recorded.alerts) {
		const ci = indexOfCoil(run, a.coil);
		if (ci >= 0) out[ci]!.push({ t: a.t, amp: a.amp });
	}
	return out;
}

/** Group replayed detections by coil index. */
function byCoil(dets: GeoDetection[], ncoil: number): GeoDetection[][] {
	const out: GeoDetection[][] = Array.from({ length: ncoil }, () => []);
	for (const d of dets) if (out[d.ci]) out[d.ci]!.push(d);
	return out;
}

/** Coil index for a published coil id. */
function indexOfCoil(run: EmiRun, id: number): number {
	for (let c = 0; c < run.coilIds.length; c++) {
		if (run.coilIds[c] === id) return c;
	}
	return -1;
}

/**
 * Top of the shared vertical scale.
 *
 * Shared across coils on purpose: a per-panel scale would make a quiet coil look
 * as active as a loud one, which is exactly the comparison the stack exists to
 * make. The floor under the scale is the arm threshold, so a quiet stretch does
 * not fill the panel with noise while the line being tuned sits off the top —
 * and under MAD that floor is the highest of the five moving curves on screen,
 * because reading `params.threshold` there would scale the chart by a number the
 * active detector never consults.
 */
function scaleTop(
	run: EmiRun,
	result: ReplayResult,
	params: EmiParams,
	i0: number,
	i1: number,
): number {
	const isMad = params.detector === "mad" && result.mad !== null;
	let ymax = isMad ? 0 : params.threshold * 1.6;
	const nc = run.ncoil;

	if (isMad) {
		// Sampled, not swept: the curve is smooth and the top of the axis does
		// not need to be exact, but a full sweep of five columns over a long
		// view is the kind of loop that shows up in a drag.
		const step = Math.max(1, Math.floor((i1 - i0) / 400));
		for (let i = i0; i < i1; i += step) {
			for (let c = 0; c < nc; c++) {
				const a = armThresholdAt(result, params, nc, i, c) * 1.6;
				if (a > ymax) ymax = a;
			}
		}
		if (!(ymax > 0)) ymax = params.threshold * 1.6;
	}

	// Decimated for the same reason the MAD branch above is: the top of the
	// axis does not need to be exact, and a full sweep of five columns over a
	// long view is a loop that shows up in a drag — this runs on every wheel
	// tick and every pan.
	const step = Math.max(1, Math.floor((i1 - i0) / 2000));
	for (let i = i0; i < i1; i += step) {
		for (let c = 0; c < nc; c++) {
			const v = result.value[i * nc + c];
			if (v !== undefined && v > ymax) ymax = v;
		}
	}
	return ymax;
}

/**
 * Repaint every coil panel.
 *
 * @param canvases - One canvas per coil, in coil order.
 * @param o - Everything to draw.
 * @returns The layout, for the overlay and for hit-testing.
 */
export function drawSignalStack(
	canvases: (HTMLCanvasElement | null)[],
	o: StackOptions,
): StackLayout | null {
	const { run, result, params, theme, display, view } = o;
	const nc = run.ncoil;
	const [vt0, vt1] = view;
	if (!(vt1 > vt0) || run.n === 0) return null;

	const i0 = lowerBound(run.t, vt0, run.n);
	const i1 = Math.min(run.n, lowerBound(run.t, vt1, run.n) + 1);

	const ymax = scaleTop(run, result, params, i0, i1);
	const projection = makeProjection(ymax, display.logScale, 3);
	const { coil: base, coilLast } = panelHeights(o.height, nc);

	const newBy = byCoil(result.geoNew, nc);
	const oldBy = recordedByCoil(run);
	const geoms: PanelGeom[] = [];
	let top = 0;

	for (let c = 0; c < nc; c++) {
		const cv = canvases[c];
		const isLast = c === nc - 1;
		const panelH = isLast ? coilLast : base;
		if (!cv) {
			top += panelH;
			continue;
		}
		const surface = setupCanvas(cv, panelH, o.width);
		if (!surface) {
			top += panelH;
			continue;
		}
		const { ctx, w } = surface;
		const plotH = panelH - PAD.t - (isLast ? AXIS_H : PAD.b);
		const g = timeGeom(w, PAD.t, plotH, vt0, vt1, projection, top);
		geoms[c] = g;

		ctx.font = `10px ${theme.font}`;

		// ── grid + y labels ───────────────────────────────────────────
		ctx.strokeStyle = theme.grid;
		ctx.lineWidth = 1;
		ctx.fillStyle = theme.muted;
		ctx.textAlign = "right";
		for (const v of projection.ticks) {
			const y = Math.round(g.Y(v)) + 0.5;
			if (y < g.y0 - 1 || y > g.y1 + 1) continue;
			line(ctx, g.x0, y, g.x1, y);
			ctx.fillText(shortNum(v), g.x0 - 6, y + 3);
		}

		// ── the hysteresis band and its edges ─────────────────────────
		// Sampled per pixel column against the same index the traces use, so
		// under MAD the curve a coil is actually being compared against is the
		// curve drawn on its panel.
		const cols = Math.max(1, Math.floor(g.x1 - g.x0));
		const armPx = new Float64Array(cols);
		const relPx = new Float64Array(cols);
		for (let px = 0; px < cols; px++) {
			const ta = vt0 + (px / cols) * (vt1 - vt0);
			const idx = Math.min(
				run.n - 1,
				Math.max(0, lowerBound(run.t, ta, run.n)),
			);
			armPx[px] = armThresholdAt(result, params, nc, idx, c);
			relPx[px] = releaseThresholdAt(result, params, nc, idx, c);
		}

		ctx.fillStyle = theme.band;
		ctx.beginPath();
		for (let px = 0; px < cols; px++) {
			ctx.lineTo(g.x0 + px + 0.5, g.Y(armPx[px]!));
		}
		for (let px = cols - 1; px >= 0; px--) {
			ctx.lineTo(g.x0 + px + 0.5, g.Y(relPx[px]!));
		}
		ctx.closePath();
		ctx.fill();

		const edge = (arr: Float64Array, dash: number[]) => {
			ctx.setLineDash(dash);
			ctx.strokeStyle = theme.threshold;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			for (let px = 0; px < cols; px++) {
				const x = g.x0 + px + 0.5;
				const y = g.Y(arr[px]!);
				if (px) ctx.lineTo(x, y);
				else ctx.moveTo(x, y);
			}
			ctx.stroke();
			ctx.setLineDash([]);
		};
		edge(armPx, [5, 3]);
		// Decided from the parameters, not from one pixel column: under MAD the
		// two curves can touch at a single sample while differing everywhere
		// else, and sampling the rightmost column there would drop the whole
		// release curve and its label for that panel.
		if (hasHysteresis(params)) edge(relPx, [2, 3]);

		// ── the traces ────────────────────────────────────────────────
		// Unfiltered underneath in a recessive tone, filtered on top: the
		// filter's effect is the difference between them, invisible if only one
		// is drawn and unreadable if both are equally prominent.
		if (display.showUnfiltered) {
			strokeMinMax(
				ctx,
				g,
				run.t,
				run.n,
				vt0,
				vt1,
				(i) => Math.max(run.raw1[i * nc + c]!, run.raw2[i * nc + c]!),
				theme.raw,
				1,
			);
		}
		strokeMinMax(
			ctx,
			g,
			run.t,
			run.n,
			vt0,
			vt1,
			(i) => result.value[i * nc + c]!,
			theme.signal,
			1.5,
		);

		// A recorded alert and a replayed one at the same peak sit at the same
		// point. A filled dot inside an open ring keeps both readable, and the
		// shape difference survives colour blindness.
		if (display.showReplayed) {
			drawMarks(
				ctx,
				newBy[c]!,
				g,
				theme.replayed,
				vt0,
				vt1,
				"fill",
				theme,
			);
		}
		if (display.showRecorded) {
			drawMarks(
				ctx,
				oldBy[c]!,
				g,
				theme.recorded,
				vt0,
				vt1,
				"ring",
				theme,
			);
		}

		// ── threshold values, written where the lines are ─────────────
		// In fixed mode every panel carries the same pair, so labelling the
		// first and the last is enough — and the last matters because the first
		// is usually scrolled out of view.
		if (c === 0 || isLast || params.detector === "mad") {
			const armV = armPx[cols - 1]!;
			const relV = relPx[cols - 1]!;
			ctx.textAlign = "right";
			const tag = (v: number, text: string, dy: number) => {
				const y = Math.max(9, Math.min(g.y1 - 2, g.Y(v) + dy));
				const tw = ctx.measureText(text).width;
				ctx.fillStyle = theme.surface;
				ctx.fillRect(g.x1 - tw - 5, y - 8, tw + 5, 11);
				ctx.fillStyle = theme.threshold;
				ctx.fillText(text, g.x1 - 2, y);
			};
			tag(armV, `arm ${shortNum(armV)}`, -3);
			if (hasHysteresis(params)) {
				tag(relV, `release ${shortNum(relV)}`, 10);
			}
		}

		// ── axis ──────────────────────────────────────────────────────
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

		// ── the coil's own label, top-left inside the plot ────────────
		ctx.textAlign = "left";
		ctx.fillStyle = theme.muted;
		const label = display.showRecorded
			? `coil ${run.coilIds[c]} — ${newBy[c]!.length} now, ${oldBy[c]!.length} recorded`
			: `coil ${run.coilIds[c]} — ${newBy[c]!.length} now`;
		ctx.fillText(label, g.x0 + 4, g.y0 + 10);

		top += panelH;
	}

	return {
		geoms,
		ymax,
		countsNew: newBy.map((d) => d.length),
		countsOld: oldBy.map((d) => d.length),
		height: top,
	};
}

/** Draw one coil's detection marks. */
function drawMarks(
	ctx: CanvasRenderingContext2D,
	dets: Mark[],
	g: PanelGeom,
	color: string,
	vt0: number,
	vt1: number,
	style: "fill" | "ring",
	theme: EmiTheme,
): void {
	for (const d of dets) {
		if (d.t < vt0 || d.t > vt1) continue;
		if (!Number.isFinite(d.amp)) continue;
		const x = g.X(d.t);
		const y = g.Y(d.amp);
		if (style === "ring") {
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.75;
			ctx.beginPath();
			ctx.arc(x, y, 6, 0, Math.PI * 2);
			ctx.stroke();
		} else {
			ctx.fillStyle = color;
			ctx.strokeStyle = theme.surface;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(x, y, 4, 0, Math.PI * 2);
			ctx.stroke();
			ctx.fill();
		}
	}
}

/** What the overlay draws on top of the stack. */
export interface OverlayOptions extends StackOptions {
	layout: StackLayout;
	/** Shared playhead, seconds from run start; null when nothing is hovered. */
	cursorT: number | null;
	/**
	 * Hand-picked detections, as `coil:iPeak` keys.
	 *
	 * Drawn on the overlay rather than into the panels: a pick changes often
	 * enough that redrawing every trace for it would be the most expensive
	 * thing a click does, and the overlay is already repainted on the pointer.
	 */
	picked?: ReadonlySet<string>;
}

/**
 * A panel-local y, in the overlay canvas's coordinates.
 *
 * The overlay spans the whole stack while each `PanelGeom.Y` answers in its own
 * panel's box, so every overlay draw has to add that panel's `top`. Forgetting
 * it does not fail — it draws the mark in the panel above, at a height that
 * looks like data — so the three overlay draws share this rather than each
 * remembering. The picked-detection ring is the one that forgot.
 *
 * @param g - The panel's geometry.
 * @param v - A value on that panel's vertical scale.
 * @returns The y to draw at on the overlay.
 */
function overlayY(g: PanelGeom, v: number): number {
	return g.top + g.Y(v);
}

/**
 * The links and the playhead, drawn across the panels they connect.
 *
 * A curve leaving coil 4's trace and arriving on coil 3's is the claim being
 * made: those two peaks are one object, seen twice. It is drawn between the
 * marks themselves rather than between panel edges, so both ends land exactly on
 * the peaks being talked about. The arrowhead points at the coil that fired
 * *second*, which is the direction the object travelled through the array —
 * front row to rear means the robot was driving forward over it, and the reverse
 * means it was backing up or the peak order was not what the geometry expects.
 *
 * @param cv - The overlay canvas, spanning the whole stack.
 * @param o - The same options the stack was drawn with, plus its layout.
 */
export function drawStackOverlay(
	cv: HTMLCanvasElement,
	o: OverlayOptions,
): void {
	const surface = setupCanvas(cv, o.layout.height, o.width);
	if (!surface) return;
	const { ctx, w, h } = surface;
	const { theme, result, run, view, layout } = o;
	const [vt0, vt1] = view;
	const geoms = layout.geoms;
	if (geoms.length === 0) return;

	// ── the playhead ──────────────────────────────────────────────────
	// The first *drawn* panel, not index 0: `drawSignalStack` leaves a hole at
	// any coil whose canvas or 2D context was unavailable, and every other geom
	// access below is guarded the same way.
	// ── the picked detections ─────────────────────────────────────────
	// A filled disc inside a wide ring, in the picked colour. An operator who
	// has clicked forty marks over a twenty-minute survey needs to see which
	// forty without hovering each one, and a ring alone disappears against the
	// hysteresis band on a busy coil.
	if (o.picked && o.picked.size > 0) {
		ctx.save();
		for (const d of result.geoNew) {
			if (!o.picked.has(`${d.coil}:${d.iPeak}`)) continue;
			if (d.t < vt0 || d.t > vt1) continue;
			const g = geoms[d.ci];
			if (!g || !Number.isFinite(d.amp)) continue;
			const x = g.X(d.t);
			// Through `overlayY`, not `g.Y`. This drew at the panel-local y and
			// so put every pick except coil 1's into the panel above, floating
			// over a neighbour's trace at a height that looked like data.
			// Picking a *target* is what exposed it: a target is a chain across
			// coils, so the one correct mark and the wrong ones appeared at once.
			const y = overlayY(g, d.amp);
			ctx.beginPath();
			ctx.arc(x, y, 8, 0, Math.PI * 2);
			ctx.strokeStyle = theme.picked;
			ctx.lineWidth = 2.5;
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(x, y, 2.5, 0, Math.PI * 2);
			ctx.fillStyle = theme.picked;
			ctx.fill();
		}
		ctx.restore();
	}

	const anchor = geoms.find(Boolean);
	if (anchor && o.cursorT != null && o.cursorT >= vt0 && o.cursorT <= vt1) {
		const t = o.cursorT;
		const i = Math.max(0, Math.min(run.n - 1, lowerBound(run.t, t, run.n)));
		const x = anchor.X(t);

		ctx.strokeStyle = theme.muted;
		ctx.lineWidth = 1;
		ctx.globalAlpha = 0.75;
		ctx.setLineDash([3, 3]);
		line(ctx, x, 0, x, h);
		ctx.setLineDash([]);
		ctx.globalAlpha = 1;

		ctx.fillStyle = theme.muted;
		for (let c = 0; c < geoms.length; c++) {
			const g = geoms[c];
			if (!g) continue;
			const v = result.value[i * run.ncoil + c];
			if (v === undefined || !Number.isFinite(v)) continue;
			ctx.beginPath();
			ctx.arc(x, overlayY(g, v), 3, 0, Math.PI * 2);
			ctx.fill();
		}

		const label = `${fmt(t, 2)} s`;
		ctx.font = `10px ${theme.font}`;
		const tw = ctx.measureText(label).width;
		const lx = Math.min(w - tw - 6, Math.max(2, x + 4));
		ctx.fillStyle = theme.surface;
		ctx.fillRect(lx - 2, 1, tw + 4, 12);
		ctx.fillStyle = theme.muted;
		ctx.textAlign = "left";
		ctx.fillText(label, lx, 10);
	}

	// ── the cross-coil links ──────────────────────────────────────────
	if (!o.display.showLinks || result.pairs.length === 0) return;
	ctx.strokeStyle = theme.link;
	ctx.fillStyle = theme.link;
	ctx.lineWidth = 1.25;
	// Recessive: the links annotate the traces, and at full extent a 0.8 s lag
	// is sub-pixel — a hundred of them at full strength read as a fence across
	// the chart rather than as pairings.
	ctx.globalAlpha = 0.5;
	for (const L of result.pairs) {
		const a = result.geoNew[L.a];
		const b = result.geoNew[L.b];
		if (!a || !b) continue;
		if (a.t < vt0 || a.t > vt1 || b.t < vt0 || b.t > vt1) continue;
		const ga = geoms[a.ci];
		const gb = geoms[b.ci];
		if (!ga || !gb) continue;
		const x0 = ga.X(a.t);
		const y0 = overlayY(ga, a.amp);
		const x1 = gb.X(b.t);
		const y1 = overlayY(gb, b.amp);
		const my = (y0 + y1) / 2;
		ctx.beginPath();
		ctx.moveTo(x0, y0);
		ctx.bezierCurveTo(x0, my, x1, my, x1, y1);
		ctx.stroke();

		// Stop the head short of the mark it points at, so it reads as an
		// arrival rather than sitting on top of the detection dot.
		const [tx, ty] = bezierAt(x0, y0, x0, my, x1, my, x1, y1, 0.82);
		const [ux, uy] = bezierAt(x0, y0, x0, my, x1, my, x1, y1, 0.72);
		arrowHead(ctx, ux, uy, tx, ty, 6);
	}
	ctx.globalAlpha = 1;
}

/**
 * The detection nearest a time on one coil, for hover.
 *
 * @param dets - Replayed detections on that coil.
 * @param t - Time in seconds.
 * @param tolerance - Largest distance that still counts as a hit, seconds.
 * @returns The nearest detection, or null.
 */
export function nearestDetection(
	dets: GeoDetection[],
	t: number,
	tolerance: number,
): GeoDetection | null {
	let best: GeoDetection | null = null;
	let bestD = tolerance;
	for (const d of dets) {
		const dd = Math.abs(d.t - t);
		if (dd <= bestD) {
			bestD = dd;
			best = d;
		}
	}
	return best;
}
