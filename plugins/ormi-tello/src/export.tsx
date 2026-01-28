"use client";

import {
	DatasourceDefinition,
	Datasource,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { TelloSourceProvider, TelloSourceSettings } from "./tello-datasource";
import { TelloCommandsControlDefinition } from "./widgets/command";

const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {
	datasources.push({
		id: "tello-data-source",
		name: "Tello",
		description: "Tello data source",

		schema: {
			title: "Tello Data Source",
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				enable: { type: "boolean", title: "Enable" },
				ip: { type: "string", title: "IP" },
			},
		},

		data: {
			id: "",
			title: "Tello",
			enable: true,
			ip: "192.168.10.1",
		} as TelloSourceSettings,

		Provider: ({ children, props }) => TelloSourceProvider(children, props),
	} as DatasourceDefinition<TelloSourceSettings>);

	return datasources;
};

export { dataSourceExport };

const WidgetExport = (widgets: WidgetDefinition[]) => {
	widgets.push(TelloCommandsControlDefinition());

	return widgets;
};

const widgetFilters = (
	widgets: WidgetDefinition[],
	datasources: Datasource[],
) => {
	const widget_that_requires_tello = ["command-tello-widget"];

	const has_tello = datasources.find((datasource) => {
		return (
			datasource.datasource_id === "tello-data-source" &&
			datasource.settings.enable
		);
	});

	if (!has_tello) {
		return widgets.filter((widget) => {
			return !widget_that_requires_tello.includes(widget.id);
		});
	}

	return widgets;
};

export { WidgetExport, widgetFilters };
