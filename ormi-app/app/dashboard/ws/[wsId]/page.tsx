import styles from "@/styles/page.module.css";

import { Dashboard, DashboardProvider, DashboardInterface, handleLoad, handleSave } from "ormi-core/dashboard";
import { Widget, WidgetsDialog } from "ormi-core/widgets";

import { Datasource, GlobalDataSourcesProvider } from "ormi-core/datasources";


import { TemplatesProvider, temphandleLoad as tl, temphandleSave as ts } from "ormi-core/templates";

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
        <div className={styles.page}>
            <DashboardProvider OnLoad={handleLoad} OnSave={handleSave} dashboardDefinition={dashboardDefinition}>
                <TemplatesProvider onLoad={tl} onSave={ts}>
                    <GlobalDataSourcesProvider>
                        <Dashboard />
                        <WidgetsDialog />
                    </GlobalDataSourcesProvider>
                </TemplatesProvider>
            </DashboardProvider>
        </div >
    );
}