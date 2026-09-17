/**
 * Min/max-per-pixel-column decimation for the time-series chart.
 *
 * uPlot draws every sample it is handed: a repaint costs the sample count, not
 * the pixel width. A chart holding a minute of history for several topics at
 * 30 Hz is several thousand points per repaint, redrawn tens of times a second,
 * on the same main thread that decodes robot messages. Above roughly one sample
 * per pixel column none of that work is visible — two samples in the same
 * column can only ever produce the vertical extent between them.
 *
 * So the widget resolves the window onto a fixed grid of pixel columns and
 * hands uPlot at most two points per column, the column's minimum and maximum,
 * emitted in the order they actually occurred so an excursion keeps its
 * direction. Repaint cost becomes a function of the tile's width and nothing
 * else, and the silhouette — every spike, every dropout — is preserved exactly,
 * which a sample-skipping decimation would not do.
 *
 * The newest sample is never dropped: samples beyond the window's end are
 * clamped into the last column rather than discarded, so a clock offset between
 * robot and console cannot make the live end of the trace disappear.
 *
 * Everything here is pure and allocation-free on the hot path — the caller owns
 * the output arrays and reuses them across frames.
 */

/** Fewest columns a chart is resolved onto, whatever its tile width. */
export const MIN_CHART_COLUMNS = 2;

/**
 * Most columns a chart is resolved onto. Generous enough that no realistic
 * tile is quantized, low enough that a pathological layout cannot allocate an
 * unbounded frame buffer.
 */
export const MAX_CHART_COLUMNS = 4096;

/** How a window of samples is resolved onto the column grid. */
export interface DecimateOptions {
	/** Start of the visible window, in the chart's x unit. */
	tMin: number;
	/** End of the visible window, in the chart's x unit. */
	tMax: number;
	/** Number of pixel columns; `out` must be `2 * columns` long. */
	columns: number;
	/**
	 * Factor converting one `times` entry into the chart's x unit — `0.001`
	 * for buffers timestamped in milliseconds drawn on a seconds axis.
	 * Defaults to `1`.
	 */
	timeScale?: number;
}

/**
 * Resolve a tile width to a column count.
 *
 * @param plotWidthPx - Width of the plotting area in CSS pixels.
 * @returns A column count clamped to {@link MIN_CHART_COLUMNS} …
 * {@link MAX_CHART_COLUMNS}; the minimum is also used for a width that is not
 * a finite positive number, which is what a tile reports before layout.
 */
export function resolveColumnCount(plotWidthPx: number): number {
	if (!Number.isFinite(plotWidthPx) || plotWidthPx <= 0) {
		return MIN_CHART_COLUMNS;
	}
	return Math.min(
		MAX_CHART_COLUMNS,
		Math.max(MIN_CHART_COLUMNS, Math.round(plotWidthPx)),
	);
}

/**
 * Index of the first entry of an ascending array that is at or after a bound.
 *
 * Lets a frame skip the part of a buffer that has already scrolled out of the
 * window instead of scanning it, which matters because the scan runs once per
 * series per frame.
 *
 * @param times - Ascending timestamps.
 * @param bound - Lower bound, in the same unit as `times`.
 * @returns The first index whose value is `>= bound`, or `times.length` when
 * every entry is below it.
 */
export function firstIndexAtOrAfter(
	times: readonly number[],
	bound: number,
): number {
	let low = 0;
	let high = times.length;

	while (low < high) {
		const mid = (low + high) >> 1;
		if ((times[mid] as number) < bound) low = mid + 1;
		else high = mid;
	}

	return low;
}

/**
 * Fill the shared x array for a column grid.
 *
 * Each column contributes two strictly increasing positions — the column's
 * start and its midpoint — so the two points a column can emit have distinct,
 * ascending x values, as uPlot requires. The largest x error this introduces is
 * half a column, which is half a pixel.
 *
 * @param tMin - Start of the visible window, in the chart's x unit.
 * @param tMax - End of the visible window, in the chart's x unit.
 * @param columns - Number of pixel columns.
 * @param out - Destination of length `2 * columns`, written in place.
 */
export function buildColumnGrid(
	tMin: number,
	tMax: number,
	columns: number,
	out: number[],
): void {
	const step = (tMax - tMin) / columns;
	const half = step / 2;

	for (let column = 0; column < columns; column++) {
		const base = tMin + column * step;
		out[2 * column] = base;
		out[2 * column + 1] = base + half;
	}
}

/**
 * Whether a buffered value can be plotted, and its numeric form.
 *
 * Only numbers and booleans are accepted. A boolean becomes 0/1 so a state
 * topic bound through a property path still draws; anything else — `null` from
 * a property path that did not resolve, a string, an object — is skipped
 * rather than coerced, because `Number(null)` is `0` and a false zero on a
 * robot console is worse than a gap.
 *
 * @param value - Raw buffered value.
 * @returns The plottable number, or `null` when the value is not one.
 */
function plottableValue(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value === "boolean") return value ? 1 : 0;
	return null;
}

/**
 * Decimate one series' buffer onto the column grid.
 *
 * Writes at most two values per column into `out`: the column's minimum and
 * maximum, ordered by the time they occurred. A column holding a single sample,
 * or several equal ones, writes one value and leaves the second slot `null`;
 * columns with no sample stay `null` and are bridged by the series' `spanGaps`,
 * exactly as an unpopulated timestamp was before.
 *
 * @param times - Ascending sample timestamps, in the buffer's own unit.
 * @param values - Sample values, parallel to `times`.
 * @param out - Destination of length `2 * options.columns`, cleared and written
 * in place so a frame allocates nothing.
 * @param options - Window and grid to resolve onto.
 */
export function decimateSeries(
	times: readonly number[],
	values: readonly unknown[],
	out: (number | null)[],
	options: DecimateOptions,
): void {
	const { tMin, tMax, columns, timeScale = 1 } = options;

	out.fill(null);

	if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return;
	if (!(tMax > tMin) || columns < 1) return;

	const length = Math.min(times.length, values.length);
	if (length === 0) return;

	const step = (tMax - tMin) / columns;

	let column = -1;
	let count = 0;
	let minValue = 0;
	let maxValue = 0;
	let minTime = 0;
	let maxTime = 0;

	/** Write the column being accumulated into its two output slots. */
	const flush = (): void => {
		if (column < 0 || count === 0) return;
		const slot = 2 * column;

		if (count === 1 || minValue === maxValue) {
			out[slot] = minValue;
			return;
		}

		if (minTime <= maxTime) {
			out[slot] = minValue;
			out[slot + 1] = maxValue;
		} else {
			out[slot] = maxValue;
			out[slot + 1] = minValue;
		}
	};

	// Samples older than the window are skipped outright rather than scanned.
	for (
		let index = firstIndexAtOrAfter(times, tMin / timeScale);
		index < length;
		index++
	) {
		const value = plottableValue(values[index]);
		if (value === null) continue;

		const time = (times[index] as number) * timeScale;

		// Clamping rather than breaking is what keeps the newest sample: a
		// robot clock running ahead of the console puts fresh samples past
		// `tMax`, and dropping those would blank the live end of the trace.
		let target = Math.floor((time - tMin) / step);
		if (target < 0) target = 0;
		else if (target >= columns) target = columns - 1;

		if (target !== column) {
			flush();
			column = target;
			count = 0;
		}

		if (count === 0) {
			minValue = value;
			maxValue = value;
			minTime = time;
			maxTime = time;
		} else {
			if (value < minValue) {
				minValue = value;
				minTime = time;
			}
			if (value > maxValue) {
				maxValue = value;
				maxTime = time;
			}
		}

		count++;
	}

	flush();
}
