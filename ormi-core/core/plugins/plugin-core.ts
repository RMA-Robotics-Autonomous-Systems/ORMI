/*
    Class that implement the core of a plugin.
*/


import { PluginAction, PluginFilter, PluginData } from "@/core/plugins/plugins-types";

abstract class PluginCore{

    protected name: string;
    protected description: string;
    protected version: string;



    // actions
    protected actions: Map<string, PluginAction> = new Map<string, PluginAction>();
    protected filters: Map<string, PluginFilter> = new Map<string, PluginFilter>();


    constructor(){
        this.name = "core";
        this.description = "Core plugin";
        this.version = "1.0.0";
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