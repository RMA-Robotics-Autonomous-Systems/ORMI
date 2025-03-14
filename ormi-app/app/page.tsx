import styles from "./page.module.css";

import { GlobalDataSourcesProvider } from "ormi-core/datasources";
import { WidgetsDialog } from "ormi-core/widgets";
import { temphandleLoad as tl, temphandleSave as ts } from "ormi-core/templates";
import { TemplatesProvider } from "ormi-core/templates";
import { Widget } from "ormi-core/widgets";
import { Datasource } from "ormi-core/datasources";
import { DashboardProvider, DashboardInterface, Dashboard, handleLoad, handleSave } from "ormi-core/dashboard"

export default function Home() {

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
        </div>
    );
}
