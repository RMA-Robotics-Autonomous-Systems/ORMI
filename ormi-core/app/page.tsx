import styles from "./page.module.css";

import WidgetsDialog from "@/core/widgets/components/widgets-dialog/widgets-dialog";
import { DashboardProvider } from "@/core/dashboard/components/dashboard-provider";
import DashboardInterface from "@/core/dashboard/dashboard-interface";
import Dashboard from "@/core/dashboard/components/dashboard";
import { Widget } from "@/core/widgets/widget-interface";

import { Datasource } from "@/core/datasources/datasource-interface";
import { GlobalDataSourcesProvider } from "@/core/datasources/components/global-datasource-provider";

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
            <DashboardProvider dashboardDefinition={dashboardDefinition}>
                <GlobalDataSourcesProvider>
                    <Dashboard />
                    {/* <WidgetsDialog /> */}
                </GlobalDataSourcesProvider>
            </DashboardProvider>
        </div>
    );
}
