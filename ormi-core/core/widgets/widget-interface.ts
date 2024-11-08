import { JsonSchema, UISchemaElement } from "@jsonforms/core";

interface WidgetDefinition {
    id: string;
    name: string;
    description: string;
    image: string;


    schema: JsonSchema;
    uischema: UISchemaElement;
    data: object;


    Component: (data:object) => JSX.Element;
}


export default WidgetDefinition;