import styles from "./page.module.css";

import { DashboardProvider } from "@/core/dashboard/components/dashboard-provider";
import DashboardInterface from "@/core/dashboard/dashboard-interface";
import Dashboard from "@/core/dashboard/components/dashboard";
import { Widget } from "@/core/widgets/widget-interface";

import { Datasource } from "@/core/datasources/datasource-interface";
import { GlobalDataSourcesProvider } from "@/core/datasources/components/global-datasource-provider";
import { handleLoad, handleSave } from "@/core/dashboard/components/dashboard-local-storage";
import WidgetsDialog from "@/core/widgets/components/widgets-dialog/widgets-dialog";
import { handleLoad as tl, handleSave as ts } from "@/core/templates/templates-localstorage";
import { TemplatesProvider } from "@/core/templates/templates-provider";

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
