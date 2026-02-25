"use client";

import {
	RosBridgeSuiteDataSourceSettings,
	RosBridgeSuiteSourceProvider,
} from "./rosbridge-suite-source";
import { Ros2ConvertionGraphDefinition } from "./ros2/convertion-graph";
import { RQTGraphDefinition } from "./ros2/rqt-graph";
import { WebRtcRos2Definition } from "./ros2/images/webrtc";
import {
	Datasource,
	DatasourceDefinition,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";

export const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {
	datasources.push({
		id: "rosbridge-suite-source",
		name: "ROSBridge Suite",
		description: "ROS2 connection using ROSBridge suite",

		schema: {
			title: "ROSBridge Suite",
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
			url: "ws://localhost:9090",
			reconnectTimeout: 2,
		},

		Provider: (props) => RosBridgeSuiteSourceProvider(props),
	} as DatasourceDefinition<RosBridgeSuiteDataSourceSettings>);

	return datasources;
};

export const widgetsExport = (widgets: WidgetDefinition<any>[]) => {
	widgets.push(Ros2ConvertionGraphDefinition());
	widgets.push(RQTGraphDefinition());
	widgets.push(WebRtcRos2Definition());

	return widgets;
};

export const widgetFilters = (
	widgets: WidgetDefinition[],
	datasources: Datasource[],
) => {
	const widget_that_requires_rosbridge = [
		"ros2-convertion-graph",
		"rqt-graph",
	];

	const has_rosbridge = datasources.find((datasource) => {
		return (
			datasource.datasource_id === "rosbridge-suite-source" &&
			datasource.settings.enable
		);
	});

	if (!has_rosbridge) {
		widgets = widgets.filter((widget) => {
			return !widget_that_requires_rosbridge.includes(widget.id);
		});
	}

	return widgets;
};
