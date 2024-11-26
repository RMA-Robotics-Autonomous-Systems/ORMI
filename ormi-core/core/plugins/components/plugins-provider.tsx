"use client";

import React, { createContext, useContext, ReactNode } from 'react';
// import PluginsLoader from './plugins-loader';
import PluginsManager from '../plugins-manager';
import { PluginData } from '../plugin-core';
import { PluginsHooks } from '../plugins-types';


// Create the context with a default value
const PluginsContext = createContext<PluginsManager | undefined>(undefined);

// Create a provider component
const PluginsProvider: React.FC<{ children: ReactNode, pluginsLoader: Map<string, PluginData> }> = ({ children, pluginsLoader }) => {

    const pluginsManager = new PluginsManager(pluginsLoader);

    const elements_before_children = pluginsManager.applyFilter(PluginsHooks.PLUGIN_PROVIDER_BEFORE_CHILDREN, []);
    const elements_after_children = pluginsManager.applyFilter(PluginsHooks.PLUGIN_PROVIDER_AFTER_CHILDREN, []);

    return (
        <PluginsContext.Provider value={pluginsManager}>
            {elements_before_children}
            {children}
            {elements_after_children}
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