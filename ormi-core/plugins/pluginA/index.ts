import {PluginCore,PluginComponent,PluginField} from "@/core/plugins/plugin-core";

import TestComponent from "./components/test";


class PluginA extends PluginCore{

    constructor(){
        super();

        this.name = "pluginA";
        this.description = "Plugin A";
        this.version = "1.0.0";


        this.Widgets.set("TestComponent",{
            component: TestComponent,
            name: "TestComponent"
        });

    }
}



export default PluginA;