import { LocalDataSourcesProvider, useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";
import { DatasourceTopic, DatasourceTopicFilter, SelectedTopic } from "@/core/datasources/datasource-interface";
import { AsyncTopicControlType } from "@/core/jsonforms/controls/topic-selector/topic-selector";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { cond } from "lodash";
import { CircleAlertIcon } from "lucide-react";
import { TypeAnimation } from 'react-type-animation';

interface ConditionStatusIndicatorProps {
    title: string;
    topic: SelectedTopic;
    status: {
        name: string;
        color: string;
        condition: string;
        value: number;
    }[];
}

function ConditionStatusIndicator(props: ConditionStatusIndicatorProps) {

    const { sources } = useLocalDataSource();

    const sources_keys = Array.from(sources.keys());
    const value = sources_keys.length > 0 ? sources.get(sources_keys[0])!.data[0] : 0;

    // Convert boolean to number if needed, or keep integer value
    const parsedValue = typeof value === 'boolean' ? (value ? 1 : 0) : typeof value === 'number' ? value : parseInt(value);

    // find the first status that match the condition
    const status = props.status.find((status) => {
        switch (status.condition) {
            case '==':
                return parsedValue === status.value;
            case '!=':
                return parsedValue !== status.value;
            case '>':
                return parsedValue > status.value;
            case '<':
                return parsedValue < status.value;
            case '>=':
                return parsedValue >= status.value;
            case '<=':
                return parsedValue <= status.value;
            default:
                return false;
        }
    }) || { name: 'Undefined', color: 'gray' };


    return (
        <div style={{
            backgroundColor: status.color,
            color: 'white',
            height: "100%",
            width: "100%",
            display: "grid",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "xxx-large",
            transition: "all 0.5s ease"
        }}>
            <TypeAnimation speed={75} cursor={false} key={status.name} sequence={[status.name]} repeat={1} />
        </div>
    )
}

export function CondStatusIndicatorDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'cond-status-indicator',
        name: 'Conditional Status',
        description: 'Display a status based on an number value and a condition',
        titleProp: 'title',

        icon: <CircleAlertIcon />,

        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    "type": "object",
                    "title": "Topic",
                },
                status: {
                    "type": "array",
                    "title": "Status",
                    "items": {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                title: 'Name'
                            },
                            color: {
                                type: 'string',
                                title: 'Color'
                            },
                            condition: {
                                type: 'string',
                                title: 'Condition',
                                oneOf: [
                                    {
                                        title: 'Equal',
                                        const: '=='
                                    },
                                    {
                                        title: 'Not Equal',
                                        const: '!='
                                    },
                                    {
                                        title: 'Greater Than',
                                        const: '>'
                                    },
                                    {
                                        title: 'Less Than',
                                        const: '<'
                                    },
                                    {
                                        title: 'Greater Than or Equal',
                                        const: '>='
                                    },
                                    {
                                        title: 'Less Than or Equal',
                                        const: '<='
                                    },
                                ]
                            },
                            value: {
                                type: 'number',
                                title: 'Value'
                            }
                        }
                    }
                }
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                } as ControlElement,
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                    options: {
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /number|boolean/ }));
                        },
                        buffer: 1,
                    }
                } as AsyncTopicControlType,
                {
                    type: "Control",
                    scope: "#/properties/status",
                    options: {
                        detail: {
                            type: "VerticalLayout",
                            elements: [
                                {
                                    type: "Control",
                                    scope: "#/properties/name"
                                } as ControlElement,
                                {
                                    type: "Control",
                                    scope: "#/properties/color",
                                    options: {
                                        color: true,
                                    }
                                } as ControlElement,
                                {
                                    type: "Control",
                                    scope: "#/properties/condition"
                                } as ControlElement,
                                {
                                    type: "Control",
                                    scope: "#/properties/value"
                                } as ControlElement
                            ]
                        }
                    }
                } as ControlElement


            ]
        } as VerticalLayout,
        data: {
            title: 'Status',
            use3D: false,
        },
        Component: (data: ConditionStatusIndicatorProps) => (

            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1} >
                <ConditionStatusIndicator {...data} />
            </LocalDataSourcesProvider>

        )
    }
};