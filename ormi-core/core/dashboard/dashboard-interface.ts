import { Layouts } from "react-grid-layout";
import { Widget } from "../widgets/widget-interface";




interface DashboardInterface {

    layouts: Layouts;  // Represent the layout of the dashboard per Breakpoint

    widgets: Map<string, Widget>;  // Represent the widgets in the dashboard

}


export default DashboardInterface;