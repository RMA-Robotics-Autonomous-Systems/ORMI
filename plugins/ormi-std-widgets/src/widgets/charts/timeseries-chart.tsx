import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	LocalDataSourcesProvider,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import {
	getColorsFromString,
	getTransparentColorString,
} from "@workspace/utils";
import { ChartLineIcon } from "lucide-react";
import { useTheme } from "next-themes";
import React, { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import {
	buildColumnGrid,
	decimateSeries,
	resolveColumnCount,
} from "./chart-decimation";
import {
	ChartAxisSettings,
	ChartSeriesSettings,
	ResolvedChartAxis,
	resolveChartAxes,
	resolveDash,
	resolveLineWidth,
	resolvePointSize,
	resolveSeriesLabel,
} from "./chart-series";

/** Settings for the time series chart widget. */
export interface TimeSeriesSettings extends Record<string, unknown> {
	/** Widget title. */
	title: string;
	/** Width of the visible window, in seconds. */
	timeHistory: number;
	/** How often the chart is redrawn, in Hz. */
	updateFrequency: number;
	/** Chart-wide axis settings; a series may override them. */
	axis?: ChartAxisSettings;
	/** Plotted series. */
	topics: ChartSeriesSettings[];
}

/** Depth of each topic's buffer, in samples. */
const BUFFER_SIZE = 2000;

/** Smallest window the chart will draw, in seconds. */
const MIN_TIME_HISTORY = 0.1;

/** Redraw rate bounds, in Hz. */
const MIN_UPDATE_HZ = 1;
const MAX_UPDATE_HZ = 120;

/** Buffer timestamps are milliseconds; uPlot's time axis is seconds. */
const MS_TO_SECONDS = 0.001;

/** Everything the frame loop needs that must not restart the uPlot instance. */
interface LiveFrameInputs {
	settings: TimeSeriesSettings;
	getSource: ReturnType<typeof useLocalDataSource>["getSource"];
}

/** uPlot configuration derived from the widget's settings and the theme. */
interface ChartPlan {
	series: uPlot.Series[];
	axes: ResolvedChartAxis[];
	axisStroke: string;
	gridStroke: string;
}

/**
 * Clamp a configured number into a usable range.
 * @param value - Raw configured value.
 * @param fallback - Value used when the setting is absent or not finite.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The clamped value.
 */
function clampSetting(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
): number {
	const candidate =
		typeof value === "number" && Number.isFinite(value) ? value : fallback;
	return Math.min(max, Math.max(min, candidate));
}

/**
 * Build the uPlot series descriptors and axis grouping for a set of settings.
 *
 * Kept out of the render effect so the effect depends on one memoised value
 * rather than on every individual setting, and so the uPlot instance is torn
 * down only when something it cannot be updated in place for actually changed.
 *
 * @param topics - Series settings, in configuration order.
 * @param axis - Chart-wide axis settings.
 * @param light - Whether the light theme is active.
 * @returns The plan the render effect assembles `uPlot.Options` from.
 */
function buildChartPlan(
	topics: readonly ChartSeriesSettings[],
	axis: ChartAxisSettings | undefined,
	light: boolean,
): ChartPlan {
	const { axes, scaleKeys } = resolveChartAxes(topics, axis);

	const series: uPlot.Series[] = [{ label: "Time" }];

	topics.forEach((entry, index) => {
		const color =
			entry.color || getColorsFromString(entry.topic?.topic ?? "");
		const width = resolveLineWidth(entry);
		const scatter = entry.type === "scatter";
		const dash = resolveDash(entry.lineStyle, width);

		series.push({
			label: resolveSeriesLabel(entry),
			scale: scaleKeys[index],
			stroke: color,
			width,
			spanGaps: true,
			...(entry.fill
				? { fill: getTransparentColorString(color, 0.4) }
				: {}),
			...(scatter
				? // A path builder returning null draws no line, which leaves
					// the points as the whole series.
					{ paths: () => null }
				: entry.smooth
					? { paths: uPlot.paths.spline?.() }
					: {}),
			...(dash === undefined ? {} : { dash }),
			points: {
				show: scatter || entry.points === true,
				size: resolvePointSize(entry),
			},
		});
	});

	return {
		series,
		axes,
		axisStroke: light ? "#726F6D" : "#ccc",
		gridStroke: light ? "#eee" : "#726F6D",
	};
}

/**
 * Time series chart body.
 *
 * Owns its uPlot instance imperatively: the frame loop writes into arrays the
 * instance already holds and calls `setData`, so a chart running at 32 Hz costs
 * no React renders at all. The instance is rebuilt only when the plan changes —
 * a series added, a colour or axis edited, the theme flipped.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const TimeSeriesChartBody: React.FC<TimeSeriesSettings> = (props) => {
	const { getSource } = useLocalDataSource();
	const containerRef = useRef<HTMLDivElement>(null);

	const { resolvedTheme } = useTheme();
	const light = resolvedTheme === "light";

	const plan = useMemo(
		() => buildChartPlan(props.topics, props.axis, light),
		[props.topics, props.axis, light],
	);

	// The frame loop must see the current settings and the current source
	// reader without restarting: `getSource` takes a new identity on every
	// buffer flush, which is tens of times a second. Written from an effect
	// rather than during render, which the React Compiler's lint rules reject.
	const liveRef = useRef<LiveFrameInputs>({ settings: props, getSource });
	useEffect(() => {
		liveRef.current = { settings: props, getSource };
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const seriesCount = plan.series.length - 1;

		// The x range is driven by the wall clock rather than by the data, so
		// the window keeps scrolling while a robot is silent. Read through a
		// closure variable so `setData(_, true)` can re-range the y scales
		// without also re-ranging x onto the data extent.
		let windowMin = Date.now() * MS_TO_SECONDS - 5;
		let windowMax = windowMin + 5;

		const scales: uPlot.Scales = {
			x: {
				time: true,
				range: () => [windowMin, windowMax],
			},
		};

		for (const axis of plan.axes) {
			// An axis with no configured bound keeps uPlot's own auto-ranging,
			// which already handles a series that is entirely null. Only a
			// configured bound needs a range function, and it still defers to
			// the auto-range for the bound that was left open.
			scales[axis.scale] =
				axis.min === null && axis.max === null
					? {}
					: {
							range: (_self, dataMin, dataMax) => {
								const low = Number.isFinite(dataMin)
									? dataMin
									: 0;
								const high = Number.isFinite(dataMax)
									? dataMax
									: low + 1;
								const [autoMin, autoMax] = uPlot.rangeNum(
									low,
									high,
									0.1,
									true,
								);
								return [
									axis.min ?? autoMin,
									axis.max ?? autoMax,
								];
							},
						};
		}

		const axes: uPlot.Axis[] = [
			{
				scale: "x",
				stroke: plan.axisStroke,
				grid: { stroke: plan.gridStroke },
			},
			...plan.axes.map((axis, index) => ({
				scale: axis.scale,
				side: axis.side === "right" ? (1 as const) : (3 as const),
				stroke: plan.axisStroke,
				// Only the first y axis draws a grid; a second set of
				// horizontal lines at different values reads as noise.
				grid: { stroke: plan.gridStroke, show: index === 0 },
				...(axis.label === undefined ? {} : { label: axis.label }),
			})),
		];

		let columns = resolveColumnCount(container.clientWidth);
		let x: number[] = new Array<number>(2 * columns).fill(0);
		let ys: (number | null)[][] = Array.from({ length: seriesCount }, () =>
			new Array<number | null>(2 * columns).fill(null),
		);
		let data: uPlot.AlignedData = [x, ...ys];

		const chart = new uPlot(
			{
				width: Math.max(80, container.clientWidth),
				height: Math.max(60, container.clientHeight),
				scales,
				axes,
				series: plan.series,
				legend: { show: true },
				// Drag-to-zoom would be overwritten by the next frame's window,
				// so offering it only teaches the operator it is broken.
				cursor: { drag: { x: false, y: false } },
			},
			data,
			container,
		);

		/**
		 * Resize the plot to the tile, reserving room for uPlot's own legend,
		 * and re-resolve the column grid to the new width.
		 */
		const applySize = (): void => {
			const legend = chart.root.querySelector<HTMLElement>(".u-legend");
			const legendHeight = legend?.clientHeight ?? 0;

			chart.setSize({
				width: Math.max(80, container.clientWidth),
				height: Math.max(60, container.clientHeight - legendHeight),
			});

			const next = resolveColumnCount(container.clientWidth);
			if (next === columns) return;

			columns = next;
			x = new Array<number>(2 * columns).fill(0);
			ys = Array.from({ length: seriesCount }, () =>
				new Array<number | null>(2 * columns).fill(null),
			);
			data = [x, ...ys];
		};

		applySize();

		const observer = new ResizeObserver(applySize);
		observer.observe(container);

		let frame = 0;
		let lastDraw = 0;

		const draw = (timestamp: number): void => {
			frame = requestAnimationFrame(draw);

			const { settings, getSource: readSource } = liveRef.current;
			const hz = clampSetting(
				settings.updateFrequency,
				32,
				MIN_UPDATE_HZ,
				MAX_UPDATE_HZ,
			);
			if (timestamp - lastDraw < 1000 / hz) return;
			lastDraw = timestamp;

			const span = Math.max(
				MIN_TIME_HISTORY,
				clampSetting(settings.timeHistory, 5, MIN_TIME_HISTORY, 86_400),
			);
			windowMax = Date.now() * MS_TO_SECONDS;
			windowMin = windowMax - span;

			buildColumnGrid(windowMin, windowMax, columns, x);

			for (let index = 0; index < seriesCount; index++) {
				const entry = settings.topics[index];
				const source = entry ? readSource(entry.topic) : undefined;

				decimateSeries(
					source?.times ?? [],
					source?.data ?? [],
					ys[index] as (number | null)[],
					{
						tMin: windowMin,
						tMax: windowMax,
						columns,
						timeScale: MS_TO_SECONDS,
					},
				);
			}

			chart.setData(data, true);
		};

		frame = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			chart.destroy();
		};
	}, [plan]);

	if (props.topics.length === 0) {
		return (
			<div className="text-muted-foreground flex h-full w-full items-center justify-center p-4 text-center text-sm">
				No series configured — add a topic in this widget&apos;s
				settings.
			</div>
		);
	}

	return <div ref={containerRef} className="h-full w-full" />;
};

/**
 * Time series chart widget.
 *
 * Module-level and stable (pattern 10): the dashboard re-invokes the definition
 * factory on every render and uses `definition.Component` as the component type
 * directly, so a fresh identity here would remount the chart — and drop its
 * uPlot instance and every subscription under it — on each pass.
 *
 * @param data - Widget settings.
 * @returns React element.
 */
function TimeSeriesChartWidget(data: TimeSeriesSettings) {
	// Normalized once here so neither the provider nor the body has to repeat
	// the guard: a widget whose stored settings carry no series at all is
	// resolved to an unsupported-configuration card by the dashboard before it
	// reaches this component, but a preview or a plugin may still construct one
	// by hand.
	const series = useMemo(() => data.topics ?? [], [data.topics]);
	const selected = useMemo(
		() => series.map((entry) => entry.topic),
		[series],
	);

	return (
		<LocalDataSourcesProvider
			SelectedTopics={selected}
			buffersSize={BUFFER_SIZE}
		>
			<TimeSeriesChartBody {...data} topics={series} />
		</LocalDataSourcesProvider>
	);
}

/**
 * Widget definition for the time series chart.
 *
 * The single chart of the standard widget set: one uPlot instance per widget,
 * any number of series, per-series styling and an axis per distinct
 * side/bounds/label combination, which is what makes a dual-scale chart — speed
 * against battery voltage — a configuration rather than two tiles.
 *
 * @returns Widget definition.
 */
export function TimeSeriesChartDefinition(): WidgetDefinition<TimeSeriesSettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};

	const timeHistory: ControlElement = {
		type: "Control",
		scope: "#/properties/timeHistory",
	};

	const updateFrequency: ControlElement = {
		type: "Control",
		scope: "#/properties/updateFrequency",
	};

	const axis: ControlElement = {
		type: "Control",
		scope: "#/properties/axis",
		options: {
			detail: {
				elements: [
					{
						type: "Control",
						scope: "#/properties/axis/properties/yMin",
					},
					{
						type: "Control",
						scope: "#/properties/axis/properties/yMax",
					},
					{
						type: "Control",
						scope: "#/properties/axis/properties/yLabel",
					},
				],
			},
		},
	};

	// A subscribe slot: the chart only ever reads this topic. It is deliberately
	// left without a `direction` marker, which defaults to "subscribe" and keeps
	// the chart a routing target for `number` topics.
	const topic: TopicSelectElement = {
		type: "TopicSelect",
		scope: "#/properties/topic",
		options: {
			dataRequirements: {
				accepts: ["number"],
			},
		},
	};

	const seriesTitle: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};

	const color: ControlElement = {
		type: "Control",
		scope: "#/properties/color",
		options: {
			color: true,
		},
	};

	const fill: ControlElement = {
		type: "Control",
		scope: "#/properties/fill",
	};

	const seriesType: ControlElement = {
		type: "Control",
		scope: "#/properties/type",
	};

	const smooth: ControlElement = {
		type: "Control",
		scope: "#/properties/smooth",
	};

	const lineWidth: ControlElement = {
		type: "Control",
		scope: "#/properties/lineWidth",
	};

	const lineStyle: ControlElement = {
		type: "Control",
		scope: "#/properties/lineStyle",
	};

	const points: ControlElement = {
		type: "Control",
		scope: "#/properties/points",
	};

	const pointSize: ControlElement = {
		type: "Control",
		scope: "#/properties/pointSize",
	};

	const seriesAxis: ControlElement = {
		type: "Control",
		scope: "#/properties/axis",
		options: {
			detail: {
				elements: [
					{
						type: "Control",
						scope: "#/properties/axis/properties/side",
					},
					{
						type: "Control",
						scope: "#/properties/axis/properties/yMin",
					},
					{
						type: "Control",
						scope: "#/properties/axis/properties/yMax",
					},
					{
						type: "Control",
						scope: "#/properties/axis/properties/yLabel",
					},
				],
			},
		},
	};

	const topics: ControlElement = {
		type: "Control",
		scope: "#/properties/topics",
		options: {
			detail: {
				type: "Group",
				elements: [
					topic,
					seriesTitle,
					color,
					fill,
					seriesType,
					smooth,
					lineWidth,
					lineStyle,
					points,
					pointSize,
					seriesAxis,
				],
			},
		},
	};

	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title, timeHistory, updateFrequency, axis, topics],
	};

	return {
		id: "chart-widget-time-series",
		name: "Time series chart",
		description:
			"Plot one or more numeric topics over time, with per-series styling and an optional second y axis",
		titleProp: "title",
		icon: <ChartLineIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				timeHistory: {
					type: "number",
					title: "Time history in seconds",
					default: 5,
				},
				updateFrequency: {
					type: "number",
					title: "Update frequency in Hz",
					default: 32,
				},
				axis: {
					type: "object",
					title: "Axis",
					properties: {
						yMin: {
							type: "number",
							title: "Y min",
						},
						yMax: {
							type: "number",
							title: "Y max",
						},
						yLabel: {
							type: "string",
							title: "Y label",
						},
					},
				},
				topics: {
					type: "array",
					title: "Series",
					items: {
						type: "object",
						properties: {
							// No `default`: automatic topic placement seeds a
							// colourless appended series from its palette, and
							// a default here would win over it and make every
							// routed series the same colour.
							topic: {
								type: "object",
								title: "Topic",
							},
							title: {
								type: "string",
								title: "Series title",
							},
							color: {
								type: "string",
								title: "Color",
							},
							fill: {
								type: "boolean",
								title: "Fill",
								default: false,
							},
							type: {
								type: "string",
								title: "Type",
								enum: ["line", "scatter"],
								default: "line",
							},
							smooth: {
								type: "boolean",
								title: "Smooth",
								default: false,
							},
							lineWidth: {
								type: "number",
								title: "Line width",
								default: 1,
							},
							lineStyle: {
								type: "string",
								title: "Line style",
								enum: ["solid", "dashed", "dotted"],
								default: "solid",
							},
							points: {
								type: "boolean",
								title: "Show points",
								default: false,
							},
							pointSize: {
								type: "number",
								title: "Point size",
								default: 4,
							},
							axis: {
								type: "object",
								title: "Axis",
								properties: {
									side: {
										type: "string",
										title: "Position",
										enum: ["left", "right"],
										default: "left",
									},
									yMin: {
										type: "number",
										title: "Y min",
									},
									yMax: {
										type: "number",
										title: "Y max",
									},
									yLabel: {
										type: "string",
										title: "Y label",
									},
								},
							},
						},
						required: ["topic"],
					},
				},
			},
			required: ["title", "topics"],
		},
		uischema: layout,
		data: {
			title: "Time Series Chart",
			topics: [],
		},
		Component: TimeSeriesChartWidget,
	};
}
