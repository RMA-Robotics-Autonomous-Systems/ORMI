import { JsonSchema, UISchemaElement } from "@jsonforms/core";

import { ReactNode, FC } from "react";

interface DatasourceDefinition {
    id: string;
    name: string;
    description: string;

    titleProp?: string;

    schema: JsonSchema;
    uischema: UISchemaElement;
    data: any;

    Provider: FC<{
        children: ReactNode;
        props: any;
    }>
}

interface Datasource{
    datasource_id : string;  // point to the widget definition
    title: string;      // title of the widget
    settings: DatasourceProviderSettings;      // settings of the widget
}

interface DatasourceTopic {
    topic: string;
    source: DatasourceProviderSettings;
    type: string;

    subscribeHook?: string;
    unsubscribeHook?: string;
    pubshlishHook?: string;
    definitionHook?: string;
}

interface DatasourceProviderSettings {
    id: string;
    title: string;
}

export type { DatasourceDefinition, Datasource, DatasourceTopic, DatasourceProviderSettings };