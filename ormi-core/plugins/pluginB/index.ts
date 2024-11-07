import {PluginCore} from "@/core/plugins/plugin-core";

import  { HelloWorld } from "./client-side-functions";
import { PluginsHooks } from "@/core/plugins/plugins-types";


class PluginA extends PluginCore{

    constructor(){
        super();

        this.name = "Hello World";
        this.description = "Plugin qui ajout un Hello world";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        this.dependencies = ["pluginA^2.0.0"];

        this.filters.set(PluginsHooks.PLUGIN_PROVIDER_AFTER_CHILDREN, {
            priority: 10,
            filter: HelloWorld
        });

    }
}



export default PluginA;