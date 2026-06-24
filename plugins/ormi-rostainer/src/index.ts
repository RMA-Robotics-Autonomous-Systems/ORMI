import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { widgetDefinitions } from "./export";

class RostainerPlugin extends Plugin {
	constructor() {
		super();

		this.name = "ROSTainer";
		this.description =
			"Widget for monitoring and controlling ROSTainer-managed Docker containers.";
		this.version = "1.0.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		this.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: "rostainer-widgets",
			priority: 12,
			filter: (widgets: WidgetDefinition<any>[]) => {
				widgets.push(...widgetDefinitions);
				return widgets;
			},
		});
	}
}

export default RostainerPlugin;
