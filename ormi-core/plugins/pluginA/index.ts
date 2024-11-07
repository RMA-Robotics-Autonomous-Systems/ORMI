import {PluginCore} from "@/core/plugins/plugin-core";

import Export from "./component-exporter";


class PluginA extends PluginCore{

    constructor(){
        super();

        this.name = "pluginA";
        this.description = "Plugin A";
        this.version = "1.0.0";


        this.filters.set("test_filter", {
            name: "test_filter",
            priority: 10,
            filter: Export
        });

    }
}



export default PluginA;