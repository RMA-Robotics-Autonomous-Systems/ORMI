"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from "react";

/** The part of a pointer event the hold decisions read. */
export type PointerHoldEvent = Pick<
	PointerEvent,
	"pointerId" | "pointerType" | "button"
>;

/**
 * Decides whether a pointer press may start a hold.
 *
 * One pointer owns a hold from press to release: a second finger landing on
 * the same control is ignored, so lifting it cannot end a hold the first finger
 * still has. A mouse starts one with its primary button only.
 *
 * @param heldPointerId - Pointer currently holding the control, if any.
 * @param event - The `pointerdown` under consideration.
 * @returns `true` when the hold should start.
 */
export function shouldStartPointerHold(
	heldPointerId: number | null,
	event: PointerHoldEvent,
): boolean {
	if (heldPointerId !== null) return false;
	return event.pointerType !== "mouse" || event.button === 0;
}

/**
 * Decides whether a pointer event ends the current hold.
 *
 * @param heldPointerId - Pointer currently holding the control, if any.
 * @param event - A `pointerup`, `pointercancel` or `lostpointercapture`.
 * @returns `true` when the event belongs to the pointer that started the hold.
 */
export function shouldEndPointerHold(
	heldPointerId: number | null,
	event: Pick<PointerHoldEvent, "pointerId">,
): boolean {
	return heldPointerId !== null && heldPointerId === event.pointerId;
}

/** Options for {@link usePointerHold}. */
export interface UsePointerHoldOptions {
	/** The control went down under a mouse, finger or pen. */
	onPress: () => void;
	/** The press ended, by release, cancellation or unmount. */
	onRelease: () => void;
}

/** Handlers to spread on the element that is pressed and held. */
export interface PointerHoldProps {
	onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
	onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
	onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
	onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
	onContextMenu: (event: SyntheticEvent) => void;
}

/** Result of {@link usePointerHold}. */
export interface UsePointerHoldResult {
	/** Handlers for the held element. Pair them with `touch-none select-none`. */
	holdProps: PointerHoldProps;
}

/**
 * Press-and-hold for an on-screen control, under mouse, touch and pen alike.
 *
 * Mouse events cannot do this on a touchscreen: the browser synthesises
 * `mousedown` and `mouseup` together once the finger has lifted, so a held
 * finger is a zero-length click. They also lose the release whenever the
 * pointer leaves the element first, which strands the control active. Pointer
 * events with capture deliver the release to the element that took the press,
 * wherever the pointer is by then, and every way a press can end without one
 * (`pointercancel`, a lost capture, the element unmounting) releases too.
 *
 * The element needs `touch-action: none`, or the browser claims the touch for
 * scrolling and cancels the press a few pixels into any drift.
 *
 * @param options - Press and release callbacks.
 * @returns Handlers for the element.
 */
export function usePointerHold(
	options: UsePointerHoldOptions,
): UsePointerHoldResult {
	const { onPress, onRelease } = options;

	const heldPointerIdRef = useRef<number | null>(null);
	const callbacksRef = useRef({ onPress, onRelease });
	useEffect(() => {
		callbacksRef.current = { onPress, onRelease };
	}, [onPress, onRelease]);

	// A hold that is still open when the element goes away ends here.
	useEffect(() => {
		return () => {
			if (heldPointerIdRef.current === null) return;
			heldPointerIdRef.current = null;
			callbacksRef.current.onRelease();
		};
	}, []);

	const onPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			if (!shouldStartPointerHold(heldPointerIdRef.current, event)) {
				return;
			}

			heldPointerIdRef.current = event.pointerId;
			try {
				event.currentTarget.setPointerCapture(event.pointerId);
			} catch {
				// The pointer is already gone. Its release still reaches the
				// element when it happens over it, as it did before capture.
			}
			callbacksRef.current.onPress();
		},
		[],
	);

	const endHold = useCallback((event: ReactPointerEvent<HTMLElement>) => {
		if (!shouldEndPointerHold(heldPointerIdRef.current, event)) return;
		heldPointerIdRef.current = null;
		callbacksRef.current.onRelease();
	}, []);

	// A long press is a right-click on Windows touchscreens and opens a menu
	// over the control on Android.
	const onContextMenu = useCallback((event: SyntheticEvent) => {
		event.preventDefault();
	}, []);

	return {
		holdProps: {
			onPointerDown,
			onPointerUp: endHold,
			onPointerCancel: endHold,
			onLostPointerCapture: endHold,
			onContextMenu,
		},
	};
}
