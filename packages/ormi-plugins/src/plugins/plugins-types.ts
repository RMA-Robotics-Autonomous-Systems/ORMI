import type React from "react";

/**
 * Plugin system hooks for extending ORMI functionality.
 */
enum PluginsHooks {
	PLUGIN_PROVIDER_BEFORE_CHILDREN = "plugins-before-children",
	PLUGIN_PROVIDER_AFTER_CHILDREN = "plugins-after-children",

	JSON_FORMS_RENDERER = "plugins-jsonforms-renderer",

	WIDGETS_LIST = "plugins-widgets-list",
	DATASOURCES_LIST = "plugins-datasources-list",

	WIDGET_LIST_WITH_DATASOURCE = "plugins-widgets-list-with-datasource",

	/**
	 * Hooks that take an array of topics and return all available topics from plugins.
	 * @param topics - Array of datasource topics.
	 * @param filter - Optional topic filter.
	 */
	AVAILABLE_TOPICS = "plugins-topics-list",
	AVAILABLE_DATASOURCES = "plugins-datasources-availables",

	/**
	 * Actions for datasource lifecycle management.
	 * Datasource providers emit these to coordinate initialization.
	 */
	DATASOURCE_READY = "datasource-ready",
	DATASOURCE_DISPOSED = "datasource-disposed",

	TRANSFORM_TREE = "CORE-TRANSFORM-TREE",

	MAP_LOCAL_VISUALIZERS = "map-local-visualizers",

	/**
	 * Filter that collects the live preview shown when an operator hovers a
	 * topic in the topics panel, keyed by webapp type name (`DatasourceTopic.type`),
	 * plus the `__fallback__` entry used for every unregistered type.
	 *
	 * A pull filter rather than a registry core hands out: previews are built
	 * from real widget components — an image decoder, a chart, a point-cloud
	 * scene — which must stay inside the plugin that owns them and be read by
	 * core, never imported by it. Plugin priority resolves conflicting keys.
	 * @param previews - Map of webapp type name to preview configuration.
	 */
	TOPIC_PREVIEWS = "plugins-topic-previews",

	/**
	 * Filter that collects topic-first routing claims: one entry per topic type
	 * a plugin's widget answers, naming the widget, the `TopicSelect` slot the
	 * topic is written into, and whether the widget is that type's default
	 * destination, an alternative, a control that commands it, or a raw viewer
	 * offered for any type.
	 *
	 * Routing reads **only** this — it never infers a destination from a
	 * widget's `dataRequirements`, which answer compatibility rather than
	 * routing. A type nothing claims resolves to an explicit "nothing claims
	 * this type". Claims are registered by the plugin that ships the widget,
	 * because that is the only one that can keep the widget id honest.
	 * @param claims - Array of TopicClaim.
	 */
	TOPIC_ROUTING_CLAIMS = "plugins-topic-routing-claims",

	/**
	 * Filter that returns all registered layout engine definitions.
	 * Plugins push a LayoutEngineDefinition to extend available dashboard layouts.
	 * @param engines - Array of LayoutEngineDefinition.
	 */
	DASHBOARD_LAYOUTS_LIST = "dashboard:layouts:list",

	/**
	 * Filter that returns all available remote calls from all datasources.
	 * @param calls - Array of remote call definitions.
	 * @param filter - Optional remote call filter.
	 */
	AVAILABLE_REMOTE_CALLS = "plugins-remote-calls-list",

	/**
	 * Filter to get the schema/definition for a specific remote call.
	 * @param definition - Remote call definition or null.
	 * @param datasource_id - Datasource identifier.
	 * @param callName - Remote call name.
	 */
	REMOTE_CALL_DEFINITION = "plugins-remote-call-definition",

	/**
	 * Filter that returns all plugin-registered page definitions.
	 * Plugins push a PageDefinition to add new pages to the app.
	 * @param pages - Array of PageDefinition.
	 */
	PAGES_LIST = "plugins-pages-list",
}

/**
 * Plugin action definition.
 */
interface PluginAction {
	id: string;
	priority: number;
	action: (...args: any) => void;
}

/**
 * Plugin filter definition.
 */
interface PluginFilter {
	id: string;
	priority: number;
	filter: (...args: any) => any;
}

/**
 * Base plugin class for extending ORMI functionality.
 */
export class Plugin {
	protected name: string;
	protected author: string;
	protected email: string;
	protected url: string;

	protected description: string;
	protected version: string;

	protected dependencies: string[] = [];

	// actions
	public actions: Map<string | PluginsHooks, Map<string, PluginAction>> =
		new Map<string, Map<string, PluginAction>>();
	public filters: Map<string | PluginsHooks, Map<string, PluginFilter>> =
		new Map<string, Map<string, PluginFilter>>();

	constructor(options?: {
		name?: string;
		description?: string;
		version?: string;
		author?: string;
		email?: string;
		url?: string;
		dependencies?: string[];
	}) {
		this.name = options?.name || "core";
		this.description = options?.description || "Core plugin";
		this.version = options?.version || "1.0.0";
		this.author = options?.author || "";
		this.email = options?.email || "";
		this.url = options?.url || "";
		this.dependencies = options?.dependencies || [];

		// Automatically initialize the plugin
		this.initialize();
	}

	/**
	 * Initialize the plugin - register actions, filters, etc.
	 * Override this method in subclasses to implement plugin logic.
	 */
	protected initialize(): void {
		// To be overridden by subclasses
	}

	getName(): string {
		return this.name;
	}

	getDescription(): string {
		return this.description;
	}

	getVersion(): string {
		return this.version;
	}

	getAuthor(): string {
		return this.author;
	}

	getEmail(): string {
		return this.email;
	}

	getUrl(): string {
		return this.url;
	}

	getDependencies(): string[] {
		return this.dependencies;
	}

	addAction(actionName: string | PluginsHooks, action: PluginAction): void {
		if (this.actions.has(actionName)) {
			this.actions.get(actionName)?.set(action.id || this.name, action);
		} else {
			this.actions.set(
				actionName,
				new Map<string, PluginAction>([
					[action.id || this.name, action],
				]),
			);
		}
	}

	addFilter(filterName: string | PluginsHooks, filter: PluginFilter): void {
		if (this.filters.has(filterName)) {
			this.filters.get(filterName)?.set(filter.id || this.name, filter);
		} else {
			this.filters.set(
				filterName,
				new Map<string, PluginFilter>([
					[filter.id || this.name, filter],
				]),
			);
		}
	}
}

/**
 * Defines a page registered by a plugin.
 */
export interface PageDefinition {
	/** URL slug appended after /plugin-pages/, e.g. "emi-bag" → /plugin-pages/emi-bag */
	slug: string;
	/** Human-readable page title shown in the navbar. */
	title: string;
	/** React component rendered as the full page. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: React.ComponentType<any>;
	/**
	 * Optional navbar entry. When present the page appears inside the Apps
	 * dropdown in the navbar. Omit to keep the page hidden from navigation.
	 */
	navItem?: {
		position: "left" | "right";
		priority?: number;
		/**
		 * Groups related pages under a labelled section inside the dropdown.
		 * Pages sharing the same group string are listed together.
		 */
		group?: string;
		/** Short description shown below the title in the Apps dropdown. */
		description?: string;
	};
}

/**
 * Plugin registry type mapping plugin names to plugin instances.
 */
export type PluginRegistry = Record<string, Promise<Plugin>>;

/**
 * Plugin information interface.
 */
export interface PluginInfo {
	name: string;
	description: string;
	version: string;
}

/**
 * Exported types for plugin actions and filters.
 */
export type { PluginAction, PluginFilter };
export { PluginsHooks };
