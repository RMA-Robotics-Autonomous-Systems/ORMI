import PluginsLoader from "@/core/plugins/plugins-loader";
import styles from "./page.module.css";

import { PluginsProvider } from "@/core/plugins/components/plugins-provider";
import WidgetsDialog from "@/core/widgets/components/widgets-dialog/widgets-dialog";
import { DashboardProvider } from "@/core/dashboard/dashboard-provider";
import DashboardInterface from "@/core/dashboard/dashboard-interface";
import Dashboard from "@/core/dashboard/dashboard";
import { Layouts } from "react-grid-layout";
import { Widget } from "@/core/widgets/widget-interface";




export default async function Home() {

    const pl = new PluginsLoader();
    await pl.Load();

    // convert p to plain object
    const plugins = pl.convertToPlainObject();

    const dashboardDefinition: DashboardInterface = {
        layouts: {
            lg: [],
            md: [],
            sm: [],
            xs: [],
            xxs: []
        },
        widgets: new Map<string, Widget>()
    }

    return (
        <div className={styles.page}>
            <PluginsProvider pluginsLoader={plugins}>
                <DashboardProvider dashboardDefinition={dashboardDefinition}>
                    <Dashboard />
                    <WidgetsDialog />
                </DashboardProvider>
            </PluginsProvider>
        </div>
    );
}
