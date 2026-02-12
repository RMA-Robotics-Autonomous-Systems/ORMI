import { Widget } from "../widgets";
import { Datasource } from "../datasources";

/** Supported template types. */
export type TemplateType = "widget" | "datasource";

/** Common template fields. */
export interface BaseTemplate {
	name: string;
	public: boolean;
	tags: string[];
	yours: boolean;
	type: TemplateType;
}

/** Widget template definition. */
export interface WidgetTemplate extends BaseTemplate {
	type: "widget";
	widget: Widget;
}

/** Datasource template definition. */
export interface DatasourceTemplate extends BaseTemplate {
	type: "datasource";
	datasource: Datasource;
}

/** Template union type. */
export type Template = WidgetTemplate | DatasourceTemplate;
