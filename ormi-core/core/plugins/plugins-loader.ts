/*
    Class that load all plugins in the plugins directory,
    and store them in a Map object.
*/

// import Bun;
import fs from 'fs';
// import dynamic from 'next/dynamic';

import {PluginCore, PluginData} from './plugin-core';

class PluginsLoader{

    private plugins: Map<string, PluginCore>;
    private static PLUGINS_PATH: string = 'plugins';

    constructor(){
        this.plugins = new Map<string, PluginCore>();
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

    public getPlugins(): Map<string,PluginCore>{
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

    public convertToPlainObject(): Map<string, PluginData>{
            
        const plugins: Map <string, PluginData> = new Map<string, PluginData>();

        this.plugins.forEach((plugin: PluginCore, key: string) => {
            plugins.set(key, plugin.toObject());
        });

        return plugins;
    }

}

export default PluginsLoader;