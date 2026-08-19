/**
 * W10 — repeatability across runs.
 *
 * Several passes over the same ground, replayed at the *same* parameters and
 * clustered together, so a detection can be asked the only question that
 * matters after tuning: does it come back?
 *
 * ## Coverage, and why it is the hard part
 *
 * Runs over one area do not cover the same ground. Without accounting for that,
 * "seen on one run only" silently merges two completely different statements —
 * "the others looked and saw nothing" and "the others never drove there" — and
 * only the first of them is evidence. Every cluster is therefore scored against
 * the runs that actually passed within reach of it, and a cluster is called
 * *disputed* only when another run covered it and did not see it.
 */

import { coilValue, emaFilter } from "../detector/ema";
import { runAtr } from "../detector/atr";
import { georeference, offsetsForFrame, toEnu } from "../detector/georeference";
import { madBaseline, runMad } from "../detector/mad";
import { madWindows } from "../detector/replay";
import type { EmiParams } from "../detector/params";
import type { EmiRun } from "../detector/run-types";
import type { EmiTheme } from "./emi-theme";
import { fmt, line, setupCanvas } from "./canvas-chart";

/** Grid cell for the coverage test, metres. */
const CELL = 1.0;
/** Track points sampled per run for the coverage grid and the drawn track. */
const TRACK_STRIDE = 4;

/**
 * One detection, placed in the shared frame.
 *
 * `run` is the run's **id**, not its label: a label is the datasource's title
 * and two recordings opened through the same source carry the same one, which
 * would collapse two passes into one member and make "seen by every run"
 * unreachable.
 */
interface Placed {
	x: number;
	y: number;
	t: number;
	amp: number;
	run: string;
}

/** A place several runs may or may not agree about. */
export interface Cluster {
	x: number;
	y: number;
	members: Placed[];
	runs: Set<string>;
	bestAmp: number;
	/** Runs that drove within reach of it. */
	covered: Set<string>;
	/** Covered by others and seen by only one — evidence against, not absence. */
	disputed: boolean;
}

/** The whole comparison. */
export interface Overlay {
	/** Run ids, in the order they were replayed. */
	runs: string[];
	/** Their display labels, same order; not unique. */
	labels: string[];
	clusters: Cluster[];
	tracks: Array<{ id: string; label: string; pts: Array<[number, number]> }>;
	detections: number;
	/** Wall time the comparison took, milliseconds. */
	ms: number;
}

/**
 * Replay several runs at one parameter set and cluster the results.
 *
 * @param runs - Runs to compare; the first supplies the shared origin.
 * @param params - Parameters applied to every one of them.
 * @param leverArm - Antenna offset in the body frame.
 * @param radiusM - Agreement radius.
 * @returns The comparison, or null when there is nothing to compare.
 */
export function buildOverlay(
	runs: readonly EmiRun[],
	params: EmiParams,
	leverArm: readonly [number, number],
	radiusM: number,
): Overlay | null {
	if (runs.length === 0) return null;
	const t0 = performance.now();
	const base = runs[0]!;

	const all: Placed[] = [];
	const tracks: Array<{
		id: string;
		label: string;
		pts: Array<[number, number]>;
	}> = [];

	for (const run of runs) {
		if (run.n === 0) continue;
		// Every run carries its own projection origin; expressing them all in
		// the first run's frame is a translation, not a re-projection, because
		// they are metres from the same flat-earth approximation.
		const [dx, dy] = toEnu(
			run.originLat,
			run.originLon,
			base.originLat,
			base.originLon,
		);

		const windows = madWindows(params, run.sampleRateHz);
		const f1 = emaFilter(run.raw1, run.n, run.ncoil, params.alpha);
		const f2 = emaFilter(run.raw2, run.n, run.ncoil, params.alpha);
		const value = coilValue(f1, f2, run.n, run.ncoil);

		const dets =
			params.detector === "mad"
				? runMad(
						run.t,
						value,
						run.n,
						run.ncoil,
						run.coilIds,
						madBaseline(
							value,
							run.n,
							run.ncoil,
							// One derivation, not a second copy: `madWindows`
							// additionally floors the rate at 32 Hz, and a run
							// missing its rate would otherwise get an
							// eight-sample baseline here and a 512-sample one
							// everywhere else.
							windows.wBase,
							windows.wDet,
							windows.stride,
						),
						{
							madFactor: params.madFactor,
							madRearmRatio: params.madRearmRatio,
							dwell: params.rearmDwellS,
							madFreeze: params.madFreeze,
						},
					)
				: runAtr(
						run.t,
						value,
						run.n,
						run.ncoil,
						run.coilIds,
						{
							mode: "schmitt",
							threshold: params.threshold,
							ratio: params.releaseRatio,
							dwell: params.rearmDwellS,
						},
						null,
					);

		const geo = georeference(
			dets,
			run,
			offsetsForFrame(run, params.gnssFrame, leverArm),
			{ mode: "schmitt", yawAt: params.yawAt, frame: params.gnssFrame },
		);
		for (const d of geo) {
			all.push({
				x: d.x + dx,
				y: d.y + dy,
				t: d.t,
				amp: d.amp,
				run: run.id,
			});
		}

		const pts: Array<[number, number]> = [];
		for (let i = 0; i < run.n; i += TRACK_STRIDE) {
			const x = run.sx[i]!;
			const y = run.sy[i]!;
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
			pts.push([x + dx, y + dy]);
		}
		tracks.push({ id: run.id, label: run.label, pts });
	}

	// Greedy centroid clustering — the same rule the tracker uses. Nearest
	// centroid within the radius, never nearest member, so a chain of
	// neighbours cannot percolate into one giant cluster.
	const clusters: Cluster[] = [];
	// Greedy clustering is order-dependent, so the order must not depend on how
	// two recordings elapsed times happen to line up: run first, then time.
	all.sort((a, b) => (a.run === b.run ? a.t - b.t : a.run < b.run ? -1 : 1));
	for (const d of all) {
		let best: Cluster | null = null;
		let bestD = Infinity;
		for (const c of clusters) {
			const dd = Math.hypot(d.x - c.x, d.y - c.y);
			if (dd < bestD) {
				bestD = dd;
				best = c;
			}
		}
		if (best && bestD <= radiusM) {
			best.members.push(d);
			best.runs.add(d.run);
			best.x += (d.x - best.x) / best.members.length;
			best.y += (d.y - best.y) / best.members.length;
			if (d.amp > best.bestAmp) best.bestAmp = d.amp;
		} else {
			clusters.push({
				x: d.x,
				y: d.y,
				members: [d],
				runs: new Set([d.run]),
				bestAmp: d.amp,
				covered: new Set(),
				disputed: false,
			});
		}
	}

	// Coverage.
	const reach = radiusM + 0.5;
	// The grid is a broad phase only. Its plus-or-minus span block reaches about
	// three metres at the default radius, so trusting cell membership alone
	// would call a cluster "covered" by a survey line three metres away, and
	// then report it as disputed: the one output an operator would act on.
	const cells = new Map<string, Map<string, Array<[number, number]>>>();
	for (const t of tracks) {
		const grid = new Map<string, Array<[number, number]>>();
		for (const p of t.pts) {
			const key = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
			let bucket = grid.get(key);
			if (!bucket) grid.set(key, (bucket = []));
			bucket.push(p);
		}
		cells.set(t.id, grid);
	}
	const span = Math.ceil(reach / CELL);
	const reach2 = reach * reach;
	for (const c of clusters) {
		const gx = Math.floor(c.x / CELL);
		const gy = Math.floor(c.y / CELL);
		for (const [id, grid] of cells) {
			let hit = false;
			for (let i = -span; i <= span && !hit; i++) {
				for (let j = -span; j <= span && !hit; j++) {
					const bucket = grid.get(`${gx + i},${gy + j}`);
					if (!bucket) continue;
					for (const [px, py] of bucket) {
						const dx = px - c.x;
						const dy = py - c.y;
						if (dx * dx + dy * dy <= reach2) {
							hit = true;
							break;
						}
					}
				}
			}
			if (hit) c.covered.add(id);
		}
		// A run that detected it necessarily drove over it.
		for (const rn of c.runs) c.covered.add(rn);
		c.disputed = c.runs.size === 1 && c.covered.size >= 2;
	}

	clusters.sort((a, b) => b.runs.size - a.runs.size || b.bestAmp - a.bestAmp);

	return {
		runs: tracks.map((t) => t.id),
		labels: tracks.map((t) => t.label),
		clusters,
		tracks,
		detections: all.length,
		ms: performance.now() - t0,
	};
}

/** Ordinal ramp for "how many runs agree" — one hue, stepped for legibility. */
const RAMP_LIGHT = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];
const RAMP_DARK = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];

/** Colour for a cluster seen on `nRuns` of `maxRuns`. */
export function rampColor(
	nRuns: number,
	maxRuns: number,
	dark: boolean,
): string {
	const ramp = dark ? RAMP_DARK : RAMP_LIGHT;
	if (maxRuns <= 1) return ramp[ramp.length - 1]!;
	const f = (nRuns - 1) / (maxRuns - 1);
	return ramp[
		Math.max(
			0,
			Math.min(ramp.length - 1, Math.round(f * (ramp.length - 1))),
		)
	]!;
}

/** Everything an overlay repaint reads. */
export interface OverlayDrawOptions {
	overlay: Overlay;
	theme: EmiTheme;
	width: number;
	height: number;
}

/**
 * Draw the overlay: tracks recessive, clusters coloured by agreement.
 *
 * @param cv - The canvas.
 * @param o - Everything to draw.
 */
export function drawOverlay(
	cv: HTMLCanvasElement,
	o: OverlayDrawOptions,
): void {
	const surface = setupCanvas(cv, o.height, o.width);
	if (!surface) return;
	const { ctx, w, h } = surface;
	const { overlay, theme } = o;

	let xmin = Infinity;
	let xmax = -Infinity;
	let ymin = Infinity;
	let ymax = -Infinity;
	const consider = (x: number, y: number) => {
		if (x < xmin) xmin = x;
		if (x > xmax) xmax = x;
		if (y < ymin) ymin = y;
		if (y > ymax) ymax = y;
	};
	for (const t of overlay.tracks) for (const [x, y] of t.pts) consider(x, y);
	for (const c of overlay.clusters) consider(c.x, c.y);
	if (!Number.isFinite(xmin)) {
		ctx.fillStyle = theme.muted;
		ctx.font = `12px ${theme.font}`;
		ctx.fillText("nothing to compare yet", 14, 26);
		return;
	}

	const pad = 16;
	const spanX = Math.max(xmax - xmin, 1);
	const spanY = Math.max(ymax - ymin, 1);
	const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad - 18) / spanY);
	const cx = (xmin + xmax) / 2;
	const cy = (ymin + ymax) / 2;
	const X = (x: number) => w / 2 + (x - cx) * s;
	const Y = (y: number) => (h - 18) / 2 - (y - cy) * s;

	// Tracks first and faint: they are the context, not the subject.
	ctx.strokeStyle = theme.axis;
	ctx.lineWidth = 1;
	ctx.globalAlpha = 0.35;
	for (const t of overlay.tracks) {
		ctx.beginPath();
		t.pts.forEach(([x, y], i) => {
			if (i) ctx.lineTo(X(x), Y(y));
			else ctx.moveTo(X(x), Y(y));
		});
		ctx.stroke();
	}
	ctx.globalAlpha = 1;

	const maxRuns = overlay.runs.length;
	for (const c of overlay.clusters) {
		const x = X(c.x);
		const y = Y(c.y);
		if (c.disputed) {
			// The one case that is evidence against rather than absence of
			// evidence: another run drove over it and saw nothing.
			ctx.strokeStyle = theme.warn;
			ctx.lineWidth = 1.5;
			ctx.setLineDash([3, 2]);
			ctx.beginPath();
			ctx.arc(x, y, 6, 0, Math.PI * 2);
			ctx.stroke();
			ctx.setLineDash([]);
			continue;
		}
		ctx.fillStyle = rampColor(c.runs.size, maxRuns, theme.dark);
		ctx.strokeStyle = theme.surface;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(
			x,
			y,
			c.runs.size >= maxRuns && maxRuns > 1 ? 6 : 4.5,
			0,
			Math.PI * 2,
		);
		ctx.stroke();
		ctx.fill();
	}

	// Scale bar — a metric picture with no scale is a shape.
	const barM = niceBar(spanX);
	const barPx = barM * s;
	if (barPx > 20 && barPx < w * 0.6) {
		ctx.strokeStyle = theme.muted;
		ctx.lineWidth = 1.5;
		line(ctx, pad, h - 8.5, pad + barPx, h - 8.5);
		ctx.fillStyle = theme.muted;
		ctx.font = `10px ${theme.font}`;
		ctx.textAlign = "left";
		ctx.fillText(`${fmt(barM, barM < 1 ? 1 : 0)} m`, pad, h - 12);
	}
}

/** A round distance about a fifth of the visible span. */
function niceBar(spanM: number): number {
	const target = spanM / 5;
	const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];
	return steps.find((v) => v >= target) ?? 500;
}
