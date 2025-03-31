import styles from "@/styles/page.module.css";

import { Dashboard, DashboardProvider, DashboardInterface } from "ormi-core/dashboard";
import { Widget, WidgetsDialog } from "ormi-core/widgets";

import { Datasource, GlobalDataSourcesProvider } from "ormi-core/datasources";



import { TemplatesProvider } from "ormi-core/templates";
import { handleLoad, handleSave } from "@/server/prisma-dashboard";
import { handleLoad as tl, handleSave as ts, handleDelete as td } from "@/server/prisma-templates";

export default function WorkspacePage() {

    const dashboardDefinition: DashboardInterface = {
        layouts: {
            lg: [],
            md: [],
            sm: [],
            xs: [],
            xxs: []
        },
        widgets: new Map<string, Widget>(),
        datasources: new Map<string, Datasource>(),
        locked: false
    }

    return (
        <DashboardProvider OnLoad={handleLoad} OnSave={handleSave} dashboardDefinition={dashboardDefinition}>
            <TemplatesProvider onLoad={tl} addTemplate={ts} removeTemplate={td}>
                <GlobalDataSourcesProvider>
                    <Dashboard />
                    <WidgetsDialog />
                </GlobalDataSourcesProvider>
            </TemplatesProvider>
        </DashboardProvider>
    );
}