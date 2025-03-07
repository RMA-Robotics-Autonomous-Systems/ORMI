import {PluginServerSide,PluginsHooks} from "ormi-core/plugins";
import WidgetExport from "./widget-export";


class PluginA extends PluginServerSide{

    constructor(){
        super();

        this.name = "STD Widgets";
        this.description = "Plugin that add standard widgets to the dashboard";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        const widgetFilter = {
            id: this.name + "-widget-export",
            priority: 10,
            filter: WidgetExport
        };

        this.addFilter(PluginsHooks.WIDGETS_LIST, widgetFilter);
    }
}



export default PluginA;