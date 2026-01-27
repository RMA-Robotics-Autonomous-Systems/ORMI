import { Widget } from "../widgets";
import { Datasource } from "../datasources";

export type TemplateType = "widget" | "datasource";

export interface BaseTemplate {
  name: string;
  public: boolean;
  tags: string[];
  yours: boolean;
  type: TemplateType;
}

export interface WidgetTemplate extends BaseTemplate {
  type: "widget";
  widget: Widget;
}

export interface DatasourceTemplate extends BaseTemplate {
  type: "datasource";
  datasource: Datasource;
}

export type Template = WidgetTemplate | DatasourceTemplate;
