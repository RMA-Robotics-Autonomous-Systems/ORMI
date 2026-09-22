"use client";

/**
 * Zoom, pan and the shared playhead, for every time-domain EMI panel.
 *
 * The window and the playhead are shared state, so three panels showing the same
 * recording show the same slice of it and hovering any of them puts a cursor on
 * the other two. Keeping the gesture handling in one hook is what makes that
 * true by construction rather than by three implementations agreeing.
 *
 * This hook keeps the arithmetic that needs the DOM — pixels to seconds,
 * `getBoundingClientRect`, the drag-versus-click distinction, the rAF cursor
 * coalescing — and hands `applyGesture` an *intent*. Whether a gesture detaches
 * from the live edge or re-arms it is decided there, beside the state, and never
 * here: five consumers read the window and only this hook writes it, so this is
 * exactly where those rules would drift apart.
 *
 * Pointer moves are coalesced onto the frame: a pointer fires faster than a
 * canvas can be repainted, and every playhead write re-renders every widget
 * subscribed to the cursor.
 */

import { useCallback, useEffect, useRef } from "react";
import { useSetEmiCursor, useSetEmiView } from "../state/atoms";
import {
	applyGesture,
	WHEEL_PAN_FRACTION,
	type EmiView,
	type ViewGesture,
} from "../state/emi-view";
import { useEmiWindow } from "./use-emi-window";
import { PAD } from "../charts/canvas-chart";

/** What the hook hands back. */
export interface TimeGestures {
	/** Left edge of the visible window, seconds from run start. */
	vt0: number;
	/** Right edge. */
	vt1: number;
	/**
	 * What the window is doing: the whole run, riding the newest sample, or
	 * held where the operator put it.
	 *
	 * Reported instead of a `full` boolean because three states now drive the
	 * transport's controls, and two booleans that can disagree is the failure
	 * this replaced.
	 */
	mode: EmiView["mode"];
	/**
	 * The same window changes the gestures make, as callable actions.
	 *
	 * A transport and a wheel must not be two implementations of "zoom" that
	 * drift apart — every route to a window goes through `applyGesture` via
	 * these, which is why the buttons can never disagree with the chart.
	 */
	controls: {
		/**
		 * Multiply the visible span. `<1` zooms in.
		 *
		 * Passes **no anchor**: a button has no pointer, so it has nothing honest
		 * to name, and the reducer anchors it on what the operator is demonstrably
		 * attending to — the live edge while they are at it (`full`, `follow`, so
		 * that zooming starts following), and the window they placed while they
		 * are not (`pinned`, anchored on its centre in both directions). The wheel
		 * does state a place and keeps it.
		 */
		zoomBy: (factor: number) => void;
		/** Slide the window by a fraction of its own width. */
		panBy: (fraction: number) => void;
		/** Put the left edge at `fraction` of the whole run, keeping the width. */
		panTo: (fraction: number) => void;
		/** Back to the whole run. */
		reset: () => void;
		/** Jump to the newest sample and stay on it. */
		follow: () => void;
		/** Stop following: hold the window that is on screen now. */
		pin: () => void;
		/** Where the window starts, as a fraction of the run. Drives the slider. */
		offset: number;
	};
	/** Spread onto the panel's container. */
	handlers: {
		onPointerMove: (ev: React.PointerEvent<HTMLElement>) => void;
		onPointerDown: (ev: React.PointerEvent<HTMLElement>) => void;
		onPointerUp: (ev: React.PointerEvent<HTMLElement>) => void;
		onPointerCancel: (ev: React.PointerEvent<HTMLElement>) => void;
		onPointerLeave: () => void;
		onWheel: (ev: React.WheelEvent<HTMLElement>) => void;
		onDoubleClick: () => void;
	};
}

/** Options for {@link useTimeGestures}. */
export interface TimeGestureOptions {
	/** The element the gestures are measured against; null until it mounts. */
	host: HTMLElement | null;
	/** Time span of the whole run, seconds. */
	fullRange: [number, number];
	/** True once there is something to point at. */
	enabled: boolean;
	/**
	 * Resolve what the pointer is over, beyond the time.
	 *
	 * Called on the animation frame, with the pointer's offset inside the host,
	 * so a panel can name the detection under the cursor. Returning nothing
	 * leaves the cursor pointing at a time and nothing else.
	 */
	resolve?: (t: number, offsetY: number) => { det: number; target: number };
	/**
	 * A click — not a drag — landed on something {@link resolve} could name.
	 *
	 * Separated from the pan by movement, not by timing: the same pointer press
	 * both pans the window and picks a detection, and telling them apart by how
	 * far the pointer travelled is the only rule that never picks something the
	 * operator was dragging past.
	 */
	onPick?: (det: number, target: number) => void;
}

/** Pointer travel, in px, past which a press is a drag rather than a click. */
const CLICK_SLOP = 4;

/**
 * Wire zoom, pan and the playhead onto a panel.
 *
 * @param options - Host element, run extent, and an optional hit-test.
 * @returns The visible window and the handlers to spread onto the host.
 */
export function useTimeGestures(options: TimeGestureOptions): TimeGestures {
	const { host, fullRange, enabled, resolve, onPick } = options;
	const setView = useSetEmiView();
	const setCursor = useSetEmiCursor();

	const [f0, f1] = fullRange;
	const { t0: vt0, t1: vt1, mode } = useEmiWindow(fullRange);

	/**
	 * Hand the reducer an intent.
	 *
	 * Through the updater form, so the decision is taken against whatever the
	 * shared state holds at the moment of the gesture rather than what this
	 * render closed over — five panels write this atom.
	 */
	const dispatch = useCallback(
		(g: ViewGesture) => setView((prev) => applyGesture(prev, fullRange, g)),
		[fullRange, setView],
	);

	const rafRef = useRef<number>(0);
	const dragRef = useRef<{ x: number; t0: number; t1: number } | null>(null);
	/** Where a press started, and whether it has since travelled far enough to be a drag. */
	const pressRef = useRef<{ x: number; y: number; moved: boolean } | null>(
		null,
	);

	useEffect(
		() => () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		},
		[],
	);

	/** Time under a client x coordinate, or null outside the plot area. */
	const timeAt = useCallback(
		(clientX: number): number | null => {
			if (!host) return null;
			const rect = host.getBoundingClientRect();
			const x = clientX - rect.left;
			const plotW = rect.width - PAD.l - PAD.r;
			if (plotW <= 0 || x < PAD.l || x > rect.width - PAD.r) return null;
			return vt0 + ((x - PAD.l) / plotW) * (vt1 - vt0);
		},
		[host, vt0, vt1],
	);

	const hover = useCallback(
		(ev: React.PointerEvent<HTMLElement>) => {
			if (!enabled) return;
			const t = timeAt(ev.clientX);
			if (t == null) return;
			const clientY = ev.clientY;
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			rafRef.current = requestAnimationFrame(() => {
				const offsetY = host
					? clientY - host.getBoundingClientRect().top
					: 0;
				const hit = resolve?.(t, offsetY);
				setCursor({
					t,
					det: hit?.det ?? -1,
					target: hit?.target ?? -1,
				});
			});
		},
		[enabled, host, resolve, setCursor, timeAt],
	);

	const onPointerMove = useCallback(
		(ev: React.PointerEvent<HTMLElement>) => {
			const press = pressRef.current;
			if (
				press &&
				!press.moved &&
				(Math.abs(ev.clientX - press.x) > CLICK_SLOP ||
					Math.abs(ev.clientY - press.y) > CLICK_SLOP)
			) {
				press.moved = true;
			}
			const drag = dragRef.current;
			if (!drag) {
				hover(ev);
				return;
			}
			if (!host) return;
			// The same measurement `timeAt` uses: `clientWidth` is
			// border-excluded and integer-rounded, so mixing the two makes the
			// playhead drift from the content under the pointer during a pan.
			const plotW = host.getBoundingClientRect().width - PAD.l - PAD.r;
			if (plotW <= 0) return;
			const width = drag.t1 - drag.t0;
			const dt = ((ev.clientX - drag.x) / plotW) * width;
			// The request goes out **unclamped**. That is what lets a drag to
			// the newest sample re-arm following: a request already clamped
			// into the run can no longer say that it reached the end.
			dispatch({ kind: "panTo", t0: drag.t0 - dt });
		},
		[dispatch, host, hover],
	);

	const onPointerDown = useCallback(
		(ev: React.PointerEvent<HTMLElement>) => {
			if (ev.button !== 0 || !enabled) return;
			pressRef.current = { x: ev.clientX, y: ev.clientY, moved: false };
			// Panning only means anything once the run is zoomed into.
			if (vt1 - vt0 >= f1 - f0 - 1e-9) return;
			dragRef.current = { x: ev.clientX, t0: vt0, t1: vt1 };
			ev.currentTarget.setPointerCapture(ev.pointerId);
		},
		[enabled, f0, f1, vt0, vt1],
	);

	const onPointerUp = useCallback(
		(ev: React.PointerEvent<HTMLElement>) => {
			const press = pressRef.current;
			pressRef.current = null;

			// A press that never travelled is a pick. Resolved here rather than
			// read off the shared cursor: the cursor is written on an animation
			// frame and a fast click can land before that frame has run.
			if (press && !press.moved && onPick && enabled) {
				const t = timeAt(ev.clientX);
				if (t != null) {
					const offsetY = host
						? ev.clientY - host.getBoundingClientRect().top
						: 0;
					const hit = resolve?.(t, offsetY);
					if (hit && (hit.det >= 0 || hit.target >= 0)) {
						onPick(hit.det, hit.target);
					}
				}
			}

			if (!dragRef.current) return;
			dragRef.current = null;
			if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
				ev.currentTarget.releasePointerCapture(ev.pointerId);
			}
		},
		[enabled, host, onPick, resolve, timeAt],
	);

	const onPointerLeave = useCallback(() => {
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		setCursor(null);
	}, [setCursor]);

	const zoomBy = useCallback(
		(factor: number) => {
			// No anchor, deliberately: a button has no pointer, so the only
			// honest place to anchor is the one the mode implies, and the
			// reducer is where the mode lives. Passing `f1` from here and
			// letting the reducer override it would be a value invented by a
			// caller that cannot know — and it is what sent an operator
			// studying a detection mid-run to the end of the survey the moment
			// they pressed zoom-out for context.
			dispatch({ kind: "zoomTo", width: (vt1 - vt0) * factor });
		},
		[dispatch, vt0, vt1],
	);

	const panBy = useCallback(
		(fraction: number) => {
			dispatch({ kind: "panTo", t0: vt0 + (vt1 - vt0) * fraction });
		},
		[dispatch, vt0, vt1],
	);

	const panTo = useCallback(
		(fraction: number) => {
			// At fraction 1 this asks for `t0 = f1 - width`, so the request
			// lands exactly on the newest sample and the reducer re-arms
			// following — the slider's far end needs no special case.
			const width = vt1 - vt0;
			dispatch({ kind: "panTo", t0: f0 + (f1 - f0 - width) * fraction });
		},
		[dispatch, f0, f1, vt0, vt1],
	);

	const onWheel = useCallback(
		(ev: React.WheelEvent<HTMLElement>) => {
			if (!enabled) return;
			const span = f1 - f0;
			if (!(span > 0)) return;
			const width = vt1 - vt0;

			// Sideways wheel, or shift held: scrub along the run at a fixed
			// zoom. A trackpad reports this as `deltaX`; a mouse with one wheel
			// reports `deltaY` and needs the modifier. Both mean "move", and
			// neither should change how much of the run is on screen — which is
			// the whole reason scrubbing is a separate gesture from zooming.
			const sideways = Math.abs(ev.deltaX) > Math.abs(ev.deltaY);
			if (sideways || ev.shiftKey) {
				const delta = sideways ? ev.deltaX : ev.deltaY;
				panBy(delta * WHEEL_PAN_FRACTION);
				return;
			}

			const t = timeAt(ev.clientX);
			if (t == null) return;
			// The wheel keeps the **pointer** anchor, unlike the buttons: a
			// wheel over mid-run says "look here", not "look at the end", so
			// zooming there correctly resolves to `pinned`.
			//
			// Exponential in the wheel delta: a linear zoom spends nine tenths
			// of its travel between "the whole run" and "half the run".
			dispatch({
				kind: "zoomTo",
				width: width * Math.exp(ev.deltaY * 0.0015),
				anchor: { t, fraction: (t - vt0) / width },
			});
		},
		[dispatch, enabled, f0, f1, panBy, timeAt, vt0, vt1],
	);

	const onDoubleClick = useCallback(
		() => dispatch({ kind: "reset" }),
		[dispatch],
	);

	const follow = useCallback(() => dispatch({ kind: "follow" }), [dispatch]);

	const pin = useCallback(() => dispatch({ kind: "pin" }), [dispatch]);

	const width = vt1 - vt0;
	const room = f1 - f0 - width;

	return {
		vt0,
		vt1,
		mode,
		controls: {
			zoomBy,
			panBy,
			panTo,
			reset: onDoubleClick,
			follow,
			pin,
			offset: room > 1e-9 ? (vt0 - f0) / room : 0,
		},
		handlers: {
			onPointerMove,
			onPointerDown,
			onPointerUp,
			// A cancelled pointer — a touch interrupted by a browser gesture, a
			// pen leaving range — never fires `pointerup`, so without this the
			// drag stays armed and the next move pans the *shared* window with
			// no button held, dragging every EMI panel on the page.
			onPointerCancel: onPointerUp,
			onPointerLeave,
			onWheel,
			onDoubleClick,
		},
	};
}
