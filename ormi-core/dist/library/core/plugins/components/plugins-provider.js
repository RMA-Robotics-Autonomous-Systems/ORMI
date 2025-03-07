"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useRef } from 'react';
// import PluginsLoader from './plugins-loader';
import PluginsManager from '../plugins-manager';
// Create the context with a default value
var PluginsContext = createContext(undefined);
// Create a provider component
var PluginsProvider = function (props) {
    var children = props.children, pluginsLoader = props.pluginsLoader;
    var pluginsManagerRef = useRef(new PluginsManager(pluginsLoader));
    // const elements_before_children = pluginsManagerRef.current.applyFilter<ReactNode>(PluginsHooks.PLUGIN_PROVIDER_BEFORE_CHILDREN, []);
    // const elements_after_children = pluginsManagerRef.current.applyFilter<ReactNode>(PluginsHooks.PLUGIN_PROVIDER_AFTER_CHILDREN, []);
    return (_jsx(PluginsContext.Provider, { value: pluginsManagerRef.current, children: children }));
};
// Create a custom hook to use the context
var usePluginsManager = function () {
    var context = useContext(PluginsContext);
    if (context === undefined) {
        throw new Error('usePlugins must be used within a PluginsProvider');
    }
    return context;
};
export { PluginsProvider, usePluginsManager };
