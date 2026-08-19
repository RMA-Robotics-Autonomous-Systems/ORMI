/**
 * The drawing substrate the EMI panels share.
 *
 * ## Why canvas rather than uPlot
 *
 * The plan carried this as an open verification item, and the answer is canvas.
 * uPlot is a dependency of this monorepo and the standard time-series widget
 * already uses it, so the reuse instinct is right — but it is the wrong tool for
 * *these* panels, for reasons that are about the data rather than about taste:
 *
 * - **Decimation.** A survey is 10⁵ samples per coil; five coils with an
 *   unfiltered and a filtered trace is a million points per repaint. uPlot has
 *   no built-in decimation, so holding the interaction budget means reducing to
 *   one min/max pair per pixel column before handing it over — which is the
 *   whole of {@link strokeMinMax}. Having done that, uPlot is left drawing axes.
 * - **A shared scale across separate instances.** The five coil panels are one
 *   comparison and must share a y range; five uPlot instances each own theirs.
 * - **Per-pixel threshold curves and the band between them.** Under the MAD
 *   detector every coil's arm and release thresholds are moving curves. They are
 *   sampled per pixel column against the same index the traces use, and filled
 *   between — a draw-hook overlay in uPlot's terms, in this module's terms two
 *   loops.
 * - **The cross-coil links** are drawn *between* panels, so they need a canvas
 *   spanning all of them regardless of what draws inside each one.
 *
 * What is genuinely lost is uPlot's cursor, legend and axis machinery; the axes
 * here are ~40 lines because the panels want decade ticks on a floored log
 * scale, which is not the default anywhere.
 *
 * No React, no DOM ownership: every function takes a context or a canvas that
 * someone else owns.
 */

/** A canvas set up for device-pixel-ratio drawing, in CSS pixels. */
export interface CanvasSurface {
	ctx: CanvasRenderingContext2D;
	/** Width in CSS pixels. */
	w: number;
	/** Height in CSS pixels. */
	h: number;
	dpr: number;
}

/**
 * Size a canvas to its box at device resolution and clear it.
 *
 * The transform is set so every coordinate below is a CSS pixel; without it a
 * chart on a HiDPI screen is drawn at half size and then scaled up, which is
 * what makes hand-rolled canvas charts look soft.
 *
 * @param cv - The canvas element.
 * @param cssHeight - Height to give it, CSS pixels.
 * @param cssWidth - Width to give it; defaults to its measured client width.
 * @returns The prepared context and its size, or null when the box has no area.
 */
export function setupCanvas(
	cv: HTMLCanvasElement,
	cssHeight: number,
	cssWidth?: number,
): CanvasSurface | null {
	const dpr =
		typeof window === "undefined" ? 1 : (window.devicePixelRatio ?? 1);
	const w = Math.max(1, Math.floor(cssWidth ?? cv.clientWidth ?? 0));
	const h = Math.max(1, Math.floor(cssHeight));
	if (w <= 1 || h <= 1) return null;

	const pw = Math.round(w * dpr);
	const ph = Math.round(h * dpr);
	// Assigning width/height clears the canvas, so only do it when it changed —
	// otherwise every repaint pays a full buffer reallocation.
	if (cv.width !== pw || cv.height !== ph) {
		cv.width = pw;
		cv.height = ph;
	}
	cv.style.width = `${w}px`;
	cv.style.height = `${h}px`;

	const ctx = cv.getContext("2d");
	if (!ctx) return null;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, w, h);
	return { ctx, w, h, dpr };
}

/** Powers of ten inside a range, for a log axis. */
export function decadeTicks(lo: number, hi: number): number[] {
	const out: number[] = [];
	if (!(lo > 0) || !(hi > lo)) return out;
	for (let e = Math.ceil(Math.log10(lo)); Math.pow(10, e) <= hi; e++) {
		out.push(Math.pow(10, e));
	}
	return out;
}

/**
 * Round tick values covering a range.
 *
 * @param lo - Range start.
 * @param hi - Range end.
 * @param target - Roughly how many ticks are wanted.
 * @returns Tick values, ascending.
 */
export function niceTicks(lo: number, hi: number, target = 5): number[] {
	const span = hi - lo;
	if (!(span > 0) || !Number.isFinite(span)) return [lo];
	const raw = span / Math.max(1, target);
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	const norm = raw / mag;
	const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
	const out: number[] = [];
	// Bounded: a step that underflows to zero would loop forever.
	if (!(step > 0)) return [lo, hi];
	for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
		out.push(v);
		if (out.length > 200) break;
	}
	return out;
}

/** Compact number for an axis label: 12.3k, 1.2M, 450. */
export function shortNum(v: number): string {
	const a = Math.abs(v);
	if (!Number.isFinite(v)) return "–";
	if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
	if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
	if (a >= 10) return v.toFixed(0);
	if (a >= 1) return v.toFixed(1);
	return v.toFixed(2);
}

/**
 * First index whose value is `>= v`, over `arr[0..n)`.
 *
 * The time column is the only sorted array on a run, and every panel converts a
 * pixel to an index through this. Bounded by `n` rather than by `arr.length`
 * because a growing mission's buffers are over-allocated.
 *
 * @param arr - Ascending values.
 * @param v - Value to locate.
 * @param n - Number of valid entries.
 * @returns Index in `[0, n]`.
 */
export function lowerBound(
	arr: Float64Array | Float32Array | number[],
	v: number,
	n: number,
): number {
	let lo = 0;
	let hi = n;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if ((arr[mid] as number) < v) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * The vertical projection a signal panel uses.
 *
 * Log by default: EMI coupling falls off as roughly 1/r⁶, so one run spans two
 * or three decades and a linear axis flattens everything near the threshold —
 * which is exactly the region being tuned — into the baseline. The floor exists
 * because offset removal leaves negative excursions behind, and a negative is
 * not information the detector uses: it thresholds `max(raw1, raw2)` upward.
 */
export interface Projection {
	/** Value → projected units. */
	proj: (v: number) => number;
	/** Bottom of the axis in data units. */
	ymin: number;
	/** Top of the axis in data units. */
	ymax: number;
	/** Tick values for this axis. */
	ticks: number[];
	isLog: boolean;
}

/** Where a floored log axis bottoms out, counts. */
export const LOG_FLOOR = 10;

/**
 * Build a projection for a value range.
 *
 * @param ymax - Largest value to show.
 * @param isLog - Log axis when true.
 * @param tickTarget - Roughly how many ticks a linear axis should carry.
 * @returns The projection and its ticks.
 */
export function makeProjection(
	ymax: number,
	isLog: boolean,
	tickTarget = 3,
): Projection {
	const top = Number.isFinite(ymax) && ymax > 0 ? ymax : 1;
	const ymin = isLog ? LOG_FLOOR : Math.min(0, -0.05 * top);
	return {
		proj: isLog
			? (v: number) => Math.log10(Math.max(LOG_FLOOR, v))
			: (v: number) => v,
		ymin,
		ymax: isLog ? Math.max(top, LOG_FLOOR * 10) : top,
		ticks: isLog
			? decadeTicks(ymin, Math.max(top, LOG_FLOOR * 10))
			: niceTicks(ymin, top, tickTarget),
		isLog,
	};
}

/** Pixel mapping for one panel. */
export interface PanelGeom {
	/** Time in seconds → x in CSS pixels. */
	X: (t: number) => number;
	/** Value → y in CSS pixels. */
	Y: (v: number) => number;
	/** Left edge of the plotting area. */
	x0: number;
	/** Right edge of the plotting area. */
	x1: number;
	/** Top edge of the plotting area. */
	y0: number;
	/** Bottom edge of the plotting area. */
	y1: number;
	/** Offset of this panel inside a stack, CSS pixels. Zero when standalone. */
	top: number;
}

/** Padding shared by the time panels, so their plot areas line up exactly. */
export const PAD = { l: 58, r: 12, t: 10, b: 6 } as const;

/**
 * Pixel mapping for a time panel.
 *
 * @param w - Panel width, CSS pixels.
 * @param plotTop - Top of the plotting area.
 * @param plotH - Height of the plotting area.
 * @param t0 - Time at the left edge.
 * @param t1 - Time at the right edge.
 * @param p - Projection for the vertical axis.
 * @param top - Offset of this panel within its stack.
 * @returns The mapping.
 */
export function timeGeom(
	w: number,
	plotTop: number,
	plotH: number,
	t0: number,
	t1: number,
	p: Projection,
	top = 0,
): PanelGeom {
	const x0 = PAD.l;
	const x1 = w - PAD.r;
	const span = t1 - t0 || 1;
	const pmin = p.proj(p.ymin);
	const pmax = p.proj(p.ymax);
	const pspan = pmax - pmin || 1;
	return {
		X: (t: number) => x0 + ((t - t0) / span) * (x1 - x0),
		Y: (v: number) => plotTop + (1 - (p.proj(v) - pmin) / pspan) * plotH,
		x0,
		x1,
		y0: plotTop,
		y1: plotTop + plotH,
		top,
	};
}

/**
 * Stroke a series decimated to one min/max pair per pixel column.
 *
 * This is what makes the cost of a repaint depend on the width of the panel
 * rather than on the length of the recording. Drawing a vertical segment from
 * the column's minimum to its maximum keeps every spike — which matters here,
 * because a spike *is* the signal. Sub-sampling instead would let a one-sample
 * peak vanish at full zoom-out and reappear on zoom-in, so a detection would
 * appear to have no cause.
 *
 * @param ctx - Target context.
 * @param g - Panel mapping.
 * @param times - Sample times, ascending.
 * @param n - Valid sample count.
 * @param t0 - Time at the left edge.
 * @param t1 - Time at the right edge.
 * @param get - Value at a sample index.
 * @param color - Stroke colour.
 * @param width - Stroke width.
 */
export function strokeMinMax(
	ctx: CanvasRenderingContext2D,
	g: PanelGeom,
	times: Float64Array,
	n: number,
	t0: number,
	t1: number,
	get: (i: number) => number,
	color: string,
	width: number,
): void {
	const cols = Math.max(1, Math.floor(g.x1 - g.x0));
	const span = t1 - t0 || 1;
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.beginPath();
	let started = false;
	for (let px = 0; px < cols; px++) {
		const ta = t0 + (px / cols) * span;
		const tb = t0 + ((px + 1) / cols) * span;
		const a = lowerBound(times, ta, n);
		let b = lowerBound(times, tb, n);
		if (b <= a) b = a + 1;
		let mn = Infinity;
		let mx = -Infinity;
		for (let i = a; i < b && i < n; i++) {
			const v = get(i);
			if (v < mn) mn = v;
			if (v > mx) mx = v;
		}
		if (!Number.isFinite(mn)) continue;
		const x = g.x0 + px + 0.5;
		if (!started) {
			ctx.moveTo(x, g.Y(mx));
			started = true;
		}
		ctx.lineTo(x, g.Y(mx));
		ctx.lineTo(x, g.Y(mn));
	}
	ctx.stroke();
}

/** A straight line, in CSS pixels. */
export function line(
	ctx: CanvasRenderingContext2D,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): void {
	ctx.beginPath();
	ctx.moveTo(x0, y0);
	ctx.lineTo(x1, y1);
	ctx.stroke();
}

/** Point on a cubic bezier at parameter `t`. */
export function bezierAt(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	x3: number,
	y3: number,
	t: number,
): [number, number] {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return [
		a * x0 + b * x1 + c * x2 + d * x3,
		a * y0 + b * y1 + c * y2 + d * y3,
	];
}

/** An arrowhead at `(x1,y1)` pointing away from `(x0,y0)`. */
export function arrowHead(
	ctx: CanvasRenderingContext2D,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	size: number,
): void {
	const a = Math.atan2(y1 - y0, x1 - x0);
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(
		x1 - size * Math.cos(a - Math.PI / 7),
		y1 - size * Math.sin(a - Math.PI / 7),
	);
	ctx.lineTo(
		x1 - size * Math.cos(a + Math.PI / 7),
		y1 - size * Math.sin(a + Math.PI / 7),
	);
	ctx.closePath();
	ctx.fill();
}

/** Format a number with a fixed number of decimals, tolerating NaN. */
export function fmt(v: number, digits = 1): string {
	return Number.isFinite(v) ? v.toFixed(digits) : "–";
}
