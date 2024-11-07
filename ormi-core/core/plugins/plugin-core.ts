/*
    Class that implement the core of a plugin.
*/


import { PluginAction, PluginFilter, PluginData, PluginsHooks } from "@/core/plugins/plugins-types";

abstract class PluginCore{

    protected name: string;
    protected author: string;
    protected email: string;
    protected url: string;

    protected description: string;
    protected version: string;

    protected dependencies: string[] = [];


    // actions
    protected actions: Map<string | PluginsHooks , PluginAction> = new Map<string, PluginAction>();
    protected filters: Map<string | PluginsHooks, PluginFilter> = new Map<string, PluginFilter>();


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

    toObject(): PluginData{
        return {
            name: this.name,
            description: this.description,
            version: this.version,
            actions: this.actions,
            filters: this.filters
        }
    }
}

export { PluginCore };
export type { PluginAction, PluginFilter, PluginData };