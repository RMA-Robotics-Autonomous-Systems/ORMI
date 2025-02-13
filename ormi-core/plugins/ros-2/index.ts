import { PluginServerSide } from "@/core/plugins/plugin-core";

import { PluginsHooks } from "@/core/plugins/plugins-types";

import { DatasourceProviderSettings } from "@/core/datasources/datasource-interface";
import { dataSourceExport, widgetsExport } from "./export";


class RandomDataSourcePlugins extends PluginServerSide {

    constructor() {
        super();

        this.name = "ROS 2 Plugin";
        this.description = "Add ROS 2 data sources";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        this.addFilter(PluginsHooks.DATASOURCES_LIST, {
            id: "ros-2-datasources",
            priority: 12,
            filter: dataSourceExport
        });

        this.addFilter(PluginsHooks.WIDGETS_LIST, {
            id: "ros-2-widgets",
            priority: 12,
            filter: widgetsExport
        });
    }
}


interface RandomDataSourceTopicDefinition {
    topic:string,
    frequency:number
}

interface RandomDataSourceSettings extends DatasourceProviderSettings {
    topics:RandomDataSourceTopicDefinition[]
}

export type { RandomDataSourceSettings, RandomDataSourceTopicDefinition };

export default RandomDataSourcePlugins;