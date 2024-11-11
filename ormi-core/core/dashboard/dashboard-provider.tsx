"use client";

import React, { createContext, useContext, ReactNode, use } from 'react';
import DashboardManager from './dashboard-manager';
import DashboardInterface from './dashboard-interface';
import WidgetDefinition from '../widgets/widget-interface';
import { PluginsHooks } from '../plugins/plugins-types';
import { usePluginsManager } from '../plugins/components/plugins-provider';
import PluginsManager from '../plugins/plugins-manager';


// Create the context with a default value
const DashboardContext = createContext<DashboardManager | undefined>(undefined);

// Create a provider component
const DashboardProvider: React.FC<{ children: ReactNode, dashboardDefinition: DashboardInterface }> = ({ children, dashboardDefinition }) => {

    // const dashboardManager = new DashboardManager(dashboardDefinition);

    const pluginsManager = usePluginsManager() as PluginsManager;

    const widgets: WidgetDefinition[] = pluginsManager.applyFilter(PluginsHooks.WIDGETS_LIST, []);

    const [dashboardManager] = React.useState(() => new DashboardManager(dashboardDefinition, widgets));



    return (
        <DashboardContext.Provider value={dashboardManager}>
            {children}
        </DashboardContext.Provider>
    );
};

// Create a custom hook to use the context
const useDashboardManager = () => {
    const context = useContext(DashboardContext);
    if (context === undefined) {
        throw new Error('usePlugins must be used within a DashboardProvider');
    }
    return context;
};

export { DashboardProvider, useDashboardManager };