import { useEffect, useRef, useState } from "react";
import style from "@/core/jsonforms/key/key.module.css";
import { LockIcon, UnlockIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { AsyncTopicControlType } from "@/core/jsonforms/topic-selector/topic-selector";
import { DatasourceTopic } from "@/core/datasources/datasource-interface";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { KeyControlType } from "@/core/jsonforms/key/key";
import { Movement } from "@/core/types/movement";

export function KeyBoardControl(props: any) {

    const [forward, setForward] = useState<boolean>(false);
    const [backward, setBackward] = useState<boolean>(false);
    const [left, setLeft] = useState<boolean>(false);
    const [right, setRight] = useState<boolean>(false);
    const [speed, setSpeed] = useState<number>(parseFloat(props.startingSpeed));
    const unlockRef = useRef<boolean>(false);
    const [speedkeyInc, setSpeedKeyInc] = useState<boolean>(false);
    const [speedkeyDec, setSpeedKeyDec] = useState<boolean>(false);


    useEffect(() => {

        const publish_freq = props.publicationFrequency || 30; // default to 30Hz
        const publish_period_ms = 1000 / publish_freq;

        const swtichToggle = (press: boolean) => {
            if (props.unlocktoggle && press) {
                unlockRef.current = !unlockRef.current;
            } else if (!props.unlocktoggle) {
                unlockRef.current = press;
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
            if (!unlockRef.current) {
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

            console.log(movement);  // need to publish this movement to the datasource
        }


        const publishInterval = setInterval(movementFunction, publish_period_ms);


        document.addEventListener('keydown', keyPressEvent);
        document.addEventListener('keyup', KeyUpEvent);

        return () => {
            clearInterval(publishInterval);
            document.removeEventListener('keydown', keyPressEvent);
            document.removeEventListener('keyup', KeyUpEvent);
        }

    }, [props, forward, backward, left, right, speed, unlockRef, speedkeyInc, speedkeyDec]);

    return (
        <div className="flex justify-center items-center" style={{ padding: "1rem", height: "100%" }}>
            <div className="gap-3" style={{ width: "100%", height: "100%", gap: "1rem", gridTemplateColumns: "1fr 1fr 1fr", display: "grid", gridTemplateRows: "1fr 1fr" }}>
                <span data-active={unlockRef.current} className={style.key}> {!unlockRef.current && <LockIcon /> || unlockRef.current && <UnlockIcon />}</span>
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
                    type: 'string',
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
                    "type": "TopicSelect",
                    "scope": "#/properties/topic",
                    "options": {
                        "asyncFunction": async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'number');
                        },
                        // "propertyType": "number"
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
        Component: (data: any) => (
            // <LocalDataSourcesProvider TopicsProps={[data]} buffersSize={1} >
            <KeyBoardControl {...data} />
            // </LocalDataSourcesProvider >
        )

    }

}