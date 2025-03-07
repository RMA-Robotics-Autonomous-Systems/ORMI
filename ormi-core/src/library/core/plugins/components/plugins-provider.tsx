"use client"

import React, { createContext, useContext, ReactNode, useRef } from 'react';
// import PluginsLoader from './plugins-loader';
import PluginsManager from '../plugins-manager';
import { PluginsHooks, PluginClientSide } from '../plugins-types';



// Create the context with a default value
const PluginsContext = createContext<PluginsManager | undefined>(undefined);

interface PluginsProviderProps {
    children: ReactNode;
    pluginsLoader: Map<string, PluginClientSide>;
}

// Create a provider component
const PluginsProvider = (props: PluginsProviderProps) => {

    const { children, pluginsLoader } = props;
    const pluginsManagerRef = useRef(new PluginsManager(pluginsLoader));

    // const elements_before_children = pluginsManagerRef.current.applyFilter<ReactNode>(PluginsHooks.PLUGIN_PROVIDER_BEFORE_CHILDREN, []);
    // const elements_after_children = pluginsManagerRef.current.applyFilter<ReactNode>(PluginsHooks.PLUGIN_PROVIDER_AFTER_CHILDREN, []);

    return (
        <PluginsContext.Provider value={pluginsManagerRef.current}>
            {/* {elements_before_children} */}
            {children}
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