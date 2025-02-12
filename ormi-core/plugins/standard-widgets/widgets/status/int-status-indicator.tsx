import { Spinner } from "@/components/spinner";
import { LocalDataSourcesProvider, useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";
import { DatasourceTopic, SelectedTopic } from "@/core/datasources/datasource-interface";
import { AsyncTopicControlType } from "@/core/jsonforms/controls/topic-selector/topic-selector";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { CircleAlertIcon, CircleIcon } from "lucide-react";
import { TypeAnimation } from 'react-type-animation';

interface IntStatusIndicatorProps {
    title: string;
    topic: SelectedTopic;
    status: {
        name: string;
        color: string;
    }[];
}

function IntStatusIndicator(props: IntStatusIndicatorProps) {

    const { sources } = useLocalDataSource();

    const sources_keys = Array.from(sources.keys());
    const value = sources_keys.length > 0 ? sources.get(sources_keys[0])!.data[0] : 0;

    // Convert boolean to number if needed, or keep integer value
    const parsedValue = typeof value === 'boolean' ? (value ? 1 : 0) : typeof value === 'number' ? value : parseInt(value);
    // display the status based on the value and the props.status index
    // if the value is 0, the status is the first element of the array
    // if the value is 1, the status is the second element of the array

    // if the value is greater than the length of the array, the status is undifined

    const statu = props.status[parsedValue] || { name: 'Undefined', color: 'gray' };

    return (
        <div style={{
            backgroundColor: statu.color,
            color: 'white',
            height: "100%",
            width: "100%",
            display: "grid",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "xxx-large",
            transition: "all 0.5s ease"
        }}>
            <TypeAnimation speed={75} cursor={false} key={statu.name} sequence={[statu.name]} repeat={1} />
        </div>
    )
}

export function IntStatusIndicatorDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'int-status-indicator',
        name: 'Status indicator',
        description: 'Display a status based on an Integer value',
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
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'gps');
                        },
                        buffer: 1,
                        propertyType: "gps"
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
        Component: (data: IntStatusIndicatorProps) => (

            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1} >
                <IntStatusIndicator {...data} />
            </LocalDataSourcesProvider>

        )
    }
};