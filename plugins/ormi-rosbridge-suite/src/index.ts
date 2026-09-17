import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";

import type { TopicRoutingClaims } from "@workspace/ormi-core/widgets";

import { dataSourceExport, widgetFilters, widgetsExport } from "./export";
import { topicClaims } from "./topic-claims";

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

		// Which topic types this plugin's widgets answer — see
		// `topic-claims.ts`.
		this.addFilter(PluginsHooks.TOPIC_ROUTING_CLAIMS, {
			id: "ros-2-topic-routing-claims",
			priority: 12,
			filter: (claims: TopicRoutingClaims) => {
				claims.push(...topicClaims);
				return claims;
			},
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

export default RosBridgeSuitePlugin;

export { UnifiedConverter } from "./ros2/unified-converter";
