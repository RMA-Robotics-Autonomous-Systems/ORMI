import { PluginServerSide } from "@/core/plugins/plugin-core";

import { PluginsHooks } from "@/core/plugins/plugins-types";

import dataSourceExport from "./datasource-export";


class RandomDataSourcePlugins extends PluginServerSide {

    constructor() {
        super();

        this.name = "Random data source";
        this.description = "Plugin that add a datasource that generate random data";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        this.filters.set(PluginsHooks.DATASOURCES_LIST, {
            id: this.name + "-datasource-export",
            priority: 10,
            filter: dataSourceExport
        });

    }
}


interface RandomDataSourceTopicDefinition {
    topic:string,
    frequency:number
}

interface RandomDataSourceSettings {
    topics:RandomDataSourceTopicDefinition[]
}

export type { RandomDataSourceSettings, RandomDataSourceTopicDefinition };

export default RandomDataSourcePlugins;