import { PluginServerSide } from './plugin-core';
import { PluginClientSide } from './plugins-types';
declare class PluginsLoader {
    private plugins;
    constructor();
    addPlugin(plugin: PluginServerSide): void;
    getPlugin(pluginName: string): unknown;
    getPlugins(): Map<string, PluginServerSide>;
    /**
     * Load plugins from the registry
     */
    load(): Promise<boolean>;
    getClientSide(): Map<string, PluginClientSide>;
}
export default PluginsLoader;
