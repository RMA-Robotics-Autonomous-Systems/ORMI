import { PluginServerSide } from './plugin-core';
/**
 * Register a plugin with the system
 * Plugin authors should call this function to register their plugin
 */
export declare function registerPlugin(name: string, pluginConstructor: new () => PluginServerSide): void;
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
export declare function RegisterPlugin(name: string): <T extends new (...args: any[]) => PluginServerSide>(constructor: T) => T;
