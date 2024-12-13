import styles from "./page.module.css";

import WidgetsDialog from "@/core/widgets/components/widgets-dialog/widgets-dialog";
import { DashboardProvider } from "@/core/dashboard/components/dashboard-provider";
import DashboardInterface from "@/core/dashboard/dashboard-interface";
import Dashboard from "@/core/dashboard/components/dashboard";
import { Widget } from "@/core/widgets/widget-interface";

import { Datasource } from "@/core/datasources/datasource-interface";
import { GlobalDataSourcesProvider } from "@/core/datasources/components/global-datasource-provider";
import { RandomDataSourceSettings } from "@/plugins/random-data-sources";
import { RosBridgeSuiteDataSourceSettings } from "@/plugins/random-data-sources/rosbridge-suite-source";

export default function Home() {

    const datasources = new Map<string, Datasource>();
    datasources.set('random-data-source', {
        datasource_id: 'random-data-source',
        title: 'Random Data Source',
        settings: {
            id: 'random-data-source',
            title: "Random Data Source",
            topics: [
                {
                    "topic": "/imu/vel/x",
                    frequency: 16
                },
                {
                    "topic": "/imu/vel/y",
                    frequency: 32
                },
                {
                    "topic": "/imu/vel/z",
                    frequency: 64
                }
            ]
        } as RandomDataSourceSettings
    });

    datasources.set('random-data-source-2', {
        datasource_id: 'imu-data-source',
        title: 'Random Data Source 2',
        settings: {
            id: 'random-data-source-2',
            title: "Random Data Source 2",
            topics: [
                {
                    "topic": "/camera/imu",
                    frequency: 60
                },
            ]
        } as RandomDataSourceSettings
    });

    datasources.set("local-rosbridge-suite", {
        datasource_id: "rosbridge-suite-source",
        title: "Local ROSBridge Suite",
        settings: {
            id: "local-rosbridge-suite",
            title: "Local ROSBridge Suite",
            url: "ws://localhost:9090",
            reconnectTimeout: 5
        } as RosBridgeSuiteDataSourceSettings
    });

    const dashboardDefinition: DashboardInterface = {
        layouts: {
            lg: [],
            md: [],
            sm: [],
            xs: [],
            xxs: []
        },
        widgets: new Map<string, Widget>(),
        datasources: datasources,
        locked: false
    }

    return (
        <div className={styles.page}>
            <GlobalDataSourcesProvider datasources={dashboardDefinition.datasources}>
                <DashboardProvider dashboardDefinition={dashboardDefinition}>
                    <Dashboard />
                    <WidgetsDialog />
                </DashboardProvider>
            </GlobalDataSourcesProvider>
        </div>
    );
}
