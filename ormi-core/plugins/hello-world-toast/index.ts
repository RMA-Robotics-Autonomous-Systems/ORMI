import {PluginServerSide} from "@/core/plugins/plugin-core";

import  { HelloWorld } from "./client-side-functions";
import { PluginsHooks } from "@/core/plugins/plugins-types";


class PluginA extends PluginServerSide{

    constructor(){
        super();

        this.name = "Hello World";
        this.description = "Plugin that display a toast with Hello World";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        const helloFilter = {
            id: this.name + "-hello-world",
            priority: 10,
            filter: HelloWorld
        };

        this.addFilter(PluginsHooks.PLUGIN_PROVIDER_BEFORE_CHILDREN, helloFilter);

    }
}



export default PluginA;