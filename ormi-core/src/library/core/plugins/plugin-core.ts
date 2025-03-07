/*
    Class that implements the core of a plugin.
*/

import { PluginAction, PluginFilter, PluginClientSide, PluginsHooks } from "@/library/core/plugins/plugins-types";

abstract class PluginServerSide {
    protected name: string;
    protected author: string;
    protected email: string;
    protected url: string;

    protected description: string;
    protected version: string;

    protected dependencies: string[] = [];

    // actions
    protected actions: Map<string | PluginsHooks, Map<string, PluginAction>> = new Map<string, Map<string, PluginAction>>();
    protected filters: Map<string | PluginsHooks, Map<string, PluginFilter>> = new Map<string, Map<string, PluginFilter>>();

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
            this.actions.set(actionName, new Map<string, PluginAction>([[action.id || this.name, action]]));
        }
    }

    addFilter(filterName: string | PluginsHooks, filter: PluginFilter): void {
        if (this.filters.has(filterName)) {
            this.filters.get(filterName)?.set(filter.id || this.name, filter);
        } else {
            this.filters.set(filterName, new Map<string, PluginFilter>([[filter.id || this.name, filter]]));
        }
    }

    toObject(): PluginClientSide {
        return {
            name: this.name,
            description: this.description,
            version: this.version,
            actions: this.actions,
            filters: this.filters
        }
    }
}

export { PluginServerSide };