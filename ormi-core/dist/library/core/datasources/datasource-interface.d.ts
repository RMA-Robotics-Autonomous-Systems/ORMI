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
    }>;
}
interface Datasource {
    datasource_id: string;
    title: string;
    settings: DatasourceProviderSettings;
}
interface DatasourceTopic {
    topic: string;
    datasource_id: string;
    source: DatasourceProviderSettings;
    type: string;
    rawType: string;
    bufferSize?: number;
}
interface SelectedTopic extends DatasourceTopic {
    property: string;
}
interface DatasourceTopicFilterProps {
    name?: RegExp;
    type?: RegExp;
    source_id?: RegExp;
}
declare class DatasourceTopicFilter {
    name?: RegExp;
    type?: RegExp;
    source_id?: RegExp;
    constructor(props: DatasourceTopicFilterProps);
    filter(topic: DatasourceTopic): boolean;
}
interface DatasourceProviderSettings {
    id: string;
    title: string;
    enable: boolean;
}
export { DatasourceTopicFilter };
export type { DatasourceDefinition, Datasource, DatasourceTopic, DatasourceProviderSettings, SelectedTopic };
