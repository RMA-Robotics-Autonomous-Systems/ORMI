import { Widget } from "../widgets/widget-interface";
import { Datasource } from "../datasources/datasource-interface";

/** Dashboard state including layout, widgets, and datasources. */
interface DashboardInterface {
	/** Generic layout storage for multiple layout systems (react-grid-layout, rc-dock, etc.). */
	layouts: Record<string, any>;

	/** Widgets currently in the dashboard. */
	widgets: Map<string, Widget>;

	/** Datasources available to the dashboard. */
	datasources: Map<string, Datasource>;

	/** Whether the dashboard is locked. */
	locked: boolean;
}

export type { DashboardInterface };
