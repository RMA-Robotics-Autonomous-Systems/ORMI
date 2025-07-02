import { PluginsHooks, Plugin } from "@workspace/ormi-plugins";
import WidgetExport from "./widget-export";

class PluginA extends Plugin{

    constructor(){
        super();

        this.name = "STD Widgets";
        this.description = "Standart widgets collection.";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        const widgetFilter = {
            id: this.name + "-widget-export",
            priority: 10,
            filter: WidgetExport
        };

        this.addFilter(PluginsHooks.WIDGETS_LIST, widgetFilter);
        // this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, widgetFilter);
    }
}

export default PluginA;