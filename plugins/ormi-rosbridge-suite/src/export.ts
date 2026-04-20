"use client";

import {
	RosBridgeSuiteDataSourceSettings,
	RosBridgeSuiteSourceProvider,
} from "./rosbridge-suite-source";
import { DatasourceDefinition } from "@workspace/ormi-core/datasources";

export const datasourceDefinition: DatasourceDefinition<RosBridgeSuiteDataSourceSettings> =
	{
		id: "rosbridge-suite-source",
		name: "ROSBridge Suite",
		description: "ROS2 connection using ROSBridge suite",

		schema: {
			title: "ROSBridge Suite",
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				enable: { type: "boolean", title: "Enable" },
				url: { type: "string", title: "URL" },
				reconnectTimeout: {
					type: "number",
					title: "Reconnect Timeout (s)",
				},
				toasts: { type: "boolean", title: "Display Toasts" },
				transformTreeTopics: {
					type: "array",
					title: "Transform Tree Topics",
					items: { type: "string" },
				},
			},
		},

		data: {
			id: "",
			title: "",
			enable: true,
			toasts: false,
			transformTreeTopics: ["/tf", "/tf_static"],
			url: "ws://localhost:9090",
			reconnectTimeout: 2,
		},

		Provider: (props) => RosBridgeSuiteSourceProvider(props),
	};
