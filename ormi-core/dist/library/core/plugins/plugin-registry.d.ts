import { PluginServerSide } from './plugin-core';
/**
 * A registry for plugins to register themselves
 * This avoids the need for dynamic imports
 */
declare class PluginRegistry {
    private static instance;
    private pluginConstructors;
    private constructor();
    static getInstance(): PluginRegistry;
    /**
     * Register a plugin constructor
     * @param name The name of the plugin
     * @param constructor The plugin constructor
     */
    register(name: string, constructor: new () => PluginServerSide): void;
    /**
     * Get a plugin constructor by name
     * @param name The name of the plugin
     */
    getConstructor(name: string): (new () => PluginServerSide) | undefined;
    /**
     * Get all registered plugin constructors
     */
    getAllConstructors(): Map<string, new () => PluginServerSide>;
}
export default PluginRegistry;
