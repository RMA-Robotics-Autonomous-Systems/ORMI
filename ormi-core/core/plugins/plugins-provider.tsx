"use client";

import React, { createContext, useContext, ReactNode } from 'react';
// import PluginsLoader from './plugins-loader';

// Define a type for the context value
interface MyContextType {
    plugins_loader: object;
}

// Create the context with a default value
const PluginsContext = createContext<MyContextType | undefined>(undefined);

// Create a provider component
const PluginsProvider: React.FC<{ children: ReactNode, pluginsLoader: object }> = ({ children, pluginsLoader }) => {

    return (
        <PluginsContext.Provider value={{ plugins_loader: pluginsLoader }}>
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