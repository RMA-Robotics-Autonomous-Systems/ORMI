import { PluginsHooks, Plugin, PluginFilter } from "@workspace/ormi-plugins";
import {
	addMapTypeArray,
	addTopicTypeFilter,
	mapMarkerComponent,
} from "./teodor-emi-export";

class TeodorEMIPlugin extends Plugin {
	constructor() {
		super();

		this.name = "Teodor EMI Plugin";
		this.description = "Plugin to extend Teodor EMI types in the webapp.";
		this.version = "1.0.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		const mapTypeFilter = {
			id: this.name + "-map-type-filter",
			priority: 10,
			filter: addMapTypeArray,
		} as PluginFilter;

		const mapTopicTypeFilter = {
			id: this.name + "-map-topic-type-filter",
			priority: 10,
			filter: addTopicTypeFilter,
		} as PluginFilter;

		const mapMarkerComponentFilter = {
			id: this.name + "-map-marker-component-filter",
			priority: 10,
			filter: mapMarkerComponent,
		} as PluginFilter;

		this.addFilter("std-widgets-map-type", mapTypeFilter);
		this.addFilter(
			"std-widgets-map-topic-available-type",
			mapTopicTypeFilter,
		);
		this.addFilter("std-widgets-map-components", mapMarkerComponentFilter);
	}
}

export default TeodorEMIPlugin;
