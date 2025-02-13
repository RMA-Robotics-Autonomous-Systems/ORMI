import { JsonSchema, UISchemaElement } from "@jsonforms/core";

import { ReactNode, FC } from "react";

interface DatasourceDefinition<T = DatasourceProviderSettings> {
    id: string;
    name: string;
    description: string;

    titleProp?: string;

    schema: JsonSchema;
    uischema?: UISchemaElement;
    data: T;

    Provider: FC<{
        children: ReactNode;
        props: T;
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
    type: string;           // type of the data inside the webapp
    rawType: string;        // type of the data inside the datasource
    bufferSize?: number;
}

interface SelectedTopic extends DatasourceTopic {
    property: string;
}

interface DatasourceProviderSettings {
    id: string;
    title: string;
    enable: boolean;
}

export type { DatasourceDefinition, Datasource, DatasourceTopic, DatasourceProviderSettings,SelectedTopic };