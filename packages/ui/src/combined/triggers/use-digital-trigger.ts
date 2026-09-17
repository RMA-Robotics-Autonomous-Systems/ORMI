"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DigitalInput } from "./digital-trigger-input";
import {
	isSafeRobotControlKeyEvent,
	type GuardScope,
} from "@workspace/ui/lib/input-guards";

const DEFAULT_GAMEPAD_THRESHOLD = 0.1;

/** Whether a keyboard event is the key this binding listens for. */
function matchesBoundKey(
	digitalInput: DigitalInput,
	event: Pick<KeyboardEvent, "key">,
): boolean {
	return (
		digitalInput.type === "keyboard" &&
		Boolean(digitalInput.key) &&
		event.key.toLowerCase() === digitalInput.key!.toLowerCase()
	);
}

/** Inputs to the keydown decision, hoisted out of the hook so it is testable. */
export interface KeyDownDecisionInput {
	/** The keyboard event under consideration. */
	event: KeyboardEvent;
	/** The binding this trigger listens for. */
	digitalInput: DigitalInput;
	/** True while the trigger is already held (by any input source). */
	isActive: boolean;
	/** Deliberate opt-out from the typing/modal guard. */
	allowKeyboardWhileTyping?: boolean;
	/** Optional extra narrowing applied after the guard. */
	shouldHandleKeyboardEvent?: (event: KeyboardEvent) => boolean;
	/** Document to evaluate the guard against. Defaults to the ambient one. */
	scope?: GuardScope;
}

/**
 * Decides whether a keydown may start this trigger.
 *
 * The typing/modal guard is applied unless {@link
 * KeyDownDecisionInput.allowKeyboardWhileTyping} is explicitly set, so a bound
 * character typed into a search box, a config field or an open dialog never
 * reaches whatever the trigger publishes.
 *
 * @param input - Event, binding, current state and guard configuration.
 * @returns `true` when the trigger should activate.
 */
export function shouldActivateOnKeyDown(input: KeyDownDecisionInput): boolean {
	const {
		event,
		digitalInput,
		isActive,
		allowKeyboardWhileTyping = false,
		shouldHandleKeyboardEvent,
		scope,
	} = input;

	if (!matchesBoundKey(digitalInput, event)) return false;

	if (
		!allowKeyboardWhileTyping &&
		!isSafeRobotControlKeyEvent(
			event,
			scope ?? (typeof document === "undefined" ? undefined : document),
		)
	) {
		return false;
	}

	if (shouldHandleKeyboardEvent && !shouldHandleKeyboardEvent(event)) {
		return false;
	}

	return !isActive;
}

/**
 * Decides whether a keyup may release this trigger.
 *
 * Symmetric with {@link shouldActivateOnKeyDown} by *state* rather than by
 * predicate: a release is honoured only for a press the keydown path actually
 * started, so a key press the guard rejected produces no release either.
 * Re-testing the guard here would be unsafe — focus can move into a text field
 * while a key is held, and a suppressed release would strand the control
 * active with a robot still moving.
 *
 * @param input - Event, binding, and whether a keyboard press is held.
 * @returns `true` when the trigger should deactivate.
 */
export function shouldDeactivateOnKeyUp(input: {
	event: Pick<KeyboardEvent, "key">;
	digitalInput: DigitalInput;
	isKeyboardHeld: boolean;
}): boolean {
	const { event, digitalInput, isKeyboardHeld } = input;
	return matchesBoundKey(digitalInput, event) && isKeyboardHeld;
}

export interface UseDigitalTriggerOptions {
	digitalInput: DigitalInput | null | undefined;
	onActive: (value: number) => void;
	onInactive: (value: number) => void;
	enabled?: boolean;
	gamepadThreshold?: number;
	/**
	 * Extra narrowing on top of the built-in typing/modal guard. It can only
	 * reject a key press the guard already accepted — it can never re-admit
	 * one the guard rejected.
	 */
	shouldHandleKeyboardEvent?: (event: KeyboardEvent) => boolean;
	/**
	 * Deliberate opt-out from the typing/modal guard.
	 *
	 * Only for bindings that genuinely must fire while a field has focus or a
	 * dialog is open (a binding picker, an editor-local shortcut). Anything
	 * that reaches a robot leaves this `false`.
	 *
	 * @defaultValue false
	 */
	allowKeyboardWhileTyping?: boolean;
	isGamepadBlocked?: () => boolean;
}

export interface UseDigitalTriggerResult {
	isActive: boolean;
	activate: (value?: number) => void;
	deactivate: (value?: number) => void;
}

/**
 * Binds a keyboard key or gamepad button to an activate/deactivate pair.
 *
 * The keyboard half is guarded by default: a bound key is ignored while the
 * operator is typing in a field or while a modal dialog is open. Callers that
 * publish to a robot topic must not weaken that — see
 * {@link UseDigitalTriggerOptions.allowKeyboardWhileTyping}.
 *
 * @param options - Binding, callbacks and guard configuration.
 * @returns Current active state plus manual activate/deactivate handles for
 * pointer-driven use.
 */
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
		allowKeyboardWhileTyping = false,
		isGamepadBlocked,
	} = options;

	const [isActive, setIsActive] = useState(false);
	const isActiveRef = useRef(isActive);
	const previousValueRef = useRef<number | null>(null);
	// True only while a press this hook started from the keyboard is held.
	const isKeyboardHeldRef = useRef(false);

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
				!shouldActivateOnKeyDown({
					event,
					digitalInput,
					isActive: isActiveRef.current,
					allowKeyboardWhileTyping,
					shouldHandleKeyboardEvent,
				})
			) {
				return;
			}

			isKeyboardHeldRef.current = true;
			activate(1);
		};

		const keyUpEvent = (event: KeyboardEvent) => {
			if (
				!shouldDeactivateOnKeyUp({
					event,
					digitalInput,
					isKeyboardHeld: isKeyboardHeldRef.current,
				})
			) {
				return;
			}

			isKeyboardHeldRef.current = false;
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
			isKeyboardHeldRef.current = false;
			deactivate(0);
		};
	}, [
		enabled,
		digitalInput,
		activate,
		deactivate,
		gamepadThreshold,
		shouldHandleKeyboardEvent,
		allowKeyboardWhileTyping,
		isGamepadBlocked,
	]);

	return {
		isActive,
		activate,
		deactivate,
	};
}
