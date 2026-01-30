"use client";

import { RestBagDatasourceDefinition } from "./rest-bag/rest-bag-datasource";
import { BagListDefinition } from "./rest-bag/manager/bag-list";
import { BagRecorderDefinition } from "./rest-bag/recorder/records-list";
import {
	Datasource,
	DatasourceDefinition,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";

export const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {
	datasources.push(RestBagDatasourceDefinition);

	return datasources;
};

export const widgetsExport = (widgets: WidgetDefinition[]) => {
	widgets.push(BagListDefinition());
	widgets.push(BagRecorderDefinition());

	return widgets;
};

export const widgetFilters = (
	widgets: WidgetDefinition[],
	datasources: Datasource[],
) => {
	const widget_that_requires_bag = ["ros2-bag-list", "ros2-bag-recorder"];

	const has_bag = datasources.find((datasource) => {
		return (
			datasource.datasource_id === "rest-bag-source" &&
			datasource.settings.enable
		);
	});

	if (!has_bag) {
		widgets = widgets.filter((widget) => {
			return !widget_that_requires_bag.includes(widget.id);
		});
	}

	return widgets;
};
