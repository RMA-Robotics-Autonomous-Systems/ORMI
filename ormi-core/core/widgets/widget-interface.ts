import { JsonSchema, UISchemaElement } from "@jsonforms/core";

interface WidgetDefinition {
    id: string;
    name: string;
    description: string;
    image: string;


    schema: JsonSchema;
    uischema: UISchemaElement;
    data: any;


    Component: (data:any) => JSX.Element;
}


export default WidgetDefinition;