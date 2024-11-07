import {PluginCore} from "@/core/plugins/plugin-core";

import { PluginsHooks } from "@/core/plugins/plugins-types";
import WidgetExport from "./widget-export";


class PluginA extends PluginCore{

    constructor(){
        super();

        this.name = "STD Widgets";
        this.description = "Plugin that add standard widgets to the dashboard";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        this.filters.set(PluginsHooks.WIDGETS_LIST, {
            priority: 10,
            filter: WidgetExport
        });

    }
}



export default PluginA;