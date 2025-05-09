
import { PluginsHooks, Plugin, PluginFilter } from "ormi-core/plugins";
import {dataSourceExport, WidgetExport} from "./export";

class TelloDronePlugin extends Plugin{

    constructor(){
        super();

        this.name = "Tello Drone";
        this.description = "Plugin to control Tello drone";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        const widgetFilter = {
            id: this.name + "-widget-export",
            priority: 10,
            filter: WidgetExport 
        } as PluginFilter;

        const datasourceFilter = {
            id: this.name + "-datasource-export",
            priority: 10,
            filter: dataSourceExport
        } as PluginFilter;

        this.addFilter(PluginsHooks.DATASOURCES_LIST, datasourceFilter);
        this.addFilter(PluginsHooks.WIDGETS_LIST, widgetFilter);
    }
}

export default TelloDronePlugin;