import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	useLocalDataSource,
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Image } from "@workspace/ormi-core/types";
import { DatasourceGate } from "@workspace/ui/components/datasource-gate";
import { CameraIcon, FileIcon } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Image viewer widget body.
 * @param props - Component props.
 * @returns React element.
 */
function ImageViewer(props: { sourceTitle: string }) {
	const { sources, health } = useLocalDataSource();
	const firstKey = Array.from(sources.keys())[0];
	const imageBitmap: Image | undefined = firstKey
		? (sources.get(firstKey)?.data[0] as Image)
		: undefined;
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (!imageBitmap || !canvasRef.current) {
			return;
		}

		// ImageBitmap: just draw it directly to canvas
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");

		if (ctx && imageBitmap instanceof ImageBitmap) {
			// Set canvas dimensions to match image
			canvas.width = imageBitmap.width;
			canvas.height = imageBitmap.height;

			// Draw ImageBitmap directly - very efficient
			ctx.drawImage(imageBitmap, 0, 0);
		}
	}, [imageBitmap]);

	return (
		<DatasourceGate health={health} title={props.sourceTitle}>
			{!imageBitmap ? (
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
			) : (
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
			)}
		</DatasourceGate>
	);
}

/** Props for ImageViewer widget. */
interface ImageViewerProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
}

/**
 * Widget definition for ImageViewer.
 * @returns Widget definition.
 */
function ImageViewerWidget(data: ImageViewerProps) {
	return data.topic ? (
		<LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
			<ImageViewer sourceTitle={data.topic.source.title} />
		</LocalDataSourcesProvider>
	) : (
		<div className="flex justify-center items-center h-full text-muted-foreground">
			Please select a topic in the widget configuration.
		</div>
	);
}

export function ImageViewerDefinition(): WidgetDefinition<ImageViewerProps> {
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
						// The webapp type, plus the two raw schemas the
						// transport converters map *to* it — a datasource that
						// passes either through unconverted still reaches the
						// viewer that can draw it.
						dataRequirements: {
							accepts: ["Image"],
							acceptsRaw: [
								"sensor_msgs/msg/Image",
								"sensor_msgs/msg/CompressedImage",
							],
						},
					},
				} as TopicSelectElement,
			],
		} as VerticalLayout,

		data: {
			title: "Image viewer",
		},
		Component: ImageViewerWidget,
	} as WidgetDefinition<ImageViewerProps>;
}
