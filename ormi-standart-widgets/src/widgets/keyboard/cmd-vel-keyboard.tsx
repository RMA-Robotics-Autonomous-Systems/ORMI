import { useEffect, useState, useRef, useCallback } from "react"; // Import useCallback
import { style } from "ormi-core/jsonforms";
import { GaugeIcon, KeyboardIcon, LockIcon, UnlockIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { DigitalInput, DigitalComponent } from "ormi-core/components";
import { AsyncTopicControlType, KeyControlType } from "ormi-core/jsonforms";
import { DatasourceTopic, DatasourceTopicFilter, SelectedTopic, PublisherDataSourcesProvider, usePublisherDataSource } from "ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "ormi-core/plugins";
import { Movement } from "ormi-core/types";
import { toast } from "ormi-core/components";

interface KeyboardControlData {
    title: string;
    forward: DigitalInput;
    backward: DigitalInput;
    left: DigitalInput;
    right: DigitalInput;
    startingSpeed: number;
    incSpeed: DigitalInput;
    decSpeed: DigitalInput;
    unlock: DigitalInput;
    unlocktoggle: boolean;
    topic: SelectedTopic;
    publicationFrequency: number;
    keepPublishZero: boolean;
}

export function KeyBoardControl(props: KeyboardControlData) {
    const [forwardActive, setForwardActive] = useState<boolean>(false);
    const [backwardActive, setBackwardActive] = useState<boolean>(false);
    const [leftActive, setLeftActive] = useState<boolean>(false);
    const [rightActive, setRightActive] = useState<boolean>(false);
    const [speed, setSpeed] = useState<number>(props.startingSpeed || 50);
    const [unlockActive, setUnlockActive] = useState<boolean>(false);
    const [isLocked, setIsLocked] = useState<boolean>(true);
    const [speedkeyIncActive, setSpeedKeyIncActive] = useState<boolean>(false);
    const [speedkeyDecActive, setSpeedKeyDecActive] = useState<boolean>(false);

    // Refs to hold the latest active state for movement keys
    const forwardActiveRef = useRef(forwardActive);
    const backwardActiveRef = useRef(backwardActive);
    const leftActiveRef = useRef(leftActive);
    const rightActiveRef = useRef(rightActive);

    // Update refs whenever state changes (this ensures refs are up-to-date if needed elsewhere, though the interval reads them directly)
    useEffect(() => { forwardActiveRef.current = forwardActive; }, [forwardActive]);
    useEffect(() => { backwardActiveRef.current = backwardActive; }, [backwardActive]);
    useEffect(() => { leftActiveRef.current = leftActive; }, [leftActive]);
    useEffect(() => { rightActiveRef.current = rightActive; }, [rightActive]);

    const { publishers } = usePublisherDataSource();

    useEffect(() => {
        if (speedkeyIncActive) {
            setSpeed((prev) => prev + 10);
        }
    }, [speedkeyIncActive]);

    useEffect(() => {
        if (speedkeyDecActive) {
            setSpeed((prev) => Math.max(0, prev - 10));
        }
    }, [speedkeyDecActive]);

    useEffect(() => {
        if (props.unlocktoggle) {
            if (unlockActive) {
                setIsLocked((prev) => !prev);
            }
        } else {
            setIsLocked(!unlockActive);
        }
    }, [unlockActive, props.unlocktoggle]);

    useEffect(() => {
        const publish_freq = props.publicationFrequency || 30;
        const publish_period_ms = 1000 / publish_freq;
        const selectedTopic = props.topic;

        if (!selectedTopic?.topic) {
            console.warn("KeyboardControl: Topic not selected.");
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

        const movementFunction = () => {
            // Read current state directly from refs inside the interval
            const fwd = forwardActiveRef.current;
            const bwd = backwardActiveRef.current;
            const lft = leftActiveRef.current;
            const rgt = rightActiveRef.current;

            if (isLocked) {
                return; // Don't send movement commands while locked
            }

            const movement: Movement = {
                linear: { x: 0, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: 0 }
            };

            let isMoving = false;
            if (fwd) {
                movement.linear.x += speed / 100;
                isMoving = true;
            }
            if (bwd) {
                movement.linear.x -= speed / 100;
                isMoving = true;
            }
            if (lft) {
                movement.angular.z += speed / 100;
                isMoving = true;
            }
            if (rgt) {
                movement.angular.z -= speed / 100;
                isMoving = true;
            }

            if (isMoving) {
                publisher.publish(movement, "Movement");
            } else if (props.keepPublishZero) {
                publisher.publish(movement, "Movement");
            }

        };

        const publishInterval = setInterval(movementFunction, publish_period_ms);

        return () => {
            clearInterval(publishInterval);
        };
    }, [props.topic, props.publicationFrequency, publishers, speed, isLocked]);

    // Memoized handlers using useCallback to ensure stable references
    const handleForwardActive = useCallback(() => {
        setForwardActive(true);
        forwardActiveRef.current = true;
    }, []);

    const handleForwardInactive = useCallback(() => {
        setForwardActive(false);
        forwardActiveRef.current = false;
    }, []);

    const handleBackwardActive = useCallback(() => {
        setBackwardActive(true);
        backwardActiveRef.current = true;
    }, []);

    const handleBackwardInactive = useCallback(() => {
        setBackwardActive(false);
        backwardActiveRef.current = false;
    }, []);

    const handleLeftActive = useCallback(() => {
        setLeftActive(true);
        leftActiveRef.current = true;
    }, []);

    const handleLeftInactive = useCallback(() => {
        setLeftActive(false);
        leftActiveRef.current = false;
    }, []);

    const handleRightActive = useCallback(() => {
        setRightActive(true);
        rightActiveRef.current = true;
    }, []);

    const handleRightInactive = useCallback(() => {
        setRightActive(false);
        rightActiveRef.current = false;
    }, []);

    const handleIncSpeedActive = useCallback(() => setSpeedKeyIncActive(true), []);
    const handleIncSpeedInactive = useCallback(() => setSpeedKeyIncActive(false), []);
    const handleDecSpeedActive = useCallback(() => setSpeedKeyDecActive(true), []);
    const handleDecSpeedInactive = useCallback(() => setSpeedKeyDecActive(false), []);
    const handleUnlockActive = useCallback(() => setUnlockActive(true), []);
    const handleUnlockInactive = useCallback(() => setUnlockActive(false), []);
    return (
        <div className="flex flex-col justify-center items-center p-4 h-full gap-3">
            <div style={{ display: "none" }}>
                <DigitalComponent digitalInput={props.decSpeed} onActive={handleDecSpeedActive} onInactive={handleDecSpeedInactive} />
                <DigitalComponent digitalInput={props.unlock} onActive={handleUnlockActive} onInactive={handleUnlockInactive} />
                <DigitalComponent digitalInput={props.incSpeed} onActive={handleIncSpeedActive} onInactive={handleIncSpeedInactive} />

            </div>
            {/* Grid layout for movement controls */}
            <div className="mb-4" style={{ display: 'grid', alignItems: "center", justifyItems: "center", gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                <div data-active={!isLocked} style={{ width: '10rem' }} className={style.key} onMouseUp={handleUnlockInactive} onMouseDown={handleUnlockActive}>
                    {isLocked ? <LockIcon className="text-red-500" /> : <UnlockIcon className="text-green-500" />}
                </div>
                <DigitalComponent digitalInput={props.forward} onActive={handleForwardActive} onInactive={handleForwardInactive} />
                <div data-active={speedkeyIncActive || speedkeyDecActive} style={{ width: '10rem' }} className={style.key}>
                    <span style={{ display: "flex", justifyContent: "space-evenly", width: "100%" }}><GaugeIcon />{speed}%</span>
                </div>
                <DigitalComponent digitalInput={props.left} onActive={handleLeftActive} onInactive={handleLeftInactive} />
                <DigitalComponent digitalInput={props.backward} onActive={handleBackwardActive} onInactive={handleBackwardInactive} />
                <DigitalComponent digitalInput={props.right} onActive={handleRightActive} onInactive={handleRightInactive} />
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
                    type: 'object',
                    title: 'Forward'
                },
                backward: {
                    type: 'object',
                    title: 'Backward'
                },
                left: {
                    type: 'object',
                    title: 'Left'
                },
                right: {
                    type: 'object',
                    title: 'Right'
                },
                startingSpeed: {
                    type: 'number',
                    title: 'Starting Speed (%)',
                    default: 50,
                    minimum: 0,
                    maximum: 100,
                },
                incSpeed: {
                    type: 'object',
                    title: 'Increase Speed'
                },
                decSpeed: {
                    type: 'object',
                    title: 'Decrease Speed'
                },
                unlock: {
                    type: 'object',
                    title: 'Unlock'
                },
                unlocktoggle: {
                    type: 'boolean',
                    title: 'Unlock is Toggle',
                    default: false,
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                publicationFrequency: {
                    type: 'number',
                    title: 'Publication Frequency (Hz)',
                    default: 30,
                    minimum: 1,
                },
                keepPublishZero: {
                    type: "boolean",
                    title: "Publish 0 when inactive",
                    default: false
                }
            },
            required: ['title', 'topic', 'forward', 'backward', 'left', 'right', 'incSpeed', 'decSpeed', 'unlock']
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
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /Movement/ }));
                        },
                        buffer: 1,
                    }
                } as AsyncTopicControlType,
                {
                    type: "Control",
                    scope: "#/properties/publicationFrequency",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/keepPublishZero",
                } as ControlElement,

            ],
        } as VerticalLayout,
        data: {
            title: 'Keyboard Robot Control',
            startingSpeed: 50,
            publicationFrequency: 30,
            unlocktoggle: false,
            forward: { type: 'keyboard', key: 'z' },
            backward: { type: 'keyboard', key: 's' },
            left: { type: 'keyboard', key: 'q' },
            right: { type: 'keyboard', key: 'd' },
            incSpeed: { type: 'keyboard', key: 'a' },
            decSpeed: { type: 'keyboard', key: 'e' },
            unlock: { type: 'keyboard', key: ' ' },
        },
        Component: (data: KeyboardControlData) => (
            data.topic ? (
                <PublisherDataSourcesProvider SelectedTopics={[data.topic]}>
                    <KeyBoardControl {...data} />
                </PublisherDataSourcesProvider>
            ) : (
                <div className="flex justify-center items-center h-full text-muted-foreground">
                    Please select a topic in the widget configuration.
                </div>
            )
        )
    }
}