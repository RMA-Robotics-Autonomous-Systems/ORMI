// import styles from "@/styles/page.module.css";



import { handleLoad, handleSave } from "@/server/prisma-dashboard";
import { handleLoad as tl, handleSave as ts, handleDelete as td, handleUpdate as tu } from "@/server/prisma-templates";

import { DashboardInterface, DashboardProvider, dashboardRegistry } from "@workspace/ormi-core/dashboard";
import { Datasource, GlobalDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { Widget, WidgetsDialog } from "@workspace/ormi-core/widgets";
import { TemplatesProvider } from "@workspace/ormi-core/templates";


export default function WorkspacePage() {
    // These would typically come from workspace data fetched from API
    const dashboardType = "react-grid-layout"; // Replace with workspace.dashboardType
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
    };

    const DashboardComponent = dashboardRegistry[dashboardType];

    return (
        <DashboardProvider
            dashboardType={dashboardType}
            dashboardDefinition={dashboardDefinition}
            OnLoad={handleLoad}
            OnSave={handleSave}
        >
            <TemplatesProvider onLoad={tl} addTemplate={ts} removeTemplate={td} updateTemplate={tu}>
                <GlobalDataSourcesProvider>
                    <DashboardComponent />
                    <WidgetsDialog />
                </GlobalDataSourcesProvider>
            </TemplatesProvider>
        </DashboardProvider>
    );
}