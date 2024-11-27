import { JsonSchema, UISchemaElement } from "@jsonforms/core";

interface DatasourceDefinition {
    id: string;
    name: string;
    description: string;

    titleProp?: string;

    schema: JsonSchema;
    uischema: UISchemaElement;
    data: any;

    Provider: (data:any) => JSX.Element;
}

interface Datasource{
    datasource_id : string;  // point to the widget definition
    title: string;      // title of the widget
    settings: any;      // settings of the widget
}


export type { DatasourceDefinition, Datasource };