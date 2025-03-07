import { PluginServerSide } from './plugin-core';

/**
 * A registry for plugins to register themselves
 * This avoids the need for dynamic imports
 */
class PluginRegistry {
    private static instance: PluginRegistry;
    private pluginConstructors: Map<string, new () => PluginServerSide>;
    
    private constructor() {
        this.pluginConstructors = new Map();
    }
    
    public static getInstance(): PluginRegistry {
        if (!PluginRegistry.instance) {
            PluginRegistry.instance = new PluginRegistry();
        }
        return PluginRegistry.instance;
    }
    
    /**
     * Register a plugin constructor
     * @param name The name of the plugin
     * @param constructor The plugin constructor
     */
    public register(name: string, constructor: new () => PluginServerSide): void {
        this.pluginConstructors.set(name, constructor);
        console.log(`Plugin "${name}" registered`);
    }
    
    /**
     * Get a plugin constructor by name
     * @param name The name of the plugin
     */
    public getConstructor(name: string): (new () => PluginServerSide) | undefined {
        return this.pluginConstructors.get(name);
    }
    
    /**
     * Get all registered plugin constructors
     */
    public getAllConstructors(): Map<string, new () => PluginServerSide> {
        return this.pluginConstructors;
    }
}

export default PluginRegistry;
