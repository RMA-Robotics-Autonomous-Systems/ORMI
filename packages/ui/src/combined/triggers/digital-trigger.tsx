"use client";
import React, { useRef } from "react";

import { GamepadIcon, KeyboardIcon } from "lucide-react";
import { DigitalInput, getGamepadButtonName } from "./digital-trigger-input";
import { TRIGGER_CHIP_WIDTH, triggerChipVariants } from "./trigger-chip";
import { useDigitalTrigger } from "./use-digital-trigger";

interface DigitalInputComponentProps {
	onActive: (value: number) => void;
	onInactive: (value: number) => void;

	digitalInput: DigitalInput;
}

export const DigitalComponent = (props: DigitalInputComponentProps) => {
	const { onActive, onInactive, digitalInput } = props;
	const data = digitalInput;
	const isMouseDownRef = useRef(false); // Ref to track mouse down state

	const { isActive, activate, deactivate } = useDigitalTrigger({
		digitalInput,
		onActive,
		onInactive,
		isGamepadBlocked: () => isMouseDownRef.current,
	});

	const handMouseDown = () => {
		isMouseDownRef.current = true; // Set mouse down state
		activate(1);
	};

	const handMouseUp = () => {
		isMouseDownRef.current = false; // Reset mouse down state
		deactivate(0);
	};

	return (
		<div className={TRIGGER_CHIP_WIDTH}>
			{/* Use isActive state for visual feedback */}
			<span
				data-active={isActive}
				className={triggerChipVariants({
					active: isActive,
					interactive: true,
				})}
				onMouseDown={handMouseDown}
				onMouseUp={handMouseUp}
			>
				{data?.type === "keyboard" ? (
					<>
						<KeyboardIcon />
						{data.key?.toUpperCase()}
					</>
				) : data?.type === "gamepad" ? (
					<>
						<GamepadIcon />
						{/* Ensure button index is defined before calling helper */}
						{data.gamepadButtonIndex !== undefined
							? getGamepadButtonName(data.gamepadButtonIndex)
							: "N/A"}
					</>
				) : (
					// Handle case where data might be null or type is unexpected
					"N/A"
				)}
			</span>
		</div>
	);
};
