import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import type {
	TopicRoutingClaims,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { widgetDefinitions } from "./export";
import { topicClaims } from "./topic-claims";

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

		// Which topic types this plugin's widget answers — see
		// `topic-claims.ts`.
		this.addFilter(PluginsHooks.TOPIC_ROUTING_CLAIMS, {
			id: "rostainer-topic-routing-claims",
			priority: 12,
			filter: (claims: TopicRoutingClaims) => {
				claims.push(...topicClaims);
				return claims;
			},
		});
	}
}

export default RostainerPlugin;
