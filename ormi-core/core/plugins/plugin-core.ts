/*
    Class that implement the core of a plugin.
*/


import { PluginAction, PluginFilter, PluginClientSide, PluginsHooks } from "@/core/plugins/plugins-types";

abstract class PluginServerSide{

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

    constructor(){
        this.name = "core";
        this.description = "Core plugin";
        this.version = "1.0.0";
        this.author = "";
        this.email = ""
        this.url = "";
    }

    // abstract init(pl:PluginsLoader): void;
    getName(): string{
        return this.name;
    }

    getDescription(): string{
        return this.description;
    }

    getVersion(): string{
        return this.version;
    }

    getAuthor(): string{
        return this.author;
    }

    getEmail(): string{
        return this.email;
    }

    getUrl(): string{
        return this.url;
    }

    getDependencies(): string[]{
        return this.dependencies;
    }

    addAction(actionName: string | PluginsHooks, action: PluginAction): void{
        if(this.actions.has(actionName)){
            this.actions.get(actionName)?.set(this.name, action);
        }else{
            this.actions.set(actionName, new Map<string, PluginAction>([[this.name, action]]));
        }
    }

    addFilter(filterName: string | PluginsHooks, filter: PluginFilter): void{
        if(this.filters.has(filterName)){
            this.filters.get(filterName)?.set(this.name, filter);
        }else{
            this.filters.set(filterName, new Map<string, PluginFilter>([[this.name, filter]]));
        }
    }

    toObject(): PluginClientSide{
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
export type { PluginAction, PluginFilter, PluginClientSide };