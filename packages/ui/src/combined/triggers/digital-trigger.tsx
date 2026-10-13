"use client";
import React, { useCallback, useRef } from "react";

import { GamepadIcon, KeyboardIcon } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { DigitalInput, getGamepadButtonName } from "./digital-trigger-input";
import { TRIGGER_CHIP_WIDTH, triggerChipVariants } from "./trigger-chip";
import { useDigitalTrigger } from "./use-digital-trigger";
import { usePointerHold } from "./use-pointer-hold";

interface DigitalInputComponentProps {
	onActive: (value: number) => void;
	onInactive: (value: number) => void;

	digitalInput: DigitalInput;
}

export const DigitalComponent = (props: DigitalInputComponentProps) => {
	const { onActive, onInactive, digitalInput } = props;
	const data = digitalInput;
	// A gamepad poll must not release a press a pointer is holding.
	const isPointerHeldRef = useRef(false);

	const { isActive, activate, deactivate } = useDigitalTrigger({
		digitalInput,
		onActive,
		onInactive,
		isGamepadBlocked: () => isPointerHeldRef.current,
	});

	const press = useCallback(() => {
		isPointerHeldRef.current = true;
		activate(1);
	}, [activate]);
	const release = useCallback(() => {
		isPointerHeldRef.current = false;
		deactivate(0);
	}, [deactivate]);
	const { holdProps } = usePointerHold({
		onPress: press,
		onRelease: release,
	});

	return (
		<div className={TRIGGER_CHIP_WIDTH}>
			{/* Use isActive state for visual feedback */}
			<span
				data-active={isActive}
				// `touch-none` keeps a held finger a press: without it the
				// browser takes the touch for scrolling and cancels the hold.
				className={cn(
					triggerChipVariants({
						active: isActive,
						interactive: true,
					}),
					"touch-none any-pointer-coarse:min-h-11",
				)}
				{...holdProps}
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
