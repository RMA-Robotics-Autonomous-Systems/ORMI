"use client";
import React, { CSSProperties, useEffect, useState, useRef } from "react";

import { JoystickIcon } from "lucide-react";
import { AnalogInput, getGamepadAxisName } from "./analog-trigger-input";
import { TRIGGER_CHIP_WIDTH, triggerChipVariants } from "./trigger-chip";

interface AnalogInputComponentProps {
	analogInput: AnalogInput;
	onValueChange: (value: number) => void;
}

export const AnalogComponent = (props: AnalogInputComponentProps) => {
	const { analogInput, onValueChange } = props;
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
							analogInput &&
							analogInput.type === "gamepad" &&
							gamepad.id === analogInput.gamepadId &&
							index === analogInput.gamepadAxisIndex
						) {
							if (
								analogInput.direction === "positive" &&
								axisValue > 0
							) {
								currentActivationLevel = Math.min(axisValue, 1);
							} else if (
								analogInput.direction === "negative" &&
								axisValue < 0
							) {
								currentActivationLevel = Math.min(
									absoluteValue,
									1,
								);
							}
						}
					});
				});

			if (Math.abs(currentActivationLevel) <= 0.1) {
				currentActivationLevel *= 0.9;
				if (Math.abs(currentActivationLevel) < 0.05) {
					currentActivationLevel = 0;
				}
			}

			// Only update if the value actually changed
			if (activationLevel !== currentActivationLevel) {
				activationRef.current = currentActivationLevel;
				setActivationLevel(currentActivationLevel);
				onValueChange(currentActivationLevel);
			}

			if (
				analogInput &&
				!Array.from(currentFrameGamepads).some(
					(gp) => gp?.id === analogInput.gamepadId,
				)
			) {
				activationRef.current = 0;
				setActivationLevel(0);
				onValueChange(0);
			}
		}, 50);

		return () => {
			clearInterval(gamePadInterval);
		};
		// Remove activationLevel from dependencies to prevent reset loops
	}, [onValueChange, analogInput, activationLevel]);

	// Analog activation is continuous, so the success tint is mixed live rather
	// than switched by the chip's boolean `active` variant.
	const dynamicStyles: CSSProperties = {
		backgroundColor: `color-mix(in oklab, var(--success) ${activationLevel * 25}%, var(--muted))`,
		borderColor:
			activationLevel > 0
				? `color-mix(in oklab, var(--success) ${activationLevel * 100}%, var(--input))`
				: undefined,
	};

	return (
		<div className={TRIGGER_CHIP_WIDTH}>
			<span className={triggerChipVariants()} style={dynamicStyles}>
				<JoystickIcon />
				{`${getGamepadAxisName(props.analogInput.gamepadAxisIndex)} ${props.analogInput.direction === "positive" ? "+" : "-"}`}
			</span>
		</div>
	);
};
