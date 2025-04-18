"use client";
import React, { CSSProperties, useEffect, useState } from 'react';

import style from '../../../core/jsonforms/controls/key/key.module.css';

import { JoystickIcon } from 'lucide-react';

interface AnalogInputComponentProps {
    onChange: (data: AnalogInput) => void;
    data: AnalogInput | null;
}

// Gamepad analog axis input
export interface AnalogInput {
    type: 'gamepad';
    gamepadAxisIndex: number;
    gamepadId: string;
    direction: 'positive' | 'negative';
}

// Standard Gamepad Axis Mapping (Common assignments, may vary)
const StandardGamepadAxisNames: { [key: number]: string } = {
    0: 'Left Stick X',
    1: 'Left Stick Y',
    2: 'Right Stick X',
    3: 'Right Stick Y',
};

export function getGamepadAxisName(index: number | undefined, gamepadId?: string): string {
    if (index === undefined) {
        return '?';
    }
    return StandardGamepadAxisNames[index] || `Axis ${index}`;
}

const ACTIVATION_THRESHOLD = 0.5;

export const AnalogInputComponent = (props: AnalogInputComponentProps) => {
    const [isSelecting, setIsSelecting] = useState(false);
    const [activationLevel, setActivationLevel] = useState(0); // 0 to 1

    const [data, setData] = useState<AnalogInput | null>(props.data);
    const [gamepads, setGamepads] = useState<Gamepad[] | null>(null);

    useEffect(() => {
        const gamepadHandler = (event: GamepadEvent) => {
            console.log('gamepad event', event);
            if (event.type === 'gamepadconnected') {
                setGamepads((prev) => {
                    const existingIds = prev?.map(gp => gp.index) || [];
                    if (!existingIds.includes(event.gamepad.index)) {
                        return [...(prev || []), event.gamepad];
                    }
                    return prev;
                });
            } else {
                setGamepads((prev) => prev?.filter((gamepad) => gamepad.index !== event.gamepad.index) || null);
            }
        };
        window.addEventListener('gamepadconnected', gamepadHandler);
        window.addEventListener('gamepaddisconnected', gamepadHandler);

        const initialGamepads = navigator.getGamepads().filter(gp => gp !== null) as Gamepad[];
        setGamepads(initialGamepads);

        return () => {
            window.removeEventListener('gamepadconnected', gamepadHandler);
            window.removeEventListener('gamepaddisconnected', gamepadHandler);
        };
    }, []);

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
                            data &&
                            data.type === 'gamepad' &&
                            gamepad.id === data.gamepadId &&
                            index === data.gamepadAxisIndex
                        ) {
                            if (data.direction === 'positive' && axisValue > 0) {
                                currentActivationLevel = Math.min(axisValue, 1);
                            } else if (data.direction === 'negative' && axisValue < 0) {
                                currentActivationLevel = Math.min(absoluteValue, 1);
                            }
                        }

                        if (isSelecting && absoluteValue > ACTIVATION_THRESHOLD) {
                            const direction = axisValue > 0 ? 'positive' : 'negative';
                            const newData: AnalogInput = {
                                type: 'gamepad',
                                gamepadAxisIndex: index,
                                gamepadId: gamepad.id,
                                direction: direction,
                            };
                            setData(newData);
                            props.onChange(newData);
                            setIsSelecting(false);
                            currentActivationLevel = Math.min(absoluteValue, 1);
                        }
                    });
                });

            setActivationLevel(currentActivationLevel);

            if (data && !Array.from(currentFrameGamepads).some(gp => gp?.id === data.gamepadId)) {
                setActivationLevel(0);
            }

        }, 50);

        return () => {
            clearInterval(gamePadInterval);
        };
    }, [isSelecting, data, props.onChange]);

    const handleSelecting = () => {
        setIsSelecting(true);
        setData(null);
        setActivationLevel(0);
    };

    const dynamicStyles: CSSProperties = {
        backgroundColor: `rgba(0, 155, 0, ${activationLevel * 0.2})`,
        transform: `scale(${1 + activationLevel * 0.1})`,
        transition: 'background-color 0.05s ease-out, transform 0.05s ease-out',
    };

    return (
        <div style={{ width: '10rem' }}>
            <span
                className={style.key}
                onClick={handleSelecting}
                style={dynamicStyles}
            >
                {isSelecting ? (
                    'move axis'
                ) : data ? (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-evenly',
                            width: '100%',
                        }}
                    >
                        <JoystickIcon />
                        {`${getGamepadAxisName(data.gamepadAxisIndex, data.gamepadId)} ${data.direction === 'positive' ? '+' : '-'}`}
                    </div>
                ) : (
                    '<input>'
                )}
            </span>
        </div>
    );
};

