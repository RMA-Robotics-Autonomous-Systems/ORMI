import { JsonSchema, UISchemaElement } from "@jsonforms/core";
import { JSX } from "react";
interface WidgetDefinition {
    id: string;
    name: string;
    description: string;
    icon?: JSX.Element;
    titleProp?: string;
    schema: JsonSchema;
    uischema: UISchemaElement;
    data: any;
    Component: (data: any) => JSX.Element;
}
interface Widget {
    widget_id: string;
    box_id: string;
    title: string;
    settings: any;
}
export type { WidgetDefinition, Widget };
