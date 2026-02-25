import { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";
import dataSourceExport from "./export";
import { PluginsHooks, Plugin } from "@workspace/ormi-plugins";

class RandomDataSourcePlugins extends Plugin {
	constructor() {
		super();

		this.name = "Random data source";
		this.description =
			"Plugin that add a datasource that generate random data";
		this.version = "1.0.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		const rndFilter = {
			id: "random-data-source-filter",
			priority: 10,
			filter: dataSourceExport,
		};

		this.addFilter(PluginsHooks.DATASOURCES_LIST, rndFilter);
	}
}

interface RandomDataSourceTopicDefinition {
	topic: string;
	frequency: number;
	type: string;
}

interface RandomDataSourceSettings extends DatasourceProviderSettings {
	topics: RandomDataSourceTopicDefinition[];
}

export type { RandomDataSourceSettings, RandomDataSourceTopicDefinition };

export default RandomDataSourcePlugins;
