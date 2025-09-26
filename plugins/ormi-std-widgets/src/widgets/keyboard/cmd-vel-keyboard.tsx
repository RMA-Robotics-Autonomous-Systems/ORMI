import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { GaugeIcon, KeyboardIcon, LockIcon, UnlockIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { SelectedTopic, usePublisherDataSource, DatasourceTopic, DatasourceTopicFilter, PublisherDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { Movement } from "@workspace/ormi-core/types";
import { KeyControlType } from "@workspace/ormi-jsonforms";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { DigitalInput, DigitalComponent } from "@workspace/ui/combined/triggers";
import { Slider } from "@workspace/ui/components/slider";
import { toast } from "sonner";

interface KeyboardControlData {
    title: string;
    axes: {
        axis: string;
        key_positive: DigitalInput;
        key_negative: DigitalInput;
        multiplier: number;
    }[];
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
    const [speed, setSpeed] = useState<number>(props.startingSpeed || 1.0);
    const [unlockActive, setUnlockActive] = useState<boolean>(false);
    const [isLocked, setIsLocked] = useState<boolean>(true);
    const [speedkeyIncActive, setSpeedKeyIncActive] = useState<boolean>(false);
    const [speedkeyDecActive, setSpeedKeyDecActive] = useState<boolean>(false);

    // Individual state for each axis key (like the original working version)
    const [axisKeyStates, setAxisKeyStates] = useState<Record<string, boolean>>({});

    // Individual refs for each axis key (like the original working version)  
    const axisKeyRefs = useRef<Record<string, boolean>>({});

    const { publishers } = usePublisherDataSource();

    // Initialize refs for all axis keys
    useEffect(() => {
        const initialRefs: Record<string, boolean> = {};
        if (Array.isArray(props.axes)) {
            for (const axisConfig of props.axes) {
                const positiveKey = `${axisConfig.axis}_positive`;
                const negativeKey = `${axisConfig.axis}_negative`;
                initialRefs[positiveKey] = false;
                initialRefs[negativeKey] = false;
            }
        }
        axisKeyRefs.current = initialRefs;
    }, [props.axes]);

    // Update refs whenever state changes (like the original)
    useEffect(() => {
        axisKeyRefs.current = axisKeyStates;
    }, [axisKeyStates]);

    useEffect(() => {
        if (speedkeyIncActive) {
            setSpeed((prev) => Math.min(10, prev + 0.1)); // Increment by 0.1 m/s, max 10 m/s
        }
    }, [speedkeyIncActive]);

    useEffect(() => {
        if (speedkeyDecActive) {
            setSpeed((prev) => Math.max(0, prev - 0.1)); // Decrement by 0.1 m/s, min 0 m/s
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
                    toast.error(`KeyboardControl: Publisher for topic ${selectedTopic.topic} not found. Please check your configuration.`);
                }
            }, 1000);
            return () => clearTimeout(timer);
        }

        const movementFunction = () => {
            if (isLocked) {
                return; // Don't send movement commands while locked
            }

            const movement: Movement = {
                linear: { x: 0, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: 0 }
            };

            let isMoving = false;

            // Process each axis based on current key states from refs (like the original)
            if (Array.isArray(props.axes)) {
                for (const axisConfig of props.axes) {
                    const positiveKey = `${axisConfig.axis}_positive`;
                    const negativeKey = `${axisConfig.axis}_negative`;

                    const positiveActive = axisKeyRefs.current[positiveKey] || false;
                    const negativeActive = axisKeyRefs.current[negativeKey] || false;

                    let axisValue = 0;
                    if (positiveActive && !negativeActive) {
                        axisValue = 1;
                    } else if (negativeActive && !positiveActive) {
                        axisValue = -1;
                    } else if (positiveActive && negativeActive) {
                        axisValue = 0; // Both keys pressed, cancel out
                    }

                    if (axisValue !== 0) {
                        isMoving = true;

                        // Get the multiplier for this specific axis
                        const multiplier = axisConfig.multiplier || 1;
                        const finalValue = axisValue * speed * multiplier;

                        // Update the appropriate movement axis - ACCUMULATE values for multiple axes
                        const [type, axis] = axisConfig.axis.split('.');
                        if (type === 'linear') {
                            if (axis === 'x') movement.linear.x += finalValue;
                            else if (axis === 'y') movement.linear.y += finalValue;
                            else if (axis === 'z') movement.linear.z += finalValue;
                        } else if (type === 'angular') {
                            if (axis === 'x') movement.angular.x += finalValue;
                            else if (axis === 'y') movement.angular.y += finalValue;
                            else if (axis === 'z') movement.angular.z += finalValue;
                        }
                    }
                }
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
    }, [props.topic, props.publicationFrequency, publishers, speed, isLocked, props.keepPublishZero]);

    // Individual memoized handlers for each axis key (like the original working version)
    const axisKeyHandlers = useMemo(() => {
        const handlers: Record<string, { handleActive: () => void; handleInactive: () => void }> = {};

        if (Array.isArray(props.axes)) {
            for (const axisConfig of props.axes) {
                const positiveKey = `${axisConfig.axis}_positive`;
                const negativeKey = `${axisConfig.axis}_negative`;

                handlers[positiveKey] = {
                    handleActive: () => {
                        setAxisKeyStates(prev => {
                            const updated = { ...prev, [positiveKey]: true };
                            axisKeyRefs.current = updated;
                            return updated;
                        });
                    },
                    handleInactive: () => {
                        setAxisKeyStates(prev => {
                            const updated = { ...prev, [positiveKey]: false };
                            axisKeyRefs.current = updated;
                            return updated;
                        });
                    }
                };

                handlers[negativeKey] = {
                    handleActive: () => {
                        setAxisKeyStates(prev => {
                            const updated = { ...prev, [negativeKey]: true };
                            axisKeyRefs.current = updated;
                            return updated;
                        });
                    },
                    handleInactive: () => {
                        setAxisKeyStates(prev => {
                            const updated = { ...prev, [negativeKey]: false };
                            axisKeyRefs.current = updated;
                            return updated;
                        });
                    }
                };
            }
        }

        return handlers;
    }, [props.axes]);

    // Digital input handlers
    const handleIncSpeedActive = useCallback(() => setSpeedKeyIncActive(true), []);
    const handleIncSpeedInactive = useCallback(() => setSpeedKeyIncActive(false), []);
    const handleDecSpeedActive = useCallback(() => setSpeedKeyDecActive(true), []);
    const handleDecSpeedInactive = useCallback(() => setSpeedKeyDecActive(false), []);
    const handleUnlockActive = useCallback(() => setUnlockActive(true), []);
    const handleUnlockInactive = useCallback(() => setUnlockActive(false), []);

    return (
        <div className="flex flex-col h-full overflow-auto">
            <div className="flex flex-col justify-start items-center p-1 sm:p-2 lg:p-4 h-full gap-1 sm:gap-2 lg:gap-3 min-h-0">
                <div style={{ display: "none" }}>
                    <DigitalComponent digitalInput={props.decSpeed} onActive={handleDecSpeedActive} onInactive={handleDecSpeedInactive} />
                    <DigitalComponent digitalInput={props.unlock} onActive={handleUnlockActive} onInactive={handleUnlockInactive} />
                    <DigitalComponent digitalInput={props.incSpeed} onActive={handleIncSpeedActive} onInactive={handleIncSpeedInactive} />
                </div>

                {/* Control header with lock and speed */}
                <div className="flex justify-between w-full mb-1 sm:mb-2 lg:mb-4 gap-1 sm:gap-2">
                    <div
                        data-active={!isLocked}
                        className="
                            bg-black/10 w-full rounded-[var(--radius)] border-[0.2rem] border-black/10 
                            flex justify-center items-center select-none cursor-pointer
                            hover:bg-black/20 transition-all duration-100
                            data-[active=true]:bg-green-600/20
                            min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[3rem]
                        "
                        onMouseUp={handleUnlockInactive}
                        onMouseDown={handleUnlockActive}
                        style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                    >
                        {isLocked ? <LockIcon className="text-red-500 w-4 h-4 sm:w-5 sm:h-5" /> : <UnlockIcon className="text-green-500 w-4 h-4 sm:w-5 sm:h-5" />}
                    </div>

                    <div
                        data-active={speedkeyIncActive || speedkeyDecActive}
                        className="
                            bg-black/10 w-full rounded-[var(--radius)] border-[0.2rem] border-black/10 
                            flex justify-center items-center select-none cursor-pointer
                            hover:bg-black/20 transition-all duration-100
                            data-[active=true]:bg-green-600/20
                            min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[3rem]
                        "
                        style={{ padding: '0.25rem 0.5rem' }}
                    >
                        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <GaugeIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="text-xs sm:text-sm">{speed.toFixed(1)} m/s</span>
                        </span>
                    </div>
                </div>

                {/* Keyboard axes controls */}
                <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:gap-4 w-full flex-1 min-h-0 overflow-auto">
                    {Array.isArray(props.axes) ? props.axes.map((axisConfig, index) => {
                        const positiveKey = `${axisConfig.axis}_positive`;
                        const negativeKey = `${axisConfig.axis}_negative`;
                        const positiveActive = axisKeyStates[positiveKey] || false;
                        const negativeActive = axisKeyStates[negativeKey] || false;

                        let axisValue = 0;
                        if (positiveActive && !negativeActive) {
                            axisValue = 1;
                        } else if (negativeActive && !positiveActive) {
                            axisValue = -1;
                        }

                        // Get handlers for this specific axis
                        const positiveHandlers = axisKeyHandlers[positiveKey];
                        const negativeHandlers = axisKeyHandlers[negativeKey];

                        return (
                            <div key={index} className="flex flex-col items-center p-1 sm:p-2 border rounded min-h-0">
                                <div className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 truncate w-full text-center">{axisConfig.axis}</div>
                                <div className="flex justify-around items-center w-full gap-2 sm:gap-4">
                                    <div className="flex flex-col items-center min-w-0">
                                        <div className="text-xs mb-1">Positive (+)</div>
                                        <DigitalComponent
                                            digitalInput={axisConfig.key_positive}
                                            onActive={positiveHandlers ? positiveHandlers.handleActive : () => { }}
                                            onInactive={positiveHandlers ? positiveHandlers.handleInactive : () => { }}
                                        />
                                    </div>
                                    <div className="flex flex-col items-center min-w-0">
                                        <div className="text-xs mb-1">Negative (-)</div>
                                        <DigitalComponent
                                            digitalInput={axisConfig.key_negative}
                                            onActive={negativeHandlers ? negativeHandlers.handleActive : () => { }}
                                            onInactive={negativeHandlers ? negativeHandlers.handleInactive : () => { }}
                                        />
                                    </div>
                                </div>
                                <div className="mt-1 sm:mt-2 h-1 sm:h-2 w-full bg-gray-200 rounded">
                                    <div
                                        className="h-full bg-blue-500 rounded transition-all duration-150"
                                        style={{
                                            width: `${Math.abs(axisValue) * 100}%`,
                                            marginLeft: axisValue < 0 ? '0' : `${50 - Math.abs(axisValue) * 50}%`
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="flex justify-center items-center h-full text-muted-foreground">
                            No axes configured. Please configure axes in the widget settings.
                        </div>
                    )}
                </div>
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
                axes: {
                    type: 'array',
                    title: 'Axes',
                    items: {
                        type: 'object',
                        properties: {
                            axis: {
                                type: 'string',
                                title: 'Axis',
                                enum: ['linear.x', 'linear.y', 'linear.z', 'angular.x', 'angular.y', 'angular.z'],
                            },
                            key_positive: {
                                type: "object",
                                title: "Positive Key",
                            },
                            key_negative: {
                                type: "object",
                                title: "Negative Key",
                            },
                            multiplier: {
                                type: 'number',
                                title: 'Multiplier',
                                default: 1,
                                minimum: 0,
                                maximum: 10,
                            },
                        }
                    }
                },
                startingSpeed: {
                    type: 'number',
                    title: 'Starting Speed (m/s)',
                    default: 1.0,
                    minimum: 0,
                    maximum: 10,
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
            required: ['title', 'topic', 'incSpeed', 'decSpeed', 'unlock']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/axes",
                    options: {
                        detail: {
                            type: "VerticalLayout",
                            elements: [
                                {
                                    type: "Control",
                                    scope: "#/properties/axis"
                                } as ControlElement,
                                {
                                    type: "Key",
                                    scope: "#/properties/key_positive"
                                } as KeyControlType,
                                {
                                    type: "Key",
                                    scope: "#/properties/key_negative"
                                } as KeyControlType,
                                {
                                    type: "Control",
                                    scope: "#/properties/multiplier"
                                } as ControlElement,
                            ]
                        }
                    }
                } as ControlElement,
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
                        dataRequirements: {
                            accepts: ['Movement']
                        }
                    }
                } as TopicSelectElement,
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
            startingSpeed: 0.5,
            publicationFrequency: 30,
            unlocktoggle: false,
            axes: [
                {
                    axis: 'linear.x',
                    key_positive: { type: 'keyboard', key: 'w' },
                    key_negative: { type: 'keyboard', key: 's' },
                    multiplier: 1
                },
                {
                    axis: 'angular.z',
                    key_positive: { type: 'keyboard', key: 'a' },
                    key_negative: { type: 'keyboard', key: 'd' },
                    multiplier: 1
                },
            ],
            incSpeed: { type: 'keyboard', key: '+' },
            decSpeed: { type: 'keyboard', key: '-' },
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