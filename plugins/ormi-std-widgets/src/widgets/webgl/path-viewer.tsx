import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { useMemo } from "react";
import {
	LocalDataSourcesProvider,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { RouteIcon } from "lucide-react";
import { PathViewerComp } from "./components/path-viewer-comp";

export interface PathViewerProps extends Record<string, unknown> {
	title: string;
	topic?: SelectedTopic;
	lineWidth?: number;
	showPoses?: boolean;
	poseScale?: number;
	lineColor?: string;
	targetFrame?: string;
}

function PathViewerWidget(data: PathViewerProps) {
	// Stable array identity keyed on the topic itself, so the provider's
	// subscription lifecycle doesn't churn on unrelated re-renders.
	const topic = data.topic;
	const selectedTopics = useMemo(() => (topic ? [topic] : []), [topic]);
	return (
		<LocalDataSourcesProvider
			SelectedTopics={selectedTopics}
			buffersSize={1}
		>
			<PathViewerComp {...data} />
		</LocalDataSourcesProvider>
	);
}

export function PathViewerDefinition(): WidgetDefinition<PathViewerProps> {
	return {
		id: "std-path-viewer",
		name: "Path Viewer",
		description: "3D path visualization with poses",
		titleProp: "title",
		icon: <RouteIcon />,
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				topic: { type: "object", title: "Topic" },
				lineWidth: {
					type: "number",
					title: "Line Width",
					minimum: 0.001,
					default: 0.02,
				},
				showPoses: {
					type: "boolean",
					title: "Show Poses",
					default: true,
				},
				poseScale: {
					type: "number",
					title: "Pose Scale",
					minimum: 0.001,
					default: 0.1,
				},
				lineColor: {
					type: "string",
					title: "Line Color",
					default: "#3b82f6",
				},
				targetFrame: {
					type: "string",
					title: "Target Frame",
					description:
						"Frame to transform path into (empty = no transform)",
				},
			},
			required: ["title"],
		},
		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "TopicSelect",
					scope: "#/properties/topic",
					options: {
						dataRequirements: {
							accepts: ["Path"],
						},
					},
				},
				{
					type: "Control",
					scope: "#/properties/lineWidth",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/showPoses",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/poseScale",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/lineColor",
					options: {
						color: true,
					},
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/targetFrame",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Path Viewer",
			lineWidth: 0.02,
			showPoses: true,
			poseScale: 0.1,
			lineColor: "#3b82f6",
			targetFrame: "",
		},
		Component: PathViewerWidget,
	};
}
