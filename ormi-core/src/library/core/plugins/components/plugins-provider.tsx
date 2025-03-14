"use client"

import React, { createContext, useContext, ReactNode, useRef, useEffect } from 'react';
// import PluginsLoader from './plugins-loader';
import PluginsManager from '../plugins-manager';
import { PluginsHooks, Plugin, PluginRegistry } from '../plugins-types';

// Create the context with a default value
const PluginsContext = createContext<PluginsManager | undefined>(undefined);

interface PluginsProviderProps {
    children: ReactNode;
    PluginsInfo: PluginRegistry;
}

// Create a provider component
const PluginsProvider = (props: PluginsProviderProps) => {

    const { children, PluginsInfo } = props;

    const pluginsManagerRef = useRef<PluginsManager>(null);

    const [initialized, setInitialized] = React.useState(false);

    // Initialize plugins map
    useEffect(() => {

        const loadPlugins = async () => {
            const pluginsMap = new Map<string | PluginsHooks, Plugin>();

            // Load all plugins
            for (const pluginPromise of Object.values(PluginsInfo)) {

                const plugin = (await pluginPromise as any).default;

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
                console.log("Plugin loaded", pluginInstance.name);
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
        pluginsManagerRef.current && <PluginsContext.Provider value={pluginsManagerRef.current}>
            {/* {elements_before_children} */}
            {initialized && children}
            {/* {elements_after_children} */}
        </PluginsContext.Provider>
    );
};

// Create a custom hook to use the context
const usePluginsManager = () => {
    const context = useContext(PluginsContext);
    if (context === undefined) {
        throw new Error('usePlugins must be used within a PluginsProvider');
    }
    return context;
};

export { PluginsProvider, usePluginsManager };