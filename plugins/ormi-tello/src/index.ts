
import { PluginsHooks, Plugin, PluginFilter } from "@workspace/ormi-plugins";
import {dataSourceExport, WidgetExport, widgetFilters} from "./export";

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

        const widgetFilterWithDatasource = {
            id: this.name + "-widget-filter",
            priority: 10,
            filter: widgetFilters
        } as PluginFilter;

        this.addFilter(PluginsHooks.DATASOURCES_LIST, datasourceFilter);
        this.addFilter(PluginsHooks.WIDGETS_LIST, widgetFilter);
        this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, widgetFilterWithDatasource);
    }
}

export default TelloDronePlugin;