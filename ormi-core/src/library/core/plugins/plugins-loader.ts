/*
    Class that loads all plugins using the plugin registry system,
    and stores them in a Map object.
*/

import { PluginServerSide } from './plugin-core';
import { PluginClientSide } from './plugins-types';
import PluginRegistry from './plugin-registry';

class PluginsLoader {
    private plugins: Map<string, PluginServerSide>;
    
    constructor() {
        this.plugins = new Map<string, PluginServerSide>();
    }
    
    addPlugin(plugin: PluginServerSide): void {
        this.plugins.set(plugin.getName(), plugin);
    }

    getPlugin(pluginName: string): unknown {
        if (this.plugins.has(pluginName)) {
            return this.plugins.get(pluginName);
        }
        throw new Error(`Plugin ${pluginName} not found`);
    }

    public getPlugins(): Map<string, PluginServerSide> {
        return this.plugins;
    }

    /**
     * Load plugins from the registry
     */
    async load(): Promise<boolean> {
        const registry = PluginRegistry.getInstance();
        const constructors = registry.getAllConstructors();
        
        constructors.forEach((Constructor, name) => {
            try {
                console.log(`Instantiating registered plugin: ${name}`);
                const pluginInstance = new Constructor();
                this.addPlugin(pluginInstance);
            } catch (error) {
                console.error(`Failed to instantiate plugin ${name}:`, error);
            }
        });
        
        return true;
    }

    public getClientSide(): Map<string, PluginClientSide> {
        const plugins: Map<string, PluginClientSide> = new Map<string, PluginClientSide>();

        this.plugins.forEach((plugin: PluginServerSide, key: string) => {
            plugins.set(key, plugin.toObject());
        });

        return plugins;
    }
}

export default PluginsLoader;