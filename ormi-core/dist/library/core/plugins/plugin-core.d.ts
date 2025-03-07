import { PluginAction, PluginFilter, PluginClientSide, PluginsHooks } from "../../../library/core/plugins/plugins-types";
declare abstract class PluginServerSide {
    protected name: string;
    protected author: string;
    protected email: string;
    protected url: string;
    protected description: string;
    protected version: string;
    protected dependencies: string[];
    protected actions: Map<string | PluginsHooks, Map<string, PluginAction>>;
    protected filters: Map<string | PluginsHooks, Map<string, PluginFilter>>;
    constructor(options?: {
        name?: string;
        description?: string;
        version?: string;
        author?: string;
        email?: string;
        url?: string;
        dependencies?: string[];
    });
    /**
     * Initialize the plugin - register actions, filters, etc.
     * Override this method in subclasses to implement plugin logic.
     */
    protected initialize(): void;
    getName(): string;
    getDescription(): string;
    getVersion(): string;
    getAuthor(): string;
    getEmail(): string;
    getUrl(): string;
    getDependencies(): string[];
    addAction(actionName: string | PluginsHooks, action: PluginAction): void;
    addFilter(filterName: string | PluginsHooks, filter: PluginFilter): void;
    toObject(): PluginClientSide;
}
export { PluginServerSide };
