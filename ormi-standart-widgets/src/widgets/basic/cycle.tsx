import { useEffect, useState, useRef, useCallback } from "react"; // Import useCallback
import { keyStyles as style, KeyControlType } from "ormi-components";

import { RefreshCcwDot } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { DigitalInput, DigitalComponent } from "ormi-components";
import { AsyncTopicControlType } from "ormi-core/jsonforms";
import { DatasourceTopic, DatasourceTopicFilter, SelectedTopic, PublisherDataSourcesProvider, usePublisherDataSource } from "ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "ormi-core/plugins";
import { toast } from "ormi-components";

interface CycleControlData {
    title: string;
    keyInput: DigitalInput;
    topic: SelectedTopic;
    values: {
        title: string;
        value: number;
    }[],
    loopCycle: boolean;
    publishOnLoop: boolean;
    publicationFrequency: number;
}

export function CycleControl(props: CycleControlData) {

    const { publishers } = usePublisherDataSource();
    const [cycle, setCycle] = useState<number>(0); // index of the current value
    const [direction, setDirection] = useState<1 | -1>(1); // 1 for forward, -1 for backward

    const handlecycle = () => {
        if (props.loopCycle) {
            // Loop through values
            setCycle((prevCycle) => (prevCycle + 1) % props.values.length);
        } else {
            // Switch direction when reaching the end
            const nextCycle = cycle + direction;
            if (nextCycle >= props.values.length - 1) {
                setDirection(-1);
                setCycle(props.values.length - 1);
            } else if (nextCycle <= 0) {
                setDirection(1);
                setCycle(0);
            } else {
                setCycle(nextCycle);
            }
        }
    }

    useEffect(() => {
        const publish_freq = props.publicationFrequency || 30;
        const publish_period_ms = 1000 / publish_freq;
        const selectedTopic = props.topic;

        if (!selectedTopic?.topic) {
            console.warn("CycleControl: Topic not selected.");
            return;
        }

        const publisher = publishers.get(selectedTopic.topic);

        if (!publisher) {
            const timer = setTimeout(() => {
                if (!publishers.get(selectedTopic.topic)) {
                    toast("Error: Publisher not found for topic " + selectedTopic.topic);
                }
            }, 1000);
            return () => clearTimeout(timer);
        }

        const cycleFunction = () => {
            if (props.values && props.values.length > 0 && cycle < props.values.length) {
                // Convert the value to boolean if the topic type is boolean
                const value = props.topic.type === "boolean"
                    ? Boolean(props.values[cycle].value)
                    : props.values[cycle].value;
                publisher.publish(value, props.topic.type || "number");
            }
        }

        // Only set up interval if publishOnLoop is true
        let publishInterval: number | null | NodeJS.Timeout = null;
        if (props.publishOnLoop) {
            publishInterval = setInterval(cycleFunction, publish_period_ms);
        } else {
            // Publish once when cycle changes
            cycleFunction();
        }

        return () => {
            if (publishInterval) {
                clearInterval(publishInterval);
            }
        };
    }, [props.topic, props.publicationFrequency, publishers, cycle, props.values, props.publishOnLoop]);

    return (
        <div className="flex flex-col justify-center items-center p-4 h-full gap-3">
            <div style={{ display: "none" }}>
                <DigitalComponent digitalInput={props.keyInput} onActive={handlecycle} onInactive={() => { }} />
            </div>

            <div className="flex flex-col items-center gap-2">
                <div
                    onClick={handlecycle}
                    style={{ width: '12rem' }}
                    className={`${style.key} `}
                >
                    <div className="flex justify-between items-center w-full">
                        <span className="font-bold">{props.values[cycle].title}</span>
                    </div>
                    <div className="flex justify-center mt-2">
                        <RefreshCcwDot />
                    </div>
                </div>
            </div>

        </div>
    );
}

export function CycleControlDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'cycle-cmd-vel-widget',
        name: 'Cycle control',
        description: 'Allow user to cycle a topic',
        titleProp: 'title',
        icon: <RefreshCcwDot />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                keyInput: {
                    type: 'object',
                    title: 'Cycle Key',
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                values: {
                    type: 'array',
                    title: 'Value On',
                    items: {
                        type: 'object',
                        properties: {
                            title: {
                                type: 'string',
                                title: 'Title'
                            },
                            value: {
                                type: 'number',
                                title: 'Value'
                            }
                        }
                    }
                },
                loopCycle: {    // If set to true, we loop through the values, if set to false, we switch direction
                    type: 'boolean',
                    title: 'Loop Cycle',
                    default: true,
                },
                publishOnLoop: {    //If set to false, we publish 1 value, if set to true, we keep publishing the value
                    type: 'boolean',
                    title: 'Loop publish',
                    default: false
                },
                publicationFrequency: {
                    type: 'number',
                    title: 'Publication Frequency (Hz)',
                    default: 30,
                    minimum: 1,
                }
            },
            required: ['title', 'topic', 'keyInput', 'values']
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
                    scope: "#/properties/values",
                    options: {
                        detail: true,
                        add: true,
                        remove: true,
                        orderable: true,
                    }
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/loopCycle",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/publishOnLoop",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/publicationFrequency",
                } as ControlElement,

            ],
        } as VerticalLayout,
        data: {
            title: 'Cycle Control',

        },
        Component: (data: CycleControlData) => (
            data.topic ? (
                <PublisherDataSourcesProvider SelectedTopics={[data.topic]}>
                    <CycleControl {...data} />
                </PublisherDataSourcesProvider>
            ) : (
                <div className="flex justify-center items-center h-full text-muted-foreground">
                    Please select a topic in the widget configuration.
                </div>
            )
        )
    }
}