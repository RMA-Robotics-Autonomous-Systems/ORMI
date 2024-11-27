/*
    Class that load all plugins in the plugins directory,
    and store them in a Map object.
*/

// import Bun;
import fs from 'fs';
// import dynamic from 'next/dynamic';

import {PluginServerSide, PluginClientSide} from './plugin-core';

class PluginsLoader{

    private plugins: Map<string, PluginServerSide>;
    private static PLUGINS_PATH: string = 'plugins';

    constructor(){
        this.plugins = new Map<string, PluginServerSide>();
        this.load();
    }
    
    addPlugin(plugin: PluginServerSide): void{

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

    public getPlugins(): Map<string,PluginServerSide>{
        return this.plugins;
    }

    load(): boolean{
        // Load all plugins in the plugins directory
        const plugins: string[] = PluginsLoader.listPluginsDir();

        for(const plugin of plugins){

            // Load plugin
            // eslint-disable-next-line @next/next/no-assign-module-variable, @typescript-eslint/no-require-imports
            const module = require(`@/plugins/${plugin}/index.ts`);
            const pluginInstance = new module.default();
            this.addPlugin(pluginInstance);

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

    public getClientSide(): Map<string, PluginClientSide>{
            
        const plugins: Map <string, PluginClientSide> = new Map<string, PluginClientSide>();

        this.plugins.forEach((plugin: PluginServerSide, key: string) => {
            plugins.set(key, plugin.toObject());
        });

        return plugins;
    }

}

export default PluginsLoader;