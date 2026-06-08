"use client";
import React, { CSSProperties, useEffect, useState } from "react";

import { JoystickIcon } from "lucide-react";

interface AnalogInputComponentProps {
	onChange: (data: AnalogInput) => void;
	data: AnalogInput | null;
}

// Gamepad analog axis input
export interface AnalogInput {
	type: "gamepad";
	gamepadAxisIndex: number;
	gamepadId: string;
	direction: "positive" | "negative";
}

// Standard Gamepad Axis Mapping (Common assignments, may vary)
const StandardGamepadAxisNames: { [key: number]: string } = {
	0: "Left Stick X",
	1: "Left Stick Y",
	2: "Right Stick X",
	3: "Right Stick Y",
};

export function getGamepadAxisName(index: number | undefined): string {
	if (index === undefined) {
		return "?";
	}
	return StandardGamepadAxisNames[index] || `Axis ${index}`;
}

// Threshold for absolute value to be considered active *after* selection
const ACTIVATION_THRESHOLD = 0.5;
// Threshold for the *change* in value from resting state to trigger selection
const DELTA_THRESHOLD = 0.3; // Adjust as needed

export const AnalogInputComponent = (props: AnalogInputComponentProps) => {
	const { onChange, data: initialData } = props;
	const [isSelecting, setIsSelecting] = useState(false);
	const [activationLevel, setActivationLevel] = useState(0); // 0 to 1
	// Store resting values when selection starts: Map<gamepad.id, axisValues[]>
	const [restingAxisValues, setRestingAxisValues] = useState<
		Map<string, number[]>
	>(new Map());

	const [data, setData] = useState<AnalogInput | null>(initialData);

	useEffect(() => {
		if (!isSelecting && !data) {
			return;
		}

		const gamePadInterval = setInterval(() => {
			const currentFrameGamepads = navigator.getGamepads();
			let currentActivationLevel = 0;

			Array.from(currentFrameGamepads)
				.filter((gp): gp is Gamepad => gp !== null)
				.forEach((gamepad) => {
					const restingAxes = restingAxisValues.get(gamepad.id);

					gamepad.axes.forEach((axisValue, index) => {
						const absoluteValue = Math.abs(axisValue);

						if (
							data &&
							data.type === "gamepad" &&
							gamepad.id === data.gamepadId &&
							index === data.gamepadAxisIndex
						) {
							if (
								data.direction === "positive" &&
								axisValue > ACTIVATION_THRESHOLD / 2
							) {
								currentActivationLevel = Math.min(axisValue, 1);
							} else if (
								data.direction === "negative" &&
								axisValue < -ACTIVATION_THRESHOLD / 2
							) {
								currentActivationLevel = Math.min(
									absoluteValue,
									1,
								);
							}
						}

						if (isSelecting && restingAxes) {
							const restingValue = restingAxes[index] ?? 0;
							const delta = Math.abs(axisValue - restingValue);

							if (delta > DELTA_THRESHOLD) {
								const direction =
									axisValue - restingValue > 0
										? "positive"
										: "negative";
								const newData: AnalogInput = {
									type: "gamepad",
									gamepadAxisIndex: index,
									gamepadId: gamepad.id,
									direction: direction,
								};
								setData(newData);
								onChange(newData);
								setIsSelecting(false);
								setRestingAxisValues(new Map());
								currentActivationLevel = Math.min(
									absoluteValue,
									1,
								);
								return;
							}
						}
					});
					if (!isSelecting && data) return;
				});

			if (activationLevel !== currentActivationLevel || isSelecting) {
				setActivationLevel(currentActivationLevel);
			}

			if (
				data &&
				!Array.from(currentFrameGamepads).some(
					(gp) => gp?.id === data.gamepadId,
				)
			) {
				setActivationLevel(0);
			}
		}, 50);

		return () => {
			clearInterval(gamePadInterval);
			// Reset activation level on cleanup (when deps change or unmount)
			if (!isSelecting && !data) {
				setActivationLevel(0);
			}
		};
	}, [isSelecting, data, onChange, restingAxisValues, activationLevel]);

	const handleSelecting = () => {
		setIsSelecting(true);
		setData(null);
		setActivationLevel(0);

		const currentRestingValues = new Map<string, number[]>();
		navigator.getGamepads().forEach((gp) => {
			if (gp) {
				currentRestingValues.set(gp.id, [...gp.axes]);
			}
		});
		setRestingAxisValues(currentRestingValues);
	};

	const dynamicStyles: CSSProperties = {
		backgroundColor: `rgba(0, 155, 0, ${activationLevel * 0.2})`,
		transform: `scale(${1 + activationLevel * 0.1})`,
		transition: "background-color 0.05s ease-out, transform 0.05s ease-out",
	};

	return (
		<div style={{ width: "10rem" }}>
			<span
				className="bg-black/10 p-[5%] w-full rounded-[var(--radius)] border-[0.2rem] border-black/10 flex justify-center items-center select-none hover:bg-black/20 hover:scale-110 hover:cursor-pointer data-[active=true]:bg-green-600/20 dark:data-[active=true]:bg-green-500/20 data-[active=true]:scale-110 transition-all duration-100"
				onClick={handleSelecting}
				style={dynamicStyles}
			>
				{isSelecting ? (
					"move axis..."
				) : data ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-evenly",
							width: "100%",
						}}
					>
						<JoystickIcon />
						{`${getGamepadAxisName(data.gamepadAxisIndex)} ${data.direction === "positive" ? "+" : "-"}`}
					</div>
				) : (
					"<input>"
				)}
			</span>
		</div>
	);
};
