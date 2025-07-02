// import styles from "@/styles/page.module.css";



import { handleLoad, handleSave } from "@/server/prisma-dashboard";
import { handleLoad as tl, handleSave as ts, handleDelete as td } from "@/server/prisma-templates";

import { DashboardInterface, DashboardProvider, Dashboard } from "@workspace/ormi-core/dashboard";
import { Datasource, GlobalDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { Widget, WidgetsDialog } from "@workspace/ormi-core/widgets";
import { TemplatesProvider } from "@workspace/ormi-core/templates";

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