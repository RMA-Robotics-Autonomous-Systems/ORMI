"use client";
import React, { useRef } from "react";

import { GamepadIcon, KeyboardIcon } from "lucide-react";
import { DigitalInput, getGamepadButtonName } from "./digital-trigger-input";
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
		<div style={{ width: "10rem" }}>
			{/* Use isActive state for visual feedback */}
			<span
				data-active={isActive}
				className="bg-black/10 p-[5%] w-full rounded-[var(--radius)] border-[0.2rem] border-black/10 flex justify-center items-center select-none hover:bg-black/20 hover:scale-110 hover:cursor-pointer data-[active=true]:bg-green-600/20 data-[active=true]:scale-110 transition-all duration-100"
				onMouseDown={handMouseDown}
				onMouseUp={handMouseUp}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-evenly",
						width: "100%",
					}}
				>
					{/* Check data exists before accessing properties */}
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
				</div>
			</span>
		</div>
	);
};
