import {
	TOPIC_PREVIEW_FALLBACK,
	type TopicPreviewRegistry,
} from "@workspace/ormi-core/dashboard/topic-list";
import {
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { useMemo, memo } from "react";

// Import widget definitions
import { ImageViewerDefinition } from "../image";
import { JsonViewerDefinition } from "../json-viewer";
import { CondStatusIndicatorDefinition } from "../../status/cond-status-indicator";
import { TimeSeriesChartDefinition } from "../../charts/timeseries-chart";
import { PathViewerDefinition } from "../../webgl/path-viewer";
import { PointsCloudDreiDefinition } from "../../webgl/points-cloud-drei-definition";
import { DEFAULT_POINT_CLOUD_THEME } from "../../webgl/types/points-cloud-drei-types";

/**
 * Create a stable SelectedTopic from a DatasourceTopic
 * This ensures the object reference stays stable when used in dependencies
 */
function createSelectedTopic(
	topic: DatasourceTopic,
	property: string = "",
): SelectedTopic {
	return {
		topic: topic.topic,
		datasource_id: topic.datasource_id,
		source: topic.source,
		type: topic.type,
		rawType: topic.rawType,
		bufferSize: topic.bufferSize,
		property,
	};
}

/**
 * Wrapper component that calls ImageViewerDefinition during render (inside React context)
 * Props are memoized to prevent re-subscription in LocalDataSourcesProvider
 */
const ImagePreview = memo(function ImagePreview({
	topic,
}: {
	topic: DatasourceTopic;
}) {
	const imageWidget = useMemo(() => ImageViewerDefinition(), []);

	// Extract stable values from topic for dependency array
	const {
		topic: topicName,
		datasource_id,
		type,
		rawType,
		bufferSize,
		source,
	} = topic;

	// Memoize the props to prevent re-subscription on every render
	const widgetProps = useMemo(
		() => ({
			title: topicName,
			topic: createSelectedTopic({
				topic: topicName,
				datasource_id,
				source,
				type,
				rawType,
				bufferSize,
			}),
		}),
		[topicName, datasource_id, source, type, rawType, bufferSize],
	);

	return (
		<div style={{ height: "200px" }}>
			{<imageWidget.Component {...widgetProps} />}
		</div>
	);
});

/**
 * Wrapper component that calls JsonViewerDefinition during render (inside React context)
 * Props are memoized to prevent re-subscription in LocalDataSourcesProvider
 */
const JsonPreview = memo(function JsonPreview({
	topic,
}: {
	topic: DatasourceTopic;
}) {
	const jsonWidget = useMemo(() => JsonViewerDefinition(), []);

	const {
		topic: topicName,
		datasource_id,
		type,
		rawType,
		bufferSize,
		source,
	} = topic;

	const widgetProps = useMemo(
		() => ({
			title: topicName,
			topic: createSelectedTopic({
				topic: topicName,
				datasource_id,
				source,
				type,
				rawType,
				bufferSize,
			}),
		}),
		[topicName, datasource_id, source, type, rawType, bufferSize],
	);

	return (
		<div style={{ height: "150px", fontSize: "0.75rem" }}>
			{<jsonWidget.Component {...widgetProps} />}
		</div>
	);
});

/**
 * Wrapper component for conditional widget (boolean values)
 * Props are memoized to prevent re-subscription in LocalDataSourcesProvider
 */
const ConditionalPreview = memo(function ConditionalPreview({
	topic,
}: {
	topic: DatasourceTopic;
}) {
	const conditionalWidget = useMemo(
		() => CondStatusIndicatorDefinition(),
		[],
	);

	const {
		topic: topicName,
		datasource_id,
		type,
		rawType,
		bufferSize,
		source,
	} = topic;

	const widgetProps = useMemo(
		() => ({
			title: topicName,
			topic: createSelectedTopic({
				topic: topicName,
				datasource_id,
				source,
				type,
				rawType,
				bufferSize,
			}),
			status: [
				{
					name: "False",
					color: "#ef4444",
					condition: "<" as const,
					value: 0.5,
				},
				{
					name: "True",
					color: "#22c55e",
					condition: ">=" as const,
					value: 0.5,
				},
			],
		}),
		[topicName, datasource_id, source, type, rawType, bufferSize],
	);

	return (
		<div style={{ height: "80px" }}>
			{<conditionalWidget.Component {...widgetProps} />}
		</div>
	);
});

/**
 * Wrapper component for the time series chart (number values)
 * Props are memoized to prevent re-subscription in LocalDataSourcesProvider
 *
 * The axis is left to auto-range: a preview is opened on an arbitrary topic,
 * so any fixed bounds would flatten most of them against an edge.
 */
const NumberChartPreview = memo(function NumberChartPreview({
	topic,
}: {
	topic: DatasourceTopic;
}) {
	const chartWidget = useMemo(() => TimeSeriesChartDefinition(), []);

	const {
		topic: topicName,
		datasource_id,
		type,
		rawType,
		bufferSize,
		source,
	} = topic;

	const widgetProps = useMemo(
		() => ({
			title: topicName,
			timeHistory: 5,
			updateFrequency: 30,
			axis: { yLabel: "Value" },
			topics: [
				{
					title: topicName,
					fill: false,
					topic: createSelectedTopic({
						topic: topicName,
						datasource_id,
						source,
						type,
						rawType,
						bufferSize,
					}),
					color: "#3b82f6",
					smooth: true,
				},
			],
		}),
		[topicName, datasource_id, source, type, rawType, bufferSize],
	);

	return (
		<div style={{ height: "200px" }}>
			{<chartWidget.Component {...widgetProps} />}
		</div>
	);
});

/**
 * Wrapper component for IMU widget (shows accelerometer/gyro data as chart)
 * Props are memoized to prevent re-subscription in LocalDataSourcesProvider
 */
const IMUPreview = memo(function IMUPreview({
	topic,
}: {
	topic: DatasourceTopic;
}) {
	const chartWidget = useMemo(() => TimeSeriesChartDefinition(), []);

	const {
		topic: topicName,
		datasource_id,
		type,
		rawType,
		bufferSize,
		source,
	} = topic;

	const widgetProps = useMemo(
		() => ({
			title: topicName,
			timeHistory: 10,
			updateFrequency: 30,
			axis: { yLabel: "Value" },
			topics: [
				{
					title: "X",
					fill: false,
					topic: createSelectedTopic(
						{
							topic: topicName,
							datasource_id,
							source,
							type,
							rawType,
							bufferSize,
						},
						"angular_velocity.x",
					),
					color: "#ef4444",
					smooth: true,
				},
				{
					title: "Y",
					fill: false,
					topic: createSelectedTopic(
						{
							topic: topicName,
							datasource_id,
							source,
							type,
							rawType,
							bufferSize,
						},
						"angular_velocity.y",
					),
					color: "#22c55e",
					smooth: true,
				},
				{
					title: "Z",
					fill: false,
					topic: createSelectedTopic(
						{
							topic: topicName,
							datasource_id,
							source,
							type,
							rawType,
							bufferSize,
						},
						"angular_velocity.z",
					),
					color: "#3b82f6",
					smooth: true,
				},
			],
		}),
		[topicName, datasource_id, source, type, rawType, bufferSize],
	);

	return (
		<div style={{ height: "250px" }}>
			{<chartWidget.Component {...widgetProps} />}
		</div>
	);
});

/**
 * Wrapper component for path widget - uses PathViewer 3D visualization
 * Props are memoized to prevent re-subscription in LocalDataSourcesProvider
 */
const PathPreview = memo(function PathPreview({
	topic,
}: {
	topic: DatasourceTopic;
}) {
	const pathWidget = useMemo(() => PathViewerDefinition(), []);

	const {
		topic: topicName,
		datasource_id,
		type,
		rawType,
		bufferSize,
		source,
	} = topic;

	const widgetProps = useMemo(
		() => ({
			title: topicName,
			topic: createSelectedTopic({
				topic: topicName,
				datasource_id,
				source,
				type,
				rawType,
				bufferSize,
			}),
			lineWidth: 0.02,
			showPoses: false,
			poseScale: 0.1,
			lineColor: "#3b82f6",
		}),
		[topicName, datasource_id, source, type, rawType, bufferSize],
	);

	return (
		<div style={{ height: "250px" }}>
			{<pathWidget.Component {...widgetProps} />}
		</div>
	);
});

/**
 * Wrapper component for point cloud widget - uses PointsCloud 3D visualization
 * Props are memoized to prevent re-subscription in LocalDataSourcesProvider
 */
const PointCloudPreview = memo(function PointCloudPreview({
	topic,
}: {
	topic: DatasourceTopic;
}) {
	const pointCloudWidget = useMemo(() => PointsCloudDreiDefinition(), []);

	const {
		topic: topicName,
		datasource_id,
		type,
		rawType,
		bufferSize,
		source,
	} = topic;

	const widgetProps = useMemo(
		() => ({
			title: topicName,
			topics: [
				{
					topic: createSelectedTopic({
						topic: topicName,
						datasource_id,
						source,
						type,
						rawType,
						bufferSize,
					}),
				},
			],
			pointSize: 0.05,
			rollingBuffer: false,
			decayTime: 1000,
			theme: DEFAULT_POINT_CLOUD_THEME,
			colorMode: "source" as const,
			useTransparency: false,
			sourceConvention: "ROS" as const,
		}),
		[topicName, datasource_id, source, type, rawType, bufferSize],
	);

	return (
		<div style={{ height: "250px" }}>
			{<pointCloudWidget.Component {...widgetProps} />}
		</div>
	);
});

/**
 * The live previews this plugin contributes to the topics panel.
 *
 * Registered as a `TOPIC_PREVIEWS` filter rather than written into a registry
 * core owns: every preview here mounts a real widget of this plugin's — an
 * image decoder, a chart, a point-cloud scene — which core must be handed, not
 * import. Keying is on the webapp type name; `TOPIC_PREVIEW_FALLBACK` is the
 * JSON viewer, so a type nothing here knows about is still inspectable.
 *
 * @param previews - Previews contributed so far.
 * @returns The same map, with this plugin's entries added.
 */
export function registerDefaultTopicPreviews(
	previews: TopicPreviewRegistry,
): TopicPreviewRegistry {
	// Image type - reuse ImageViewer widget
	previews.set("Image", {
		component: (topic: DatasourceTopic) => <ImagePreview topic={topic} />,
		minHeight: "200px",
	});

	// Boolean type - use conditional widget
	previews.set("boolean", {
		component: (topic: DatasourceTopic) => (
			<ConditionalPreview topic={topic} />
		),
		minHeight: "80px",
	});

	// Number type - use echart widget
	previews.set("number", {
		component: (topic: DatasourceTopic) => (
			<NumberChartPreview topic={topic} />
		),
		minHeight: "200px",
	});

	// IMU type - use chart with multiple series for axes
	previews.set("IMU", {
		component: (topic: DatasourceTopic) => <IMUPreview topic={topic} />,
		minHeight: "250px",
	});

	// Path type - use path viewer widget
	previews.set("Path", {
		component: (topic: DatasourceTopic) => <PathPreview topic={topic} />,
		minHeight: "250px",
	});

	// PointCloud type - use pointcloud widget
	previews.set("PointsCloud", {
		component: (topic: DatasourceTopic) => (
			<PointCloudPreview topic={topic} />
		),
		minHeight: "250px",
	});

	// Fallback for all unregistered types - use JSON viewer
	previews.set(TOPIC_PREVIEW_FALLBACK, {
		component: (topic: DatasourceTopic) => <JsonPreview topic={topic} />,
		minHeight: "150px",
	});

	return previews;
}
