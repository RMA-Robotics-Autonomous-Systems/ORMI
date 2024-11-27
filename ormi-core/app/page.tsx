import styles from "./page.module.css";

import WidgetsDialog from "@/core/widgets/components/widgets-dialog/widgets-dialog";
import { DashboardProvider } from "@/core/dashboard/components/dashboard-provider";
import DashboardInterface from "@/core/dashboard/dashboard-interface";
import Dashboard from "@/core/dashboard/components/dashboard";
import { Widget } from "@/core/widgets/widget-interface";



export default function Home() {

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
            <DashboardProvider dashboardDefinition={dashboardDefinition}>
                <Dashboard />
                <WidgetsDialog />
            </DashboardProvider>
        </div>
    );
}
