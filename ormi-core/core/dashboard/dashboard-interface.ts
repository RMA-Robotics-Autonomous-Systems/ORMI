import { Layouts } from "react-grid-layout";




interface DashboardInterface {

    layouts: Layouts;  // Represent the layout of the dashboard per Breakpoint

    widgets: Map<string, any>;  // Represent the widgets in the dashboard

}


export default DashboardInterface;