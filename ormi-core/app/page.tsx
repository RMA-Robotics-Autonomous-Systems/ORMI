import PluginsLoader from "@/core/plugins/plugins-loader";
import styles from "./page.module.css";

import { PluginsProvider } from "@/core/plugins/components/plugins-provider";
import WidgetsDialog from "@/core/widgets/components/widgets-dialog/widgets-dialog";
import { DashboardProvider } from "@/core/dashboard/components/dashboard-provider";
import DashboardInterface from "@/core/dashboard/dashboard-interface";
import Dashboard from "@/core/dashboard/components/dashboard";
import { Widget } from "@/core/widgets/widget-interface";
import NavBar from "@/components/advanced/navbar/navbar";
import { NavbarProvider } from "@/components/advanced/navbar/navbar-provider";




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
                <NavbarProvider>
                    <DashboardProvider dashboardDefinition={dashboardDefinition}>
                        <NavBar />
                        <Dashboard />
                        <WidgetsDialog />
                    </DashboardProvider>
                </NavbarProvider>
            </PluginsProvider>
        </div>
    );
}
