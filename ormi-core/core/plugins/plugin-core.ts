/*
    Class that implement the core of a plugin.
*/


interface PluginComponent{
    // The name of the component
    name: string;
    // function that return the cmp
    component: (...args: any[]) => React.JSX.Element;
}

interface PluginField{
    type: string;
    component: (...args: any[]) => React.JSX.Element;
}

abstract class PluginCore{

    protected name: string;
    protected description: string;
    protected version: string;

    protected Fields: Map<string, PluginField>;
    protected Widgets: Map<string, PluginComponent>;

    constructor(){
        this.name = "core";
        this.description = "Core plugin";
        this.version = "1.0.0";

        this.Fields = new Map<string, PluginField>();
        this.Widgets = new Map<string, PluginComponent>();
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

    // abstract getComponent(key?: PluginsHooks | string): Map<string, JSX.Element>;
}

export { PluginCore };
export type { PluginComponent, PluginField };
