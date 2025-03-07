/**
 * Main entry point for the ORMI plugin system
 */

// Core plugin classes
export { PluginServerSide } from './plugin-core';
export { default as PluginsLoader } from './plugins-loader';
export { default as PluginsManager } from './plugins-manager';
export { default as PluginRegistry } from './plugin-registry';

// Types
export { PluginsHooks } from './plugins-types';
export type { PluginAction, PluginFilter, PluginClientSide } from './plugins-types';

// React components
export { PluginsProvider, usePluginsManager } from './components/plugins-provider';

// Plugin utilities
export { registerPlugin, RegisterPlugin } from './plugin-utils';
