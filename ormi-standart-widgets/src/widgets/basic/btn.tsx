import { useEffect, useState, useRef, useCallback } from "react"; // Import useCallback
import { style } from "ormi-core/jsonforms";
import { ConciergeBellIcon, GaugeIcon, KeyboardIcon, LockIcon, ToggleLeftIcon, ToggleRightIcon, UnlockIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { DigitalInput, DigitalComponent } from "ormi-components";
import { AsyncTopicControlType, KeyControlType } from "ormi-core/jsonforms";
import { DatasourceTopic, DatasourceTopicFilter, SelectedTopic, PublisherDataSourcesProvider, usePublisherDataSource } from "ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "ormi-core/plugins";
import { Movement } from "ormi-core/types";
import { toast } from "ormi-components";

interface BtnControlData {
    title: string;
    keyInput: DigitalInput;
    topic: SelectedTopic;
    value: number;
}

export function BtnControl(props: BtnControlData) {

    const { publishers } = usePublisherDataSource();


    const handletoggle = () => {
        const publisher = publishers.get(props.topic.topic);
        if (!publisher) {
            toast({
                title: 'Error',
                description: `Publisher for topic ${props.topic.topic} not found`,
                variant: 'destructive',
            });
            return;
        }

        if (props.topic.type === "boolean") {
            publisher.publish(Boolean(props.value), "boolean");
        } else {
            publisher.publish(props.value, props.topic.type || "number");
        }
    }

    return (
        <div className="flex flex-col justify-center items-center p-4 h-full gap-3">
            <DigitalComponent digitalInput={props.keyInput} onActive={handletoggle} onInactive={() => { }} />
        </div>
    );
}

export function BtnControlDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'btn-cmd-vel-widget',
        name: 'Btn control',
        description: 'Allow user to toggle a topic',
        titleProp: 'title',
        icon: <ConciergeBellIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                keyInput: {
                    type: 'object',
                    title: 'Btn Key',
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                value: {
                    type: 'number',
                    title: 'Value On',
                    default: '1'
                },
            },
            required: ['title', 'topic', 'keyInput', 'value']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                } as ControlElement,
                {
                    type: "Key",
                    scope: "#/properties/keyInput",
                } as KeyControlType,
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                    options: {
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /number|boolean/ }));
                        },
                        buffer: 1,
                        canSelectProperty: false,
                    }
                } as AsyncTopicControlType,
                {
                    type: "Control",
                    scope: "#/properties/value",
                } as ControlElement,
            ],
        } as VerticalLayout,
        data: {
            title: 'Btn Control',

        },
        Component: (data: BtnControlData) => (
            data.topic ? (
                <PublisherDataSourcesProvider SelectedTopics={[data.topic]}>
                    <BtnControl {...data} />
                </PublisherDataSourcesProvider>
            ) : (
                <div className="flex justify-center items-center h-full text-muted-foreground">
                    Please select a topic in the widget configuration.
                </div>
            )
        )
    }
}