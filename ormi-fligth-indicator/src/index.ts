
import { PluginsHooks, Plugin } from "ormi-core/plugins";
import WidgetExport from "./widget-export";

class FlightIndicator extends Plugin{

    constructor(){
        super();

        this.name = "Flight Indicator";
        this.description = "Flight Indicator widgets";
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

export default FlightIndicator;