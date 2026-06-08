"use client";
import React, { CSSProperties, useEffect, useState, useRef } from "react";

import { JoystickIcon } from "lucide-react";
import { AnalogInput, getGamepadAxisName } from "./analog-trigger-input";

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

	const dynamicStyles: CSSProperties = {
		backgroundColor: `rgba(0, 155, 0, ${activationLevel * 0.2})`,
		transform: `scale(${1 + activationLevel * 0.1})`,
		transition: "background-color 0.05s ease-out, transform 0.05s ease-out",
	};

	return (
		<div style={{ width: "10rem" }}>
			<span
				className="bg-black/10 p-[5%] w-full rounded-[var(--radius)] border-[0.2rem] border-black/10 flex justify-center items-center select-none hover:bg-black/20 hover:scale-110 hover:cursor-pointer data-[active=true]:bg-green-600/20 dark:data-[active=true]:bg-green-500/20 data-[active=true]:scale-110 transition-all duration-100"
				style={dynamicStyles}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-evenly",
						width: "100%",
					}}
				>
					<JoystickIcon />
					{`${getGamepadAxisName(props.analogInput.gamepadAxisIndex)} ${props.analogInput.direction === "positive" ? "+" : "-"}`}
				</div>
			</span>
		</div>
	);
};
