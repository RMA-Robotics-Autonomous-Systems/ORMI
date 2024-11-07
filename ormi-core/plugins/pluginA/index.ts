import {PluginCore} from "@/core/plugins/plugin-core";

import Export from "./component-exporter";
import { HelloWorld } from "./client-side-functions";
import { PluginsHooks } from "@/core/plugins/plugins-types";


class PluginA extends PluginCore{

    constructor(){
        super();

        this.name = "pluginA";
        this.description = "Plugin de test et démonstration";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        this.filters.set("test_filter", {
            priority: 10,
            filter: Export
        });

        this.filters.set(PluginsHooks.PLUGIN_PROVIDER_BEFORE_CHILDREN, {
            priority: 10,
            filter: HelloWorld
        });

    }
}



export default PluginA;