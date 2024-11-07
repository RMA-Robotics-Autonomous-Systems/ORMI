"use client";

import React, { createContext, useContext, ReactNode } from 'react';
// import PluginsLoader from './plugins-loader';
import PluginsManager from './plugins-manager';
import { PluginData } from './plugin-core';


// Create the context with a default value
const PluginsContext = createContext<PluginsManager | undefined>(undefined);

// Create a provider component
const PluginsProvider: React.FC<{ children: ReactNode, pluginsLoader: Map<string, PluginData> }> = ({ children, pluginsLoader }) => {

    const pluginsManager = new PluginsManager(pluginsLoader);

    return (
        <PluginsContext.Provider value={pluginsManager}>
            {children}
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