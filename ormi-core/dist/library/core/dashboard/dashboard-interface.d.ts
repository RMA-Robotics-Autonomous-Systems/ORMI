import { Layouts } from "react-grid-layout";
import { Widget } from "../widgets/widget-interface";
import { Datasource } from "../datasources/datasource-interface";
interface DashboardInterface {
    layouts: Layouts;
    widgets: Map<string, Widget>;
    datasources: Map<string, Datasource>;
    locked: boolean;
}
export type { DashboardInterface };
