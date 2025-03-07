import { Layouts } from "react-grid-layout";
import { Widget } from "../widgets/widget-interface";
import { Datasource } from "../datasources/datasource-interface";




interface DashboardInterface {

    layouts: Layouts;  // Represent the layout of the dashboard per Breakpoint

    widgets: Map<string, Widget>;  // Represent the widgets in the dashboard

    datasources : Map<string, Datasource>;  // Represent the datasources in the dashboard

    locked: boolean;  // Represent if the dashboard is locked or not
}


export type { DashboardInterface };