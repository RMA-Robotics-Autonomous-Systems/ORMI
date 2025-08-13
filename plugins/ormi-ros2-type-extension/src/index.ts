
import { PluginsHooks, Plugin, PluginFilter } from "@workspace/ormi-plugins";
import { ConverterFilterFunction } from "./ros2-converter";

class Ros2TypeExtensionPlugin extends Plugin{

    constructor(){
        super();

        this.name = "Ros2 Type Extension";
        this.description = "Plugin to extend ROS2 types in the webapp.";
        this.version = "1.0.0";
        this.author = "Lbcqu Florian";
        this.email = "florian.lebecque@mil.be";

        const converterFilter = {
            id: this.name + "-converter-filter",
            priority: 10,
            filter: ConverterFilterFunction
        } as PluginFilter;

        this.addFilter("ros2-converters", converterFilter);

        // this.addFilter(PluginsHooks.DATASOURCES_LIST, datasourceFilter);
        // this.addFilter(PluginsHooks.WIDGETS_LIST, widgetFilter);
        // this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, widgetFilterWithDatasource);
    }
}

export default Ros2TypeExtensionPlugin;