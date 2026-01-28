import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";

import { dataSourceExport, widgetFilters, widgetsExport } from "./export";

class RestbagsPlugin extends Plugin {
	constructor() {
		super();

		this.name = "RestBags Plugin";
		this.description =
			"This plugin provides a REST API for managing ROS 2 bags, allowing users to record, playback, and manage bag files through a web interface.";
		this.version = "1.0.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		this.addFilter(PluginsHooks.DATASOURCES_LIST, {
			id: "rest-bags-datasources",
			priority: 12,
			filter: dataSourceExport,
		});

		this.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: "rest-bags-widgets",
			priority: 12,
			filter: widgetsExport,
		});

		this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, {
			id: "rest-bags-widgets-with-datasource",
			priority: 12,
			filter: widgetFilters,
		});
	}
}

export default RestbagsPlugin;
