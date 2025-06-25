"use client";
import React, { CSSProperties, useEffect, useState, useRef } from 'react';

import styles from "@/src/styles/key.module.css";

import { JoystickIcon } from 'lucide-react';
import { AnalogInput, getGamepadAxisName } from './analog-trigger-input';

interface AnalogInputComponentProps {
    analogInput: AnalogInput;
    onValueChange: (value: number) => void;
}

export const AnalogComponent = (props: AnalogInputComponentProps) => {
    const [activationLevel, setActivationLevel] = useState(0); // 0 to 1
    const activationRef = useRef(0);

    useEffect(() => {
        const gamePadInterval = setInterval(() => {
            const currentFrameGamepads = navigator.getGamepads();
            let currentActivationLevel = 0; // Track activation level for the current frame

            Array.from(currentFrameGamepads)
                .filter((gp): gp is Gamepad => gp !== null)
                .forEach((gamepad) => {
                    gamepad.axes.forEach((axisValue, index) => {
                        const absoluteValue = Math.abs(axisValue);

                        if (
                            props.analogInput &&
                            props.analogInput.type === 'gamepad' &&
                            gamepad.id === props.analogInput.gamepadId &&
                            index === props.analogInput.gamepadAxisIndex
                        ) {
                            if (props.analogInput.direction === 'positive' && axisValue > 0) {
                                currentActivationLevel = Math.min(axisValue, 1);
                            } else if (props.analogInput.direction === 'negative' && axisValue < 0) {
                                currentActivationLevel = Math.min(absoluteValue, 1);
                            }
                        }
                    });
                });

            if (Math.abs(currentActivationLevel) <= 0.1) {
                currentActivationLevel *= 0.9
                if (Math.abs(currentActivationLevel) < 0.05) {
                    currentActivationLevel = 0;
                }
            }

            // Only update if the value actually changed
            if (activationLevel !== currentActivationLevel) {
                activationRef.current = currentActivationLevel;
                setActivationLevel(currentActivationLevel);
                props.onValueChange(currentActivationLevel);
            }

            if (props.analogInput && !Array.from(currentFrameGamepads).some(gp => gp?.id === props.analogInput.gamepadId)) {
                activationRef.current = 0;
                setActivationLevel(0);
                props.onValueChange(0);
            }
        }, 50);

        return () => {
            clearInterval(gamePadInterval);
        };
        // Remove activationLevel from dependencies to prevent reset loops
    }, [props.onValueChange, props.analogInput]);

    const dynamicStyles: CSSProperties = {
        backgroundColor: `rgba(0, 155, 0, ${activationLevel * 0.2})`,
        transform: `scale(${1 + activationLevel * 0.1})`,
        transition: 'background-color 0.05s ease-out, transform 0.05s ease-out',
    };

    return (
        <div style={{ width: '10rem' }}>
            <span
                className={styles.key}
                style={dynamicStyles}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-evenly',
                        width: '100%',
                    }}
                >
                    <JoystickIcon />
                    {`${getGamepadAxisName(props.analogInput.gamepadAxisIndex, props.analogInput.gamepadId)} ${props.analogInput.direction === 'positive' ? '+' : '-'}`}
                </div>

            </span>
        </div>
    );
};

