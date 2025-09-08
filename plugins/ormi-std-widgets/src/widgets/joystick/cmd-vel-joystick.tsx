import { useEffect, useState, useRef, useCallback } from "react";

import { GamepadIcon, LockIcon, UnlockIcon, GaugeIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { SelectedTopic, usePublisherDataSource, DatasourceTopic, DatasourceTopicFilter, PublisherDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { AsyncTopicControlType } from "@workspace/ormi-core/renderers";
import { Movement } from "@workspace/ormi-core/types";
import { axisControlType, KeyControlType } from "@workspace/ormi-jsonforms";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { AnalogInput, DigitalInput, DigitalComponent, AnalogComponent } from "@workspace/ui/combined/triggers";
import { Slider } from "@workspace/ui/components/slider";
import { toast } from "sonner";

interface JoypadControlsProps {
    title: string;
    axes: {
        axis: string;
        joystick_plus: AnalogInput;
        joystick_minus: AnalogInput;
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

export function JoypadControls(props: JoypadControlsProps) {
    // State for speed control
    const [speed, setSpeed] = useState<number>(props.startingSpeed || 1.0);
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
            setSpeed((prev) => Math.min(10, prev + 0.1)); // Increment by 0.1 m/s, max 10 m/s
        }
    }, [speedkeyIncActive]);

    useEffect(() => {
        if (speedkeyDecActive) {
            setSpeed((prev) => Math.max(0, prev - 0.1)); // Decrement by 0.1 m/s, min 0 m/s
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
                    toast.error(`JoypadControls: Topic "${selectedTopic.topic}" not found in publishers.`);
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
            if (Array.isArray(props.axes)) {
                for (const axisConfig of props.axes) {
                    const value = axisValuesRef.current[axisConfig.axis] || 0;

                    if (Math.abs(value) <= 0.07) {
                        axisValuesRef.current[axisConfig.axis] = 0;
                        continue; // Ignore small values
                    }

                    if (value !== 0) {
                        isMoving = true;

                        // Get the multiplier for this specific axis
                        const multiplier = axisConfig.multiplier || 1;

                        // Update the appropriate movement axis using a type-safe approach
                        const [type, axis] = axisConfig.axis.split('.');
                        if (type === 'linear') {
                            if (axis === 'x') movement.linear.x = value * speed * multiplier;
                            else if (axis === 'y') movement.linear.y = value * speed * multiplier;
                            else if (axis === 'z') movement.linear.z = value * speed * multiplier;
                        } else if (type === 'angular') {
                            if (axis === 'x') movement.angular.x = value * speed * multiplier;
                            else if (axis === 'y') movement.angular.y = value * speed * multiplier;
                            else if (axis === 'z') movement.angular.z = value * speed * multiplier;
                        }
                    }
                }
            }

            if (isMoving) {
                publisher.publish(movement, "Movement");
            } else if (props.keepPublishZero) {
                // If no axes are active and keepPublishZero is true, publish zero movement
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
        <div className="flex flex-col h-full overflow-auto">
            <div className="flex flex-col justify-start items-center p-1 sm:p-2 lg:p-4 h-full gap-1 sm:gap-2 lg:gap-3 min-h-0">
                {/* Hidden digital components for key controls */}
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

                {/* Joystick axes controls */}
                <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:gap-4 w-full flex-1 min-h-0 overflow-auto">
                    {Array.isArray(props.axes) ? props.axes.map((axisConfig, index) => {
                        // Track each axis separately with its own state
                        const axisValue = axisValues[axisConfig.axis] || 0;

                        return (
                            <div key={index} className="flex flex-col items-center p-1 sm:p-2 border rounded min-h-0">
                                <div className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 truncate w-full text-center">{axisConfig.axis}</div>
                                <div className="flex justify-around items-center w-full gap-2 sm:gap-4">
                                    <div className="flex flex-col items-center min-w-0">
                                        <div className="text-xs mb-1">Joystick (+)</div>
                                        <AnalogComponent
                                            analogInput={axisConfig.joystick_plus}
                                            onValueChange={(value) => handleAxisChange(axisConfig, value, true)}
                                        />
                                    </div>
                                    <div className="flex flex-col items-center min-w-0">
                                        <div className="text-xs mb-1">Joystick (-)</div>
                                        <AnalogComponent
                                            analogInput={axisConfig.joystick_minus}
                                            onValueChange={(value) => handleAxisChange(axisConfig, value, false)}
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
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /Movement/ }));
                        },
                        buffer: 1,
                        canSelectProperty: false,
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