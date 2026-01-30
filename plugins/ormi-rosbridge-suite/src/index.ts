import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";

import { dataSourceExport, widgetFilters, widgetsExport } from "./export";

class RandomDataSourcePlugins extends Plugin {
	constructor() {
		super();

		this.name = "ROSBridge_suite Plugin";
		this.description =
			"Add support for ROSBridge Suite, including datasources and widgets.";
		this.version = "1.0.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		this.addFilter(PluginsHooks.DATASOURCES_LIST, {
			id: "ros-2-datasources",
			priority: 12,
			filter: dataSourceExport,
		});

		this.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: "ros-2-widgets",
			priority: 12,
			filter: widgetsExport,
		});

		this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, {
			id: "ros-2-widgets-with-datasource",
			priority: 12,
			filter: widgetFilters,
		});
	}
}

interface RandomDataSourceTopicDefinition {
	topic: string;
	frequency: number;
}

interface RandomDataSourceSettings extends DatasourceProviderSettings {
	topics: RandomDataSourceTopicDefinition[];
}

export type { RandomDataSourceSettings, RandomDataSourceTopicDefinition };

export default RandomDataSourcePlugins;

export { UnifiedConverter } from "./ros2/unified-converter";
