import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	useLocalDataSource,
	SelectedTopic,
	DatasourceTopic,
	DatasourceTopicFilter,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Image } from "@workspace/ormi-core/types";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { CameraIcon, FileIcon } from "lucide-react";
import { useEffect, useRef } from "react";

function ImageViewer() {
	const { sources } = useLocalDataSource();
	const firstKey = Array.from(sources.keys())[0];
	const image: Image | undefined = firstKey
		? (sources.get(firstKey)?.data[0] as Image)
		: undefined;
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (image && canvasRef.current) {
			const canvas = canvasRef.current;
			const ctx = canvas.getContext("2d");

			if (ctx) {
				// Set canvas dimensions to match image
				canvas.width = image.width;
				canvas.height = image.height;

				// Draw the ImageData to the canvas
				ctx.putImageData(image.data, 0, 0);
			}
		}
	}, [image]);

	if (!image) {
		return (
			<div
				style={{
					height: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "#666",
				}}
			>
				<div style={{ textAlign: "center" }}>
					<FileIcon size={48} style={{ marginBottom: "8px" }} />
					<div>No image data available</div>
				</div>
			</div>
		);
	}

	return (
		<div
			style={{
				height: "100%",
				overflow: "auto",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: "8px",
			}}
		>
			<canvas
				ref={canvasRef}
				style={{
					maxWidth: "100%",
					maxHeight: "100%",
					objectFit: "contain",
					border: "1px solid #ddd",
				}}
			/>
		</div>
	);
}

export function ImageViewerDefinition(): WidgetDefinition {
	const pluginsManager = usePluginsManager();

	interface JsonViewerProps {
		title: string;
		topic: SelectedTopic;
	}

	return {
		id: "image-viewer-widget",
		name: "Image viewer",
		description: "Display an image",
		titleProp: "title",
		icon: <CameraIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				topic: {
					type: "object",
					title: "Topic",
				},
			},
			required: ["title", "topic"],
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
							accepts: [
								"sensor_msgs/Image",
								"sensor_msgs/CompressedImage",
							], // Accept various image types
						},
					},
				} as TopicSelectElement,
			],
		} as VerticalLayout,

		data: {
			title: "Image viewer",
		},
		Component: (data: JsonViewerProps) => (
			<LocalDataSourcesProvider
				SelectedTopics={[data.topic]}
				buffersSize={1}
			>
				<ImageViewer />
			</LocalDataSourcesProvider>
		),
	} as WidgetDefinition;
}
