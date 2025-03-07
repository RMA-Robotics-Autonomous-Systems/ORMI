import { PluginServerSide } from './plugin-core';
import PluginRegistry from './plugin-registry';

/**
 * Register a plugin with the system
 * Plugin authors should call this function to register their plugin
 */
export function registerPlugin(name: string, pluginConstructor: new () => PluginServerSide): void {
    const registry = PluginRegistry.getInstance();
    registry.register(name, pluginConstructor);
}

/**
 * Decorator to automatically register a plugin class
 * @example
 * ```
 * @RegisterPlugin('my-plugin')
 * export default class MyPlugin extends PluginServerSide {
 *   // Plugin implementation
 * }
 * ```
 */
export function RegisterPlugin(name: string) {
    return function <T extends new (...args: any[]) => PluginServerSide>(constructor: T) {
        registerPlugin(name, constructor);
        return constructor;
    };
}
