import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	SelectedTopic,
	useLocalDataSource,
	DatasourceTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import {
	getColorsFromString,
	getTransparentColorString,
} from "@workspace/utils";
import { ChartLineIcon } from "lucide-react";
import { useTheme } from "next-themes";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import uPlot from "uplot";
import { AlignedData } from "uplot";
import UplotReact from "uplot-react";
import "uplot/dist/uPlot.min.css";

/** Settings for the time series chart widget. */
interface TimeSeriesSettings extends Record<string, unknown> {
	title: string;
	timeHistory: number;
	updateFrequency: number;
	// axis: {
	//     yMin: number;
	//     yMax: number;
	//     yLabel: string;
	// }
	topics: {
		topic: SelectedTopic;
		color: string;
		fill: boolean;
	}[];
}

/**
 * Time series chart widget body.
 * @param props - Widget settings.
 * @returns React element.
 */
export function TimeChartComponent(props: TimeSeriesSettings) {
	const { sources, getSource } = useLocalDataSource();
	const divRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<number>(0);
	const lastUpdateRef = useRef<number>(0);
	const dataBufferRef = useRef<
		Map<string, { value: number; time: number }[]>
	>(new Map());
	const [chartKey, setChartKey] = useState(0);

	const { resolvedTheme } = useTheme();

	const strokeColor = resolvedTheme === "light" ? "#726F6D" : "#ccc";
	const gridStroke = resolvedTheme === "light" ? "#eee" : "#726F6D";

	const optionsRef = useRef<uPlot.Options>({
		width: 500,
		height: 500,
		scales: {
			x: {
				time: true,
				range: [Date.now() / 1000 - 60, Date.now() / 1000],
			},
		},
		axes: [
			{
				stroke: strokeColor,
				grid: { stroke: gridStroke },
			},
			{
				stroke: strokeColor,
				grid: { stroke: gridStroke },
			},
		],
		series: [{ label: "Time" }],
	});

	const dataRef = useRef<AlignedData>([]);

	const timeSpan = props.timeHistory || 5;
	const updateFrequency = props.updateFrequency || 32;
	const updateInterval = 1000 / updateFrequency;

	// Initialize chart series only when topics change
	useEffect(() => {
		optionsRef.current.series = initializeSeries(props.topics, getSource);
	}, [props.topics, sources]);

	// Change the colors when the theme changes
	useEffect(() => {
		optionsRef.current.axes = [
			{
				stroke: strokeColor,
				grid: { stroke: gridStroke },
			},
			{
				stroke: strokeColor,
				grid: { stroke: gridStroke },
			},
		];
	}, [gridStroke, resolvedTheme, strokeColor]);

	// Handle real-time data updates
	useEffect(() => {
		const processData = (timestamp: number) => {
			if (timestamp - lastUpdateRef.current < updateInterval) {
				frameRef.current = requestAnimationFrame(processData);
				return;
			}

			lastUpdateRef.current = timestamp;
			const now = Date.now() / 1000;

			// Process incoming data
			for (const topic_props of props.topics) {
				const topic = topic_props.topic;
				const sourceId =
					topic.property !== ""
						? topic.topic + "+" + topic.property
						: topic.topic;

				const source = getSource(topic);
				if (!source) continue;

				const newData = source.data
					.map((value, index) => ({
						value: value as number,
						time: source.times[index]! / 1000,
					}))
					.filter((d) => d.time > now - timeSpan);

				dataBufferRef.current.set(sourceId, newData);
			}

			// Update chart data
			const timeSet = new Set<number>();
			dataBufferRef.current.forEach((data) => {
				data.forEach((point) => timeSet.add(point.time));
			});

			const timeArray = Array.from(timeSet).sort();
			const newData: AlignedData = [timeArray];
			const timeIndexMap = new Map(timeArray.map((time, i) => [time, i]));

			props.topics.forEach((topic_props) => {
				const topic = topic_props.topic;
				const sourceId =
					topic.property !== ""
						? topic.topic + "+" + topic.property
						: topic.topic;
				const topicData = dataBufferRef.current.get(sourceId);

				const values = new Array(timeArray.length).fill(null);
				topicData?.forEach((d) => {
					const index = timeIndexMap.get(d.time);
					if (index !== undefined) values[index] = d.value;
				});
				newData.push(values);
			});

			dataRef.current = newData;

			// get element with this class : 'u-legend u-inline u-live' in the divRef
			const legend = divRef.current?.querySelector(
				".u-legend.u-inline.u-live",
			);
			const legend_height = legend ? legend.clientHeight : 0;

			// Update chart dimensions and time range
			if (divRef.current) {
				optionsRef.current = {
					...optionsRef.current,
					width: divRef.current.clientWidth,
					height: divRef.current.clientHeight - legend_height,
					scales: {
						x: {
							time: true,
							range: [now - timeSpan, now],
						},
					},
				};
			}

			// Force chart update even without new data
			setChartKey((prev) => (prev + 1) % 2); // Add this line to force re-render

			// Schedule next update
			frameRef.current = requestAnimationFrame(processData);
		};

		frameRef.current = requestAnimationFrame(processData);

		return () => {
			if (frameRef.current) {
				cancelAnimationFrame(frameRef.current);
			}
		};
	}, [props.topics, sources, timeSpan, updateInterval]);

	return (
		<div ref={divRef} style={{ width: "100%", height: "100%" }}>
			<UplotReact options={optionsRef.current} data={dataRef.current} />
		</div>
	);
}

// Helper functions
function initializeSeries(
	topics: { topic: SelectedTopic; color: string; fill: boolean }[],
	getSource: (topic: SelectedTopic) => any,
): uPlot.Series[] {
	const series: uPlot.Series[] = [{ label: "Time" }];
	const notFoundTopics: string[] = [];

	topics.forEach((topic_props) => {
		const topic: SelectedTopic = topic_props.topic;

		if (!getSource(topic)) {
			notFoundTopics.push(topic.topic);
			return;
		}

		const fill =
			topic_props.fill || false
				? getTransparentColorString(
						topic_props.color ||
							getColorsFromString(topic.topic, 0.4),
						0.4,
					)
				: undefined;

		const props_label =
			topic.property !== ""
				? topic.topic + "." + topic.property.replaceAll("-", ".")
				: topic.topic;

		series.push({
			label: props_label,
			stroke: topic_props.color || getColorsFromString(topic.topic),
			width: 1,
			sorted: 0,
			spanGaps: true,
			fill,
		});
	});

	if (notFoundTopics.length > 0) {
		showErrorToast(notFoundTopics);
	}

	return series;
}

function showErrorToast(notFoundTopics: string[]) {
	toast(
		"Error: The following topics were not found: " +
			notFoundTopics.join(", "),
	);
}

/**
 * Widget definition for the time series chart.
 * @returns Widget definition.
 */
function TimeSeriesChartWidget(data: TimeSeriesSettings) {
	return (
		<LocalDataSourcesProvider
			SelectedTopics={data.topics.map((t) => t.topic)}
			buffersSize={2000}
		>
			<TimeChartComponent {...data} />
		</LocalDataSourcesProvider>
	);
}

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

	const topic: TopicSelectElement = {
		type: "TopicSelect",
		scope: "#/properties/topic",
		options: {
			dataRequirements: {
				accepts: ["number"],
			},
		},
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

	// array of topics
	const topics: ControlElement = {
		type: "Control",
		scope: "#/properties/topics",
		options: {
			detail: {
				type: "Group",
				elements: [topic, color, fill],
			},
		},
	};

	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title, timeHistory, updateFrequency, topics],
	};

	return {
		id: "chart-widget-time-series",
		name: "Time series chart",
		description: "Display a line chart",
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
					title: "Topics",
					items: {
						type: "object",
						properties: {
							topic: {
								type: "object",
								title: "Topic",
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
		},
		Component: TimeSeriesChartWidget,
	};
}
