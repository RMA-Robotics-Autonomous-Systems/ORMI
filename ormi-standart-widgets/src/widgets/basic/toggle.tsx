import { useEffect, useState, useRef, useCallback } from "react"; // Import useCallback
import { style } from "ormi-core/jsonforms";
import { GaugeIcon, KeyboardIcon, LockIcon, ToggleLeftIcon, ToggleRightIcon, UnlockIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { DigitalInput, DigitalComponent } from "ormi-core/components";
import { AsyncTopicControlType, KeyControlType } from "ormi-core/jsonforms";
import { DatasourceTopic, DatasourceTopicFilter, SelectedTopic, PublisherDataSourcesProvider, usePublisherDataSource } from "ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "ormi-core/plugins";
import { Movement } from "ormi-core/types";
import { toast } from "ormi-core/components";

interface ToggleControlData {
    title: string;
    keyInput: DigitalInput;
    topic: SelectedTopic;
    valueOn: number;
    valueOff: number;
    publishOnOff: boolean;
    publicationFrequency: number;
}

export function ToggleControl(props: ToggleControlData) {

    const { publishers } = usePublisherDataSource();

    const [toggle, setToggle] = useState(false);

    const handletoggle = () => {
        setToggle(!toggle);
    }

    useEffect(() => {
        const publish_freq = props.publicationFrequency || 30;
        const publish_period_ms = 1000 / publish_freq;
        const selectedTopic = props.topic;

        if (!selectedTopic?.topic) {
            console.warn("ToggleControl: Topic not selected.");
            return;
        }

        const publisher = publishers.get(selectedTopic.topic);

        if (!publisher) {
            const timer = setTimeout(() => {
                if (!publishers.get(selectedTopic.topic)) {
                    toast({
                        title: 'Error',
                        description: `Publisher for topic ${selectedTopic.topic} not found`,
                        variant: 'destructive',
                    });
                }
            }, 1000);
            return () => clearTimeout(timer);
        }

        const toggleFunction = () => {

            if (toggle) {
                publisher.publish(props.valueOn, props.topic.type || "number");
            } else {
                if (props.publishOnOff) {
                    publisher.publish(props.valueOff, props.topic.type || "number");
                }
            }
        }

        const publishInterval = setInterval(toggleFunction, publish_period_ms);

        return () => {
            clearInterval(publishInterval);
        };
    }, [props.topic, props.publicationFrequency, publishers, toggle, props.valueOn, props.valueOff, props.publishOnOff]);

    return (
        <div className="flex flex-col justify-center items-center p-4 h-full gap-3">
            <div style={{ display: "none" }}>
                <DigitalComponent digitalInput={props.keyInput} onActive={handletoggle} onInactive={() => { }} />
            </div>
            {/* Grid layout for movement controls */}
            <div data-active={toggle} style={{ width: '10rem' }} className={style.key}>
                <span onClick={handletoggle} style={{ display: "flex", justifyContent: "space-evenly", width: "100%" }}>
                    {toggle ? <ToggleRightIcon /> : <ToggleLeftIcon />}
                </span>
            </div>
        </div>
    );
}

export function ToggleControlDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'toggle-cmd-vel-widget',
        name: 'Toggle control',
        description: 'Allow user to toggle a topic',
        titleProp: 'title',
        icon: <ToggleRightIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                keyInput: {
                    type: 'object',
                    title: 'Toggle Key',
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                valueOn: {
                    type: 'number',
                    title: 'Value On',
                    default: '1'
                },
                valueOff: {
                    type: 'number',
                    title: 'Value Off',
                    default: '0'
                },
                publishOnOff: {
                    type: 'boolean',
                    title: 'Publish when toggle is Off',
                    default: false
                },
                publicationFrequency: {
                    type: 'number',
                    title: 'Publication Frequency (Hz)',
                    default: 30,
                    minimum: 1,
                }
            },
            required: ['title', 'topic', 'keyInput', 'valueOn', 'valueOff']
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
                        canSelectProperty: true,

                    }
                } as AsyncTopicControlType,
                {
                    type: "Control",
                    scope: "#/properties/valueOn",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/valueOff",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/publishOnOff",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/publicationFrequency",
                } as ControlElement
            ],
        } as VerticalLayout,
        data: {
            title: 'Toggle Control',

        },
        Component: (data: ToggleControlData) => (
            data.topic ? (
                <PublisherDataSourcesProvider SelectedTopics={[data.topic]}>
                    <ToggleControl {...data} />
                </PublisherDataSourcesProvider>
            ) : (
                <div className="flex justify-center items-center h-full text-muted-foreground">
                    Please select a topic in the widget configuration.
                </div>
            )
        )
    }
}