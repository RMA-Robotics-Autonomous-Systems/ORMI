/*
    Class that load all plugins in the plugins directory,
    and store them in a Map object.
*/

// import Bun;
import fs from 'fs';
// import dynamic from 'next/dynamic';

import {PluginCore} from './plugin-core';
import PluginsHooks from './plugins-hooks';

interface PluginEvent{
    event: string | PluginsHooks;
    priority: number;
    callback: (args: unknown[]) => unknown;
}

class PluginsLoader{

    private plugins: Map<string, PluginCore>;
    private event_maps: Map<string | PluginsHooks, Map<string, PluginEvent>>;

    private static PLUGINS_PATH: string = 'plugins';

    constructor(){
        this.plugins = new Map<string, PluginCore>();
        this.event_maps = new Map<string | PluginsHooks, Map<string, PluginEvent>>();
    }
    
    addPlugin(plugin: PluginCore): void{

        // Add plugin to plugins object
        this.plugins.set(plugin.getName(), plugin);
    }

    getPlugin(pluginName: string): unknown{
        // Get plugin from plugins object

        if(this.plugins.has(pluginName)){
            return this.plugins.get(pluginName);
        }

        throw new Error(`Plugin ${pluginName} not found`);
    }

    getPlugins(): Map<string,PluginCore>{
        return this.plugins;
    }

    async Load(): Promise<boolean>{
        // Load all plugins in the plugins directory
        const plugins: string[] = PluginsLoader.listPluginsDir();

        for(const plugin of plugins){

            // Load plugin
            await import(`@/plugins/${plugin}/index.ts`).then((module) => {
                const pluginInstance = new module.default();
                this.addPlugin(pluginInstance);
            });

        }

        return true;
    }

    private static listPluginsDir(): string[]{
        // list all the folders in the plugins directory,
        // only if a file with the name index.ts exists in the folder
        const plugins: string[] = [];

        fs.readdirSync(PluginsLoader.PLUGINS_PATH).forEach(file => {
            if(fs.lstatSync(`${PluginsLoader.PLUGINS_PATH}/${file}`).isDirectory()){
                if(fs.existsSync(`${PluginsLoader.PLUGINS_PATH}/${file}/index.ts`)){
                    plugins.push(file);
                }
            }
        });

        return plugins;
    } 

    public addEventListener(event: string | PluginsHooks, pluginName: string, priority: number, callback: (args: unknown[]) => unknown): void{

        if(!this.event_maps.has(event)){
            this.event_maps.set(event, new Map<string, PluginEvent>());
        }

        this.event_maps.get(event)!.set(pluginName, {event: event, priority: priority, callback: callback});

    }

    public removeEventListener(event: string | PluginsHooks, pluginName: string): void{

        if(this.event_maps.has(event)){
            this.event_maps.get(event)!.delete(pluginName);
        }

    }

    public async doAction(event: string, args: unknown[]): Promise<unknown>{

        let last_result = null;

        if(this.event_maps.has(event)){

            const events = this.event_maps.get(event)!;

            const sorted_events = new Map([...events.entries()].sort((a, b) => a[1].priority - b[1].priority));

            for(const event of sorted_events.values()){
                last_result = await event.callback(args);
            }

        }

        return last_result;

    }

    public convertToPlainObject(): object{
            
        const plugins: any = {};

        for(const [key, value] of this.plugins.entries()){
            plugins[key] = { ...value };
        }

        return plugins;
    
    }

}

export default PluginsLoader;