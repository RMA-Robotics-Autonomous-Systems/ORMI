enum PluginsHooks {
    PLUGIN_PROVIDER_BEFORE_CHILDREN = "plugins-before-children", // filter called before rendering children of the plugin provider
    PLUGIN_PROVIDER_AFTER_CHILDREN = "plugins-after-children", // filter called after  rendering children of the plugin provider

    JSON_FORMS_RENDERER = "plugins-jsonforms-renderer", // hooks that take an array of jsonforms renderer and return an jsonforms renderer

    WIDGETS_LIST = "plugins-widgets-list", // hooks that take an array of widgets and return an array of widgets
    DATASOURCES_LIST = "plugins-datasources-list", // hooks that take an array of datasources definition and return an array of datasources definition

    WIDGET_LIST_WITH_DATASOURCE = "plugins-widgets-list-with-datasource", // hooks that take an array of widgets and array of availables datasources then return an array of widgets

    /**
     *  hooks that take an array of topics and return an array of all available topics from the different plugins
     *  params: [ topics: DatasourceTopic[], filter?: DatasourceTopicFilter ]
     */
    AVAILABLE_TOPICS = "plugins-topics-list", // hooks that take an array of topics and return an array of topics
    AVAILABLE_DATASOURCES = "plugins-datasources-availables", // hooks that take an array of datasources and return an array of datasources, Datasource that are enable in the workspace

    TRANSFORM_TREE = "CORE-TRANSFORM-TREE", // hooks that take a map of transform tree and return a map transform tree

    MAP_LOCAL_VISUALIZERS = "map-local-visualizers", // hooks that take a map of local topic visualizers and return an extended map

    // ========================================================================
    // Remote Call Hooks (Services/Actions unified API)
    // ========================================================================

    /**
     * Filter that returns all available remote calls from all datasources.
     * Similar to AVAILABLE_TOPICS but for services/actions.
     * params: [ calls: RemoteCallDefinition[], filter?: RemoteCallFilter ]
     */
    AVAILABLE_REMOTE_CALLS = "plugins-remote-calls-list",

    /**
     * Filter to get the schema/definition for a specific remote call.
     * params: [ definition: RemoteCallDefinition | null, datasource_id: string, callName: string ]
     */
    REMOTE_CALL_DEFINITION = "plugins-remote-call-definition",
}

interface PluginAction {
    id: string;
    priority: number;
    action: (...args: any) => void;
}

interface PluginFilter {
    id: string;
    priority: number;
    filter: (...args: any) => any;
}

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

export type PluginRegistry = Record<string, Promise<Plugin>>;

export interface PluginInfo {
    name: string;
    description: string;
    version: string;
}

export type { PluginAction, PluginFilter };
export { PluginsHooks };
