"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DigitalInput } from "./digital-trigger-input";

const DEFAULT_GAMEPAD_THRESHOLD = 0.1;

export interface UseDigitalTriggerOptions {
	digitalInput: DigitalInput | null | undefined;
	onActive: (value: number) => void;
	onInactive: (value: number) => void;
	enabled?: boolean;
	gamepadThreshold?: number;
	shouldHandleKeyboardEvent?: (event: KeyboardEvent) => boolean;
	isGamepadBlocked?: () => boolean;
}

export interface UseDigitalTriggerResult {
	isActive: boolean;
	activate: (value?: number) => void;
	deactivate: (value?: number) => void;
}

export function useDigitalTrigger(
	options: UseDigitalTriggerOptions,
): UseDigitalTriggerResult {
	const {
		digitalInput,
		onActive,
		onInactive,
		enabled = true,
		gamepadThreshold = DEFAULT_GAMEPAD_THRESHOLD,
		shouldHandleKeyboardEvent,
		isGamepadBlocked,
	} = options;

	const [isActive, setIsActive] = useState(false);
	const isActiveRef = useRef(isActive);
	const previousValueRef = useRef<number | null>(null);

	useEffect(() => {
		isActiveRef.current = isActive;
	}, [isActive]);

	const activate = useCallback(
		(value = 1) => {
			if (!isActiveRef.current) {
				setIsActive(true);
			}
			onActive(value);
			previousValueRef.current = value;
		},
		[onActive],
	);

	const deactivate = useCallback(
		(value = 0) => {
			if (!isActiveRef.current) return;
			setIsActive(false);
			onInactive(value);
			previousValueRef.current = null;
		},
		[onInactive],
	);

	useEffect(() => {
		if (!enabled || !digitalInput) {
			return;
		}

		const keyPressEvent = (event: KeyboardEvent) => {
			if (
				digitalInput.type !== "keyboard" ||
				!digitalInput.key ||
				event.key.toLowerCase() !== digitalInput.key.toLowerCase()
			) {
				return;
			}

			if (
				shouldHandleKeyboardEvent &&
				!shouldHandleKeyboardEvent(event)
			) {
				return;
			}

			if (!isActiveRef.current) {
				activate(1);
			}
		};

		const keyUpEvent = (event: KeyboardEvent) => {
			if (
				digitalInput.type !== "keyboard" ||
				!digitalInput.key ||
				event.key.toLowerCase() !== digitalInput.key.toLowerCase()
			) {
				return;
			}

			deactivate(0);
		};

		const gamePadInterval = setInterval(() => {
			if (
				digitalInput.type !== "gamepad" ||
				digitalInput.gamepadButtonIndex === undefined
			) {
				return;
			}

			if (isGamepadBlocked?.()) {
				return;
			}

			const currentFrameGamepads = navigator.getGamepads();
			const targetGamepad = Array.from(currentFrameGamepads).find(
				(gp) => gp?.id === digitalInput.gamepadId,
			);

			if (!targetGamepad) {
				deactivate(0);
				return;
			}

			const button =
				targetGamepad.buttons[digitalInput.gamepadButtonIndex];
			if (!button) {
				deactivate(0);
				return;
			}

			const currentValue = button.value;
			const pressed = currentValue > gamepadThreshold;

			if (pressed) {
				if (
					!isActiveRef.current ||
					currentValue !== previousValueRef.current
				) {
					activate(currentValue);
				}
				return;
			}

			deactivate(0);
		}, 50);

		window.addEventListener("keydown", keyPressEvent);
		window.addEventListener("keyup", keyUpEvent);

		return () => {
			window.removeEventListener("keydown", keyPressEvent);
			window.removeEventListener("keyup", keyUpEvent);
			clearInterval(gamePadInterval);
			deactivate(0);
		};
	}, [
		enabled,
		digitalInput,
		activate,
		deactivate,
		gamepadThreshold,
		shouldHandleKeyboardEvent,
		isGamepadBlocked,
	]);

	return {
		isActive,
		activate,
		deactivate,
	};
}
