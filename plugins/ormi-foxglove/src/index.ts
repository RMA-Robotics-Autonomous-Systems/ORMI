import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import { datasourceDefinition, rendererDefinition } from "./export";

// Export components for potential external use
export { FoxgloveSourceProvider } from "./foxglove-source";
export { FoxgloveDataHandler } from "./foxglove-data-handler";
export { SubscriptionManager } from "./subscription-manager";
export { PublisherManager } from "./publisher-manager";
export { ServiceManager } from "./service-manager";
export { TransformTreeManager } from "./transform-tree-manager";
export { TypeSystemManager } from "./type-system-manager";
export { UnifiedConverter } from "./unified-converter";
export { foxgloveIdlToJsonSchema } from "./foxglove-idl-to-jsonschema";
export type { FoxgloveDataSourceSettings } from "./types";

/**
 * Foxglove WebSocket Plugin
 *
 * This plugin provides integration with the Foxglove WebSocket protocol for connecting to
 * ROS2 and other robotics platforms that support the Foxglove WebSocket protocol.
 */
class FoxglovePlugin extends Plugin {
	constructor() {
		super();

		this.name = "Foxglove WebSocket";
		this.description =
			"Provides integration with Foxglove WebSocket protocol";
		this.version = "1.0.0";
		this.author = "Florian Lebecque";
		this.email = "florian.lebecque@mil.be";

		// Register datasource
		this.addFilter(PluginsHooks.DATASOURCES_LIST, {
			id: "foxglove-datasource-provider",
			priority: 10,
			filter: (datasources: any[]) => {
				datasources.push(datasourceDefinition);
				return datasources;
			},
		});

		// Register custom renderer for URL field
		this.addFilter(PluginsHooks.JSON_FORMS_RENDERER, {
			id: "foxglove-url-renderer",
			priority: 10,
			filter: (renderers: any[]) => {
				renderers.push(rendererDefinition);
				return renderers;
			},
		});
	}
}

export default FoxglovePlugin;
