/**
 * Per-series settings of the time-series chart, and the pure resolution of
 * those settings into the axis grouping uPlot needs.
 *
 * uPlot has no notion of "this series has its own axis": a series names a
 * *scale*, and an axis is drawn for a scale on a given side. Several series
 * that agree on side, bounds and label therefore have to collapse onto one
 * scale, or the chart grows a redundant axis per series and the plotting area
 * disappears. That collapse is the whole job of {@link resolveChartAxes}, and
 * it is pure so the grouping can be tested without a canvas.
 */

import type { SelectedTopic } from "@workspace/ormi-core/datasources";

/** How a series is drawn: a connected line, or unconnected points. */
export type ChartSeriesType = "line" | "scatter";

/** Stroke pattern of a line series. */
export type ChartLineStyle = "solid" | "dashed" | "dotted";

/** Side of the plotting area an axis is drawn on. */
export type ChartAxisSide = "left" | "right";

/** Bounds, label and side of one y axis. */
export interface ChartAxisSettings extends Record<string, unknown> {
	/** Lower bound; omitted to auto-range from the data. */
	yMin?: number;
	/** Upper bound; omitted to auto-range from the data. */
	yMax?: number;
	/** Axis label. */
	yLabel?: string;
	/** Side of the plot the axis is drawn on. Defaults to `"left"`. */
	side?: ChartAxisSide;
}

/** One plotted series. */
export interface ChartSeriesSettings extends Record<string, unknown> {
	/** Topic, or topic property, supplying the values. */
	topic: SelectedTopic;
	/** Legend label; falls back to the topic (and property) name. */
	title?: string;
	/** Stroke colour; falls back to a colour derived from the topic name. */
	color?: string;
	/** Whether the area under the line is filled. */
	fill?: boolean;
	/** Line or points. Defaults to `"line"`. */
	type?: ChartSeriesType;
	/** Draw a line series as a spline rather than straight segments. */
	smooth?: boolean;
	/** Line width in CSS pixels. Defaults to `1`. */
	lineWidth?: number;
	/** Stroke pattern. Defaults to `"solid"`. */
	lineStyle?: ChartLineStyle;
	/** Draw a marker at each sample. */
	points?: boolean;
	/** Marker diameter in CSS pixels. Defaults to `4`. */
	pointSize?: number;
	/** Axis overrides for this series; unset fields fall back to the chart's. */
	axis?: ChartAxisSettings;
}

/** One y axis resolved from the series that share it. */
export interface ResolvedChartAxis {
	/** uPlot scale key the axis and its series are bound to. */
	scale: string;
	/** Side of the plot the axis is drawn on. */
	side: ChartAxisSide;
	/** Axis label, or `undefined` when none was configured. */
	label: string | undefined;
	/** Lower bound, or `null` to auto-range. */
	min: number | null;
	/** Upper bound, or `null` to auto-range. */
	max: number | null;
}

/** Axis grouping for one chart. */
export interface ResolvedChartAxes {
	/** Axes in first-use order; the first one carries the grid. */
	axes: ResolvedChartAxis[];
	/** Scale key per input series, parallel to the series array. */
	scaleKeys: string[];
}

/** Default line width, in CSS pixels. */
const DEFAULT_LINE_WIDTH = 1;

/** Default marker diameter, in CSS pixels. */
const DEFAULT_POINT_SIZE = 4;

/**
 * Coerce a configured bound to a number or to "auto".
 * @param value - Raw configured bound.
 * @returns The bound, or `null` when it is absent or not a finite number.
 */
function boundOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Coerce a configured label to a non-empty string.
 * @param value - Raw configured label.
 * @returns The trimmed label, or `undefined` when there is nothing to draw.
 */
function labelOrUndefined(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve every series onto the smallest set of y axes that can carry them.
 *
 * A series' own `axis` is merged **over** the chart-wide one field by field
 * rather than replacing it: automatic topic placement seeds an appended series
 * with the first value of every enum it finds, so a routed series arrives
 * carrying `{ side: "left" }` and nothing else. Replacing wholesale would make
 * that series silently ignore the chart's configured bounds and label.
 *
 * Series that agree on side, bounds and label share a scale, so the common case
 * — nothing configured per series — yields exactly one axis.
 *
 * @param series - Series settings, in configuration order.
 * @param fallback - Chart-wide axis settings applied where a series is silent.
 * @returns The axes to draw and the scale key each series belongs to.
 */
export function resolveChartAxes(
	series: readonly ChartSeriesSettings[],
	fallback?: ChartAxisSettings,
): ResolvedChartAxes {
	const axes: ResolvedChartAxis[] = [];
	const scaleKeys: string[] = [];
	const byKey = new Map<string, string>();

	for (const entry of series) {
		const side: ChartAxisSide =
			(entry.axis?.side ?? fallback?.side) === "right" ? "right" : "left";
		const min = boundOrNull(entry.axis?.yMin ?? fallback?.yMin);
		const max = boundOrNull(entry.axis?.yMax ?? fallback?.yMax);
		const label = labelOrUndefined(entry.axis?.yLabel ?? fallback?.yLabel);

		const key = `${side}|${min ?? ""}|${max ?? ""}|${label ?? ""}`;
		let scale = byKey.get(key);

		if (scale === undefined) {
			scale = `y${axes.length}`;
			byKey.set(key, scale);
			axes.push({ scale, side, label, min, max });
		}

		scaleKeys.push(scale);
	}

	return { axes, scaleKeys };
}

/**
 * Legend label for a series.
 *
 * @param entry - Series settings.
 * @returns The configured title, else the topic name with the bound property
 * appended when the series plots a property rather than the message itself.
 */
export function resolveSeriesLabel(entry: ChartSeriesSettings): string {
	const title = entry.title?.trim();
	if (title) return title;

	const property = entry.topic?.property;
	if (property) {
		return `${entry.topic.topic}.${property.replaceAll("-", ".")}`;
	}

	return entry.topic?.topic ?? "";
}

/**
 * Dash pattern for a stroke style.
 *
 * Scaled by line width so a thick dashed line does not read as solid.
 *
 * @param style - Configured stroke pattern.
 * @param width - Line width in CSS pixels.
 * @returns A uPlot dash array, or `undefined` for a solid stroke.
 */
export function resolveDash(
	style: ChartLineStyle | undefined,
	width: number,
): number[] | undefined {
	const unit = Math.max(1, width);

	if (style === "dashed") return [unit * 5, unit * 3];
	if (style === "dotted") return [unit, unit * 3];
	return undefined;
}

/**
 * Line width for a series, clamped to something uPlot can draw.
 * @param entry - Series settings.
 * @returns The configured width, or the default when it is absent or invalid.
 */
export function resolveLineWidth(entry: ChartSeriesSettings): number {
	const width = entry.lineWidth;
	if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
		return DEFAULT_LINE_WIDTH;
	}
	return Math.min(20, width);
}

/**
 * Marker diameter for a series, clamped to something uPlot can draw.
 * @param entry - Series settings.
 * @returns The configured size, or the default when it is absent or invalid.
 */
export function resolvePointSize(entry: ChartSeriesSettings): number {
	const size = entry.pointSize;
	if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
		return DEFAULT_POINT_SIZE;
	}
	return Math.min(40, size);
}
