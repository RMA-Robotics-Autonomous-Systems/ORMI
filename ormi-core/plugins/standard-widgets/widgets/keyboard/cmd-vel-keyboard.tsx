import { useEffect, useState } from "react";
import style from "@/core/jsonforms/controls/key/key.module.css";
import { KeyboardIcon, LockIcon, UnlockIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { AsyncTopicControlType } from "@/core/jsonforms/controls/topic-selector/topic-selector";
import { DatasourceTopic, SelectedTopic } from "@/core/datasources/datasource-interface";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { KeyControlType } from "@/core/jsonforms/controls/key/key";
import { Movement } from "@/core/types/movement";
import { PublisherDataSourcesProvider, usePublisherDataSource } from "@/core/datasources/components/publisher-datasource-provider";
import { toast } from "@/hooks/use-toast";
import { buffer } from "stream/consumers";

interface KeyboardControlData {
    title: string;
    forward: string;
    backward: string;
    left: string;
    right: string;
    startingSpeed: number;
    incSpeed: string;
    decSpeed: string;
    unlock: string;
    unlocktoggle: boolean;
    topic: SelectedTopic;
    publicationFrequency: number;
}

export function KeyBoardControl(props: KeyboardControlData) {

    const [forward, setForward] = useState<boolean>(false);
    const [backward, setBackward] = useState<boolean>(false);
    const [left, setLeft] = useState<boolean>(false);
    const [right, setRight] = useState<boolean>(false);
    const [speed, setSpeed] = useState<number>(props.startingSpeed);
    const [unlock, setUnlock] = useState<boolean>(false);
    const [speedkeyInc, setSpeedKeyInc] = useState<boolean>(false);
    const [speedkeyDec, setSpeedKeyDec] = useState<boolean>(false);

    const { publishers } = usePublisherDataSource();

    useEffect(() => {

        const publish_freq = props.publicationFrequency || 30; // default to 30Hz
        const publish_period_ms = 1000 / publish_freq;
        const selectedTopic = props.topic;
        const publisher = publishers.get(selectedTopic.topic);

        if (!publisher) {
            toast({
                title: 'Error',
                description: `Publisher for topic ${props.topic} not found`,
                variant: 'destructive',
            })
        }

        const swtichToggle = (press: boolean) => {
            if (props.unlocktoggle && press) {
                setUnlock((prev) => { return !prev });
            } else if (!props.unlocktoggle) {
                setUnlock(press);
            }
        }

        const keyPressEvent = (event: KeyboardEvent) => {

            if (event.key.toLowerCase() === props.forward.toLowerCase()) {
                setForward(true);
            }

            if (event.key.toLowerCase() === props.backward.toLowerCase()) {
                setBackward(true);
            }

            if (event.key.toLowerCase() === props.left.toLowerCase()) {
                setLeft(true);
            }

            if (event.key.toLowerCase() === props.right.toLowerCase()) {
                setRight(true);
            }

            if (event.key.toLowerCase() === props.incSpeed.toLowerCase()) {
                setSpeed((prev) => { return prev + 10 });
                setSpeedKeyInc(true);
            }

            if (event.key.toLowerCase() === props.decSpeed.toLowerCase()) {
                setSpeed((prev) => {
                    if (prev - 10 < 0) {
                        return 0;
                    }
                    return prev - 10;
                });
                setSpeedKeyDec(true);
            }

            if (event.key.toLowerCase() === props.unlock.toLowerCase()) {
                swtichToggle(true);
            }

        };

        const KeyUpEvent = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() === props.forward.toLowerCase()) {
                setForward(false);
            }

            if (event.key.toLowerCase() === props.backward.toLowerCase()) {
                setBackward(false);
            }

            if (event.key.toLowerCase() === props.left.toLowerCase()) {
                setLeft(false);
            }

            if (event.key.toLowerCase() === props.right.toLowerCase()) {
                setRight(false);
            }

            if (event.key.toLowerCase() === props.unlock.toLowerCase()) {
                swtichToggle(false);
            }

            if (event.key.toLowerCase() === props.incSpeed.toLowerCase()) {
                setSpeedKeyInc(false);
            }

            if (event.key.toLowerCase() === props.decSpeed.toLowerCase()) {
                setSpeedKeyDec(false);
            }
        }

        const movementFunction = () => {
            // only do anything if the keyboard is unlock (we don't want to move de robot by accident)
            if (!unlock) {
                return;
            }

            const movement = {

                linear: {
                    x: 0,
                    y: 0,
                    z: 0
                },

                angular: {
                    x: 0,
                    y: 0,
                    z: 0
                }

            } as Movement


            if (forward) {
                movement.linear.x += speed / 100;
            }

            if (backward) {
                movement.linear.x -= speed / 100;
            }

            if (left) {
                movement.angular.z += speed / 100;
            }

            if (right) {
                movement.angular.z -= speed / 100;
            }

            if (right || left || forward || backward) {
                publisher!.publish(movement, "Movement");
            }
        }


        const publishInterval = setInterval(movementFunction, publish_period_ms);


        document.addEventListener('keydown', keyPressEvent);
        document.addEventListener('keyup', KeyUpEvent);

        return () => {
            clearInterval(publishInterval);
            document.removeEventListener('keydown', keyPressEvent);
            document.removeEventListener('keyup', KeyUpEvent);
        }

    }, [props, publishers, forward, backward, left, right, speed, unlock, speedkeyInc, speedkeyDec]);

    return (
        <div className="flex justify-center items-center" style={{ padding: "1rem", height: "100%" }}>
            <div className="gap-3" style={{ width: "100%", height: "100%", gap: "1rem", gridTemplateColumns: "1fr 1fr 1fr", display: "grid", gridTemplateRows: "1fr 1fr" }}>
                <span data-active={unlock} className={style.key}> {!unlock && <LockIcon /> || unlock && <UnlockIcon />}</span>
                <span data-active={forward} className={style.key}>Z</span>
                <span data-active={speedkeyInc || speedkeyDec} className={style.key} > {speed}% </span>
                <span data-active={left} className={style.key}>Q</span>
                <span data-active={backward} className={style.key}>S</span>
                <span data-active={right} className={style.key}>D</span>
            </div>
        </div>
    );
}

export function KeyboardControlDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'keyboard-cmd-vel-widget',
        name: 'Keyboard control',
        description: 'Allow user to control the robot with the keyboard',
        titleProp: 'title',
        icon: <KeyboardIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                forward: {
                    type: 'string',
                    title: 'Forward'
                },
                backward: {
                    type: 'string',
                    title: 'Backward'
                },
                left: {
                    type: 'string',
                    title: 'Left'
                },
                right: {
                    type: 'string',
                    title: 'Right'
                },
                startingSpeed: {
                    type: 'number',
                    title: 'Starting Speed',
                    default: 50
                },
                incSpeed: {
                    type: 'string',
                    title: 'Increase Speed'
                },
                decSpeed: {
                    type: 'string',
                    title: 'Decrease Speed'
                },
                unlock: {
                    type: 'string',
                    title: 'Unlock'
                },
                unlocktoggle: {
                    type: 'boolean',
                    title: 'Unlock Toggle'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                publicationFrequency: {
                    type: 'number',
                    title: 'Publication Frequency (Hz)',
                    default: 30
                }
            },
            required: ['title', 'topic']
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
                    scope: "#/properties/forward",
                } as KeyControlType,
                {
                    type: "Key",
                    scope: "#/properties/backward",
                } as KeyControlType,
                {
                    type: "Key",
                    scope: "#/properties/left",
                } as KeyControlType,
                {
                    type: "Key",
                    scope: "#/properties/right",
                } as KeyControlType,
                {
                    type: "Control",
                    scope: "#/properties/startingSpeed",
                } as ControlElement,
                {
                    type: "Key",
                    scope: "#/properties/incSpeed",
                } as KeyControlType,
                {
                    type: "Key",
                    scope: "#/properties/decSpeed",
                } as KeyControlType,
                {
                    type: "Key",
                    scope: "#/properties/unlock",
                } as KeyControlType,
                {
                    type: "Control",
                    scope: "#/properties/unlocktoggle",
                } as ControlElement,
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                    options: {
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'Movement');
                        },
                        buffer: 1,
                        propertyType: "Movement"
                    }
                } as AsyncTopicControlType,
                {
                    type: "Control",
                    scope: "#/properties/publicationFrequency",
                } as ControlElement
            ],
        } as VerticalLayout,
        data: {
            title: 'Control the robot'
        },
        Component: (data: KeyboardControlData) => (
            <PublisherDataSourcesProvider SelectedTopics={[data.topic]}>
                <KeyBoardControl {...data} />
            </PublisherDataSourcesProvider>
        )

    }

}