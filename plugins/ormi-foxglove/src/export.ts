import { DatasourceDefinition } from "@workspace/ormi-core/datasources";
import {
	FoxgloveDataSourceSettings,
	FoxgloveSourceProvider,
} from "./foxglove-source";
import UrlWithButtonRenderer, {
	urlWithButtonTester,
} from "./url-with-button-renderer";

/**
 * Foxglove WebSocket datasource definition
 */
export const datasourceDefinition = {
	id: "foxglove-source",
	name: "ROS2 Foxglove",
	description: "Connecting to Foxglove WebSocket servers",

	schema: {
		title: "Foxglove WebSocket",
		type: "object",
		properties: {
			title: { type: "string", title: "Title" },
			enable: { type: "boolean", title: "Enable" },
			url: {
				type: "string",
				title: "URL",
			},
			reconnectTimeout: {
				type: "number",
				title: "Reconnect Timeout (s)",
			},
			toasts: {
				type: "boolean",
				title: "Display Toasts",
			},
			transformTreeTopics: {
				type: "array",
				title: "Transform Tree Topics",
				items: {
					type: "string",
				},
			},
		},
	},

	data: {
		id: "",
		title: "",
		enable: true,
		toasts: false,
		transformTreeTopics: ["/tf", "/tf_static"],
		url: "ws://localhost:8765",
		reconnectTimeout: 2,
	},

	Provider: (props) => FoxgloveSourceProvider(props),
} as DatasourceDefinition<FoxgloveDataSourceSettings>;

/**
 * JSON Forms URL renderer definition
 */
export const rendererDefinition = {
	tester: urlWithButtonTester,
	renderer: UrlWithButtonRenderer,
};
