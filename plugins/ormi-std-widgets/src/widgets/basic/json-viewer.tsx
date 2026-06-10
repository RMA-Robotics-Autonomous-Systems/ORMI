import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	useLocalDataSource,
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { FileIcon } from "lucide-react";
import { useRef, useState, useEffect } from "react";

// Maximum characters to display to prevent memory issues with large data
const MAX_JSON_LENGTH = 10000;

/**
 * JSON viewer widget body.
 * @returns React element.
 */
function JsonViewer() {
	const { sources } = useLocalDataSource();
	const [displayData, setDisplayData] = useState<string>("");
	const lastUpdateRef = useRef<number>(0);

	// Throttle updates to prevent excessive re-renders and string allocations
	useEffect(() => {
		const now = Date.now();
		// Only update every 100ms (10Hz) to reduce memory pressure
		if (now - lastUpdateRef.current < 100) {
			return;
		}
		lastUpdateRef.current = now;

		// Extract only the latest value from each source, not the entire buffer
		const latestValues: Record<string, unknown> = {};
		sources.forEach((source, key) => {
			if (source.data.length > 0) {
				latestValues[key] = source.data[source.data.length - 1];
			}
		});

		let jsonStr = JSON.stringify(latestValues, null, 2);

		// Truncate if too long to prevent memory issues
		if (jsonStr.length > MAX_JSON_LENGTH) {
			jsonStr =
				jsonStr.substring(0, MAX_JSON_LENGTH) + "\n... (truncated)";
		}

		setDisplayData(jsonStr);
	}, [sources]);

	return (
		<div style={{ height: "100%", overflow: "auto", display: "grid" }}>
			<pre
				className="shadow-inner-md rounded-md m-3 p-1"
				style={{
					boxShadow: "5px 5px 16px 0px rgba(0,0,0,0.1) inset",
					backgroundColor: "darkslategrey",
					color: "white",
				}}
			>
				{displayData}
			</pre>
		</div>
	);
}

/** Props for JsonViewer widget. */
interface JsonViewerProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
}

/**
 * Widget definition for JsonViewer.
 * @returns Widget definition.
 */
function JsonViewerWidget(data: JsonViewerProps) {
	return (
		<LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
			<JsonViewer />
		</LocalDataSourcesProvider>
	);
}

export function JsonViewerDefinition(): WidgetDefinition<JsonViewerProps> {
	return {
		id: "json-viewer-widget",
		name: "Json viewer",
		description: "Display a json viewer",
		titleProp: "title",
		icon: <FileIcon />,
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
				} as TopicSelectElement,
			],
		} as VerticalLayout,

		data: {
			title: "Json viewer",
		},
		Component: JsonViewerWidget,
	} as WidgetDefinition<JsonViewerProps>;
}
