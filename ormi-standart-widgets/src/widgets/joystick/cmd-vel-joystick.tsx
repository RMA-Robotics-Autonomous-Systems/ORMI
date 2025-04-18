import { useEffect, useState, useRef, useCallback } from "react";
import { KeyControlType, style } from "ormi-core/jsonforms";
import { GamepadIcon, KeyboardIcon, LockIcon, UnlockIcon, GaugeIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { AsyncTopicControlType, axisControlType } from "ormi-core/jsonforms";
import { DatasourceTopic, DatasourceTopicFilter, SelectedTopic, PublisherDataSourcesProvider, usePublisherDataSource } from "ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "ormi-core/plugins";
import { Movement } from "ormi-core/types";
import { AnalogComponent, DigitalInputComponent, DigitalInput, DigitalComponent, AnalogInputComponent, AnalogInput } from "ormi-core/components";
import { toast } from "ormi-core/components";

interface JoypadControlsProps {
    title: string;
    axes: {
        axis: string;
        joystick_plus: AnalogInput;
        joystick_minus: AnalogInput;
    }[];
    startingSpeed: number;
    incSpeed: DigitalInput;
    decSpeed: DigitalInput;
    unlock: DigitalInput;
    unlocktoggle: boolean;
    topic: SelectedTopic;
    publicationFrequency: number;
}

export function JoypadControls(props: JoypadControlsProps) {
    // State for speed control
    const [speed, setSpeed] = useState<number>(props.startingSpeed || 50);
    const [speedkeyIncActive, setSpeedKeyIncActive] = useState<boolean>(false);
    const [speedkeyDecActive, setSpeedKeyDecActive] = useState<boolean>(false);

    // State for locking mechanism
    const [unlockActive, setUnlockActive] = useState<boolean>(false);
    const [isLocked, setIsLocked] = useState<boolean>(true);

    // State for axis values
    const [axisValues, setAxisValues] = useState<Record<string, number>>({});

    // Refs for storing real-time axis values
    const axisValuesRef = useRef<Record<string, number>>({});

    // Data source for publishing
    const { publishers } = usePublisherDataSource();

    // Speed control handlers
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

    // Lock/Unlock mechanism
    useEffect(() => {
        if (props.unlocktoggle) {
            if (unlockActive) {
                setIsLocked((prev) => !prev);
            }
        } else {
            setIsLocked(!unlockActive);
        }
    }, [unlockActive, props.unlocktoggle]);

    // Set up the publishing interval
    useEffect(() => {
        const publish_freq = props.publicationFrequency || 30;
        const publish_period_ms = 1000 / publish_freq;
        const selectedTopic = props.topic;

        if (!selectedTopic?.topic) {
            console.warn("JoypadControls: Topic not selected.");
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
            if (isLocked) {
                return; // Don't send movement commands while locked
            }

            // Initialize movement object with all zeros
            const movement: Movement = {
                linear: { x: 0, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: 0 }
            };

            // Check if any axis has non-zero value
            let isMoving = false;

            // Apply all active axis values from refs
            for (const axisConfig of props.axes) {
                const value = axisValuesRef.current[axisConfig.axis] || 0;

                if (Math.abs(value) <= 0.05) {
                    axisValuesRef.current[axisConfig.axis] = 0;
                    continue; // Ignore small values
                }

                if (value !== 0) {
                    isMoving = true;

                    // Update the appropriate movement axis using a type-safe approach
                    const [type, axis] = axisConfig.axis.split('.');
                    if (type === 'linear') {
                        if (axis === 'x') movement.linear.x = value * (speed / 100);
                        else if (axis === 'y') movement.linear.y = value * (speed / 100);
                        else if (axis === 'z') movement.linear.z = value * (speed / 100);
                    } else if (type === 'angular') {
                        if (axis === 'x') movement.angular.x = value * (speed / 100);
                        else if (axis === 'y') movement.angular.y = value * (speed / 100);
                        else if (axis === 'z') movement.angular.z = value * (speed / 100);
                    }
                }
            }

            if (isMoving) {
                publisher.publish(movement, "Movement");
            }
        };

        const publishInterval = setInterval(movementFunction, publish_period_ms);

        return () => {
            clearInterval(publishInterval);
        };
    }, [props.topic, props.publicationFrequency, publishers, speed, isLocked, props.axes]);

    // Handle joystick input changes
    const handleJoystickChange = useCallback((axis: string, value: number) => {
        setAxisValues(prev => {
            const updated = { ...prev, [axis]: value };
            // Update ref for use in interval
            axisValuesRef.current = updated;
            return updated;
        });
    }, []);

    // Digital input handlers
    const handleIncSpeedActive = useCallback(() => setSpeedKeyIncActive(true), []);
    const handleIncSpeedInactive = useCallback(() => setSpeedKeyIncActive(false), []);
    const handleDecSpeedActive = useCallback(() => setSpeedKeyDecActive(true), []);
    const handleDecSpeedInactive = useCallback(() => setSpeedKeyDecActive(false), []);
    const handleUnlockActive = useCallback(() => setUnlockActive(true), []);
    const handleUnlockInactive = useCallback(() => setUnlockActive(false), []);

    // Handle analog input for joystick axes
    const handleAxisChange = useCallback((axisConfig: { axis: string; }, value: number, isPositive: boolean) => {
        // Map the joystick value to the appropriate axis
        // If negative direction, negate the value
        const effectiveValue = isPositive ? value : -value;
        handleJoystickChange(axisConfig.axis, effectiveValue);
    }, [handleJoystickChange]);

    return (
        <div className="flex flex-col justify-center items-center p-4 h-full gap-3">
            {/* Hidden digital components for key controls */}
            <div style={{ display: "none" }}>
                <DigitalComponent digitalInput={props.decSpeed} onActive={handleDecSpeedActive} onInactive={handleDecSpeedInactive} />
                <DigitalComponent digitalInput={props.unlock} onActive={handleUnlockActive} onInactive={handleUnlockInactive} />
                <DigitalComponent digitalInput={props.incSpeed} onActive={handleIncSpeedActive} onInactive={handleIncSpeedInactive} />
            </div>

            {/* Control header with lock and speed */}
            <div className="flex justify-between w-full mb-4">
                <div
                    data-active={!isLocked}
                    className={style.key}
                    onMouseUp={handleUnlockInactive}
                    onMouseDown={handleUnlockActive}
                    style={{ padding: '0.75rem', cursor: 'pointer' }}
                >
                    {isLocked ? <LockIcon className="text-red-500" /> : <UnlockIcon className="text-green-500" />}
                </div>

                <div
                    data-active={speedkeyIncActive || speedkeyDecActive}
                    className={style.key}
                    style={{ padding: '0.75rem' }}
                >
                    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <GaugeIcon /> {speed}%
                    </span>
                </div>
            </div>

            {/* Joystick axes controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {props.axes.map((axisConfig, index) => {
                    // Track each axis separately with its own state
                    const axisValue = axisValues[axisConfig.axis] || 0;

                    return (
                        <div key={index} className="flex flex-col items-center p-2 border rounded">
                            <div className="text-sm font-medium mb-2">{axisConfig.axis}</div>
                            <div className="flex justify-between w-full gap-4">
                                <div className="flex-1 text-center">
                                    <AnalogComponent
                                        analogInput={axisConfig.joystick_plus}
                                        onValueChange={(value) => handleAxisChange(axisConfig, value, true)}
                                    />
                                </div>
                                <div className="flex-1 text-center">
                                    <AnalogComponent
                                        analogInput={axisConfig.joystick_minus}
                                        onValueChange={(value) => handleAxisChange(axisConfig, value, false)}
                                    />
                                </div>
                            </div>
                            <div className="mt-2 h-2 w-full bg-gray-200 rounded">
                                <div
                                    className="h-full bg-blue-500 rounded"
                                    style={{
                                        width: `${Math.abs(axisValue) * 100}%`,
                                        marginLeft: axisValue < 0 ? '0' : `${50 - Math.abs(axisValue) * 50}%`
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function JoypadControlsDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'joystick-cmd-vel-widget',
        name: 'Joystick control',
        description: 'Allow user to control the robot with a joystick',
        titleProp: 'title',
        icon: <GamepadIcon />,
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

                            joystick_plus: {
                                type: "object",
                                title: "Joystick +",
                            },
                            joystick_minus: {
                                type: "object",
                                title: "Joystick -",
                            },

                        }
                    }
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
                                    type: "Axis",
                                    scope: "#/properties/joystick_plus"
                                } as axisControlType,
                                {
                                    type: "Axis",
                                    scope: "#/properties/joystick_minus"
                                } as axisControlType,
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
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /Movement/ }));
                        },
                        buffer: 1,
                    }
                } as AsyncTopicControlType,
                {
                    type: "Control",
                    scope: "#/properties/publicationFrequency",
                } as ControlElement
            ]

        } as VerticalLayout,
        data: {
            title: 'Control the robot'
        },
        Component: (data: JoypadControlsProps) => (
            <PublisherDataSourcesProvider SelectedTopics={[data.topic]}>
                <JoypadControls  {...data} />
            </PublisherDataSourcesProvider>
        )

    }

}