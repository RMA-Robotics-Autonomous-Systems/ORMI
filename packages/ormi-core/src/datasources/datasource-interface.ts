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
    datasource_id: string;
    source: DatasourceProviderSettings;
    type: string;           // type of the data inside the webapp
    rawType: string;        // type of the data inside the datasource
    bufferSize?: number;
}

interface SelectedTopic extends DatasourceTopic {
    property: string;
}


interface DatasourceTopicFilterProps{
    name?: RegExp;      
    type?: RegExp;
    rawType?: RegExp;
    source_id?: RegExp;
    strict?: boolean; // if true, the filter returns true only if all properties match
}

// the filter works by using regexes on the name and type of the topic
class DatasourceTopicFilter {
    name?: RegExp;      
    type?: RegExp;
    source_id?: RegExp;
    rawType?: RegExp;
    strict?: boolean;

    constructor(props: DatasourceTopicFilterProps) {
        this.name = props.name;
        this.type = props.type;
        this.source_id = props.source_id
        this.rawType = props.rawType;
        this.strict = props.strict || false; // if true, the filter returns true only if
    }

    filter(topic: DatasourceTopic) : boolean {


        const matches = [];

        if(this.name && !this.name.test(topic.topic)){
            matches.push(false);
        }

        if(this.type && !this.type.test(topic.type)){
            matches.push(false);
        }

        if(this.source_id && !this.source_id.test(topic.datasource_id)){
            matches.push(false);
        }

        if(this.rawType && !this.rawType.test(topic.rawType)){
            matches.push(false);
        }

        if(this.strict && matches.length > 0){
            return false;
        }

        return true;
    }
}

interface DatasourceProviderSettings {
    id: string;
    title: string;
    enable: boolean;
}

export { DatasourceTopicFilter };
export type { DatasourceDefinition, Datasource, DatasourceTopic, DatasourceProviderSettings,SelectedTopic };