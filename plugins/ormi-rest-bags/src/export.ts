"use client";

import { RestBagDatasourceDefinition } from "./rest-bag/rest-bag-datasource";
import { BagListDefinition } from "./rest-bag/manager/bag-list";
import { BagRecorderDefinition } from "./rest-bag/recorder/records-list";
import {
	Datasource,
	DatasourceDefinition,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";

/**
 * Exports REST bag datasource definition.
 * @param datasources - Array of datasource definitions.
 * @returns Updated datasource array.
 */
export const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {
	datasources.push(RestBagDatasourceDefinition);

	return datasources;
};

/**
 * Exports REST bag widgets.
 * @param widgets - Array of widget definitions.
 * @returns Updated widget array.
 */
export const widgetsExport = (widgets: WidgetDefinition[]) => {
	widgets.push(BagListDefinition());
	widgets.push(BagRecorderDefinition());

	return widgets;
};

/**
 * Filters widgets based on REST bag datasource availability.
 * @param widgets - Array of widget definitions.
 * @param datasources - Array of datasources.
 * @returns Filtered widget array.
 */
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
