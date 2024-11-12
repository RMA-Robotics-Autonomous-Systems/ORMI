import { JsonSchema, UISchemaElement } from "@jsonforms/core";

interface WidgetDefinition {
    id: string;
    name: string;
    description: string;
    image: string;


    titleProp?: string;

    schema: JsonSchema;
    uischema: UISchemaElement;
    data: any;

    Component: (data:any) => JSX.Element;
}

interface Widget{
    widget_id: string;  // point to the widget definition
    box_id: string;     // unique id for the widget, used to identify the widget in the layout
    title: string;      // title of the widget
    settings: any;      // settings of the widget
}


export type { WidgetDefinition, Widget };