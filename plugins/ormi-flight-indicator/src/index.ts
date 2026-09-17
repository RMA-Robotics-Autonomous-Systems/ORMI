import { PluginsHooks, Plugin } from "@workspace/ormi-plugins";
import type { TopicRoutingClaims } from "@workspace/ormi-core/widgets";
import WidgetExport from "./export";
import { topicClaims } from "./topic-claims";

class FlightIndicator extends Plugin {
	constructor() {
		super();

		this.name = "Flight Indicator";
		this.description =
			"Add flight indicator widgets for aircraft telemetry data.";
		this.version = "1.0.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		const widgetFilter = {
			id: this.name + "-widget-export",
			priority: 10,
			filter: WidgetExport,
		};

		this.addFilter(PluginsHooks.WIDGETS_LIST, widgetFilter);

		// Which topic types these instruments answer — see `topic-claims.ts`.
		this.addFilter(PluginsHooks.TOPIC_ROUTING_CLAIMS, {
			id: this.name + "-topic-routing-claims",
			priority: 10,
			filter: (claims: TopicRoutingClaims) => {
				claims.push(...topicClaims);
				return claims;
			},
		});
	}
}

export default FlightIndicator;
