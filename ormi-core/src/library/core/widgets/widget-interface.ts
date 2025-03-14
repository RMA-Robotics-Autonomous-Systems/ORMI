import { JsonSchema, UISchemaElement } from "@jsonforms/core";
import { JSX } from "react";

interface WidgetDefinition {
    id: string;             // Id of the widgets, allow the dashboard to find which widgets is what component
    name: string;           // name of the widget in the widget list
    description: string;    // description of the widget
    icon?: JSX.Element;       // icon of the widget
  
    titleProp?: string; // A widget has multiple properties that are defined in the "schema" props, this allow the dashboard to find the property with the title
  
    //https://jsonforms.io/
    schema: JsonSchema;         // a schema that describe the properties of the widget
    uischema: UISchemaElement;  // describe how to display the properties in the settings section of the widgets
    data: any;                  // default value of the widgets
  
    // component that will be put inside of the widget (the widget itself)
    Component: (data: any) => JSX.Element;
  }

interface Widget{
    widget_id: string;  // point to the widget definition
    box_id: string;     // unique id for the widget, used to identify the widget in the layout
    title: string;      // title of the widget
    settings: any;      // settings of the widget
}

export type { WidgetDefinition, Widget };