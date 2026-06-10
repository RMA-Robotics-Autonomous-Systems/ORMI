import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	useLocalDataSource,
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Image } from "@workspace/ormi-core/types";
import { CameraIcon, FileIcon } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Image viewer widget body.
 * @returns React element.
 */
function ImageViewer() {
	const { sources } = useLocalDataSource();
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

	if (!imageBitmap) {
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
	return (
		<LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
			<ImageViewer />
		</LocalDataSourcesProvider>
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
							accepts: ["Image"], // Accept Image webtype
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
