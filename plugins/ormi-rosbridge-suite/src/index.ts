import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";

import { datasourceDefinition } from "./export";

class RosBridgeSuitePlugin extends Plugin {
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
			filter: (datasources) => {
				datasources.push(datasourceDefinition);
				return datasources;
			},
		});
	}
}

export default RosBridgeSuitePlugin;

export { UnifiedConverter } from "./ros2/unified-converter";
