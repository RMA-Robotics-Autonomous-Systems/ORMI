"use client";

import React, { ReactNode, useRef, useEffect } from "react";
// import PluginsLoader from './plugins-loader';
import { PluginsManager } from "../plugins-manager";
import {
	PluginsHooks,
	Plugin,
	PluginRegistry,
	PageDefinition,
} from "../plugins-types";
import { createSafeContext } from "@workspace/utils";

/**
 * Context for accessing plugins manager.
 */
const [PluginsContextProvider, usePluginsContext] =
	createSafeContext<PluginsManager>("Plugins");

/**
 * Props for PluginsProvider.
 */
interface PluginsProviderProps {
	children: ReactNode;
	PluginsInfo: PluginRegistry;
}

/**
 * Provider component for plugin system.
 * @param props - Component props.
 * @returns React element.
 */
const PluginsProvider = (props: PluginsProviderProps) => {
	const { children, PluginsInfo } = props;

	const pluginsManagerRef = useRef<PluginsManager | null>(null);

	const [initialized, setInitialized] = React.useState(false);

	// Initialize plugins map
	useEffect(() => {
		const loadPlugins = async () => {
			const pluginsMap = new Map<string | PluginsHooks, Plugin>();

			// Load all plugins
			for (const pluginPromise of Object.values(PluginsInfo)) {
				const plugin = ((await pluginPromise) as any).default;

				if (!plugin) {
					console.error("Plugin not found", plugin);
					continue;
				}

				if (!(plugin.prototype instanceof Plugin)) {
					console.error("Invalid plugin", plugin);
					continue;
				}

				const pluginInstance = new plugin();

				if (pluginsMap.has(pluginInstance.name)) {
					console.error("Plugin already loaded", pluginInstance.name);
					continue;
				}

				pluginsMap.set(pluginInstance.name, pluginInstance);
			}

			// Update the plugins manager with the loaded plugins
			pluginsManagerRef.current = new PluginsManager(pluginsMap);
			setInitialized(true);
		};

		loadPlugins();
	}, [PluginsInfo]);

	// const elements_before_children = pluginsManagerRef.current.applyFilter<ReactNode>(PluginsHooks.PLUGIN_PROVIDER_BEFORE_CHILDREN, []);
	// const elements_after_children = pluginsManagerRef.current.applyFilter<ReactNode>(PluginsHooks.PLUGIN_PROVIDER_AFTER_CHILDREN, []);

	return (
		pluginsManagerRef.current && (
			<PluginsContextProvider value={pluginsManagerRef.current}>
				{/* {elements_before_children} */}
				{initialized && children}
				{/* {elements_after_children} */}
			</PluginsContextProvider>
		)
	);
};

/**
 * Hook to access plugins manager from context.
 * @returns PluginsManager instance.
 * @throws Error if used outside PluginsProvider.
 */
const usePluginsManager = () => {
	return usePluginsContext();
};

/**
 * Returns all page definitions registered by plugins.
 * @returns Array of PageDefinition.
 */
const usePluginPages = (): PageDefinition[] => {
	const manager = usePluginsContext();
	return manager.applyFilter<PageDefinition[]>(PluginsHooks.PAGES_LIST, []);
};

/**
 * Exported components and hooks for plugin system.
 */
export { PluginsProvider, usePluginsManager, usePluginPages };
