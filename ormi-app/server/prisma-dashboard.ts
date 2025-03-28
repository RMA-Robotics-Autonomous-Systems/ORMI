"use client"

import React from 'react';
import { Layouts } from "react-grid-layout";
import { DashboardInterface } from "ormi-core/dashboard";
import { Widget } from "ormi-core/widgets";
import { Datasource } from "ormi-core/datasources";

const handleSave = async (newDashboard: any) => {
    try {

        // using searchParams to get the workspaceId 
        // http://localhost:3000/dashboard/ws/7

        const url = new URL(window.location.href);
        const workspaceId = url.pathname.split('/')[3];
        if (!workspaceId) {
            throw new Error("Workspace ID is required");
        }

        const response = await fetch(`/api/workspaces/${workspaceId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: newDashboard }),
        });

        if (!response.ok) {
            throw new Error(`Error saving dashboard: ${response.statusText}`);
        }
        
        return true;
    } catch (error) {
        console.error("Failed to save dashboard:", error);
        return false;
    }
};

const handleLoad = async (
    setLayouts: React.Dispatch<React.SetStateAction<Layouts>>,
    setWidgets: React.Dispatch<React.SetStateAction<Map<string, Widget>>>,
    setLocked: React.Dispatch<React.SetStateAction<boolean>>,
    setDatasources: React.Dispatch<React.SetStateAction<Map<string, Datasource>>>) => {

        

    try {

        const url = new URL(window.location.href);
        const workspaceId = url.pathname.split('/')[3];
        if (!workspaceId) {
            throw new Error("Workspace ID is required");
        }

        console.log("Saving dashboard with ID:", workspaceId);

        const response = await fetch(`/api/workspaces/${workspaceId}`);
        
        if (!response.ok) {
            throw new Error(`Error loading dashboard: ${response.statusText}`);
        }
        
        const workspace = await response.json();
        
        // If there's no content, use default empty dashboard
        const dashboardDefinition = workspace.content ? 
            workspace.content as DashboardInterface : 
            {
                layouts: {
                    lg: [],
                    md: [],
                    sm: [],
                    xs: [],
                    xxs: []
                },
                widgets: {},
                datasources: {}
            };

        // check that the types are correct
        // if widgets is not a map, convert it to a map
        if (!(dashboardDefinition.widgets instanceof Map)) {
            dashboardDefinition.widgets = new Map(Object.entries(dashboardDefinition.widgets));
        }

        // if datasources is not a map, convert it to a map
        if (!(dashboardDefinition.datasources instanceof Map)) {
            if (dashboardDefinition.datasources) {
                dashboardDefinition.datasources = new Map(Object.entries(dashboardDefinition.datasources));
            } else {
                dashboardDefinition.datasources = new Map();
            }
        }

        // update the state
        setLocked(dashboardDefinition.locked || false);
        setLayouts(dashboardDefinition.layouts);
        setWidgets(dashboardDefinition.widgets);
        setDatasources(dashboardDefinition.datasources);
        
        return true;
    } catch (error) {
        console.error("Failed to load dashboard:", error);
        return false;
    }
};

export { handleSave, handleLoad };