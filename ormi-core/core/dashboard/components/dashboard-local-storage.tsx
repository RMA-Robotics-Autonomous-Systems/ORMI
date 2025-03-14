"use client"

import { Datasource } from "@/core/datasources/datasource-interface";
import { Widget } from "@/core/widgets/widget-interface";
import { Layouts } from "react-grid-layout";
import DashboardInterface from "../dashboard-interface";


const handleSave = (newDashboard: any) => {
    // save the dashboard to local storage
    localStorage.setItem("dashboard", JSON.stringify(newDashboard));
};

const handleLoad = (
    setLayouts: React.Dispatch<React.SetStateAction<Layouts>>,
    setWidgets: React.Dispatch<React.SetStateAction<Map<string, Widget>>>,
    setLocked: React.Dispatch<React.SetStateAction<boolean>>,
    setDatasources: React.Dispatch<React.SetStateAction<Map<string, Datasource>>>) => {

    // load the dashboard from the local storage
    const dashboardDefinition = JSON.parse(localStorage.getItem("dashboard") || JSON.stringify({
        layouts: {
            lg: [],
            md: [],
            sm: [],
            xs: [],
            xxs: []
        },
        widgets: new Map<string, Widget>()
    }) as string) as DashboardInterface;

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
    setLocked(dashboardDefinition.locked);
    setLayouts(dashboardDefinition.layouts);
    setWidgets(dashboardDefinition.widgets);
    setDatasources(dashboardDefinition.datasources);
}

export { handleSave, handleLoad };