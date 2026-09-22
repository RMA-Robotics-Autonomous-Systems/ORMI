"use client";

/**
 * The resolved time window, for every panel that needs one.
 *
 * Five consumers read the shared window and three of them used to derive it
 * themselves from `view ? view.t0 : extent[0]`. With one nullable window that
 * duplication was merely repetitive; with three modes it is a real disagreement
 * risk — a panel that forgets `follow` draws a window the panel beside it is not
 * drawing, on shared state, and the operator sees two charts claiming to show
 * the same slice of the same recording.
 *
 * So the resolution happens once, here, and every consumer calls this.
 */

import { useMemo } from "react";
import { useEmiView } from "../state/atoms";
import { resolveWindow, type ResolvedWindow } from "../state/emi-view";

/**
 * The shared window, resolved against a run's extent.
 *
 * @param extent - `[first, last]` sample time of the run, seconds.
 * @returns The window to draw and the mode it came from.
 */
export function useEmiWindow(
	extent: readonly [number, number],
): ResolvedWindow {
	const view = useEmiView();
	// Memoised for identity, not for cost: the window is handed to gesture
	// callbacks and canvas effects that key on what they were given.
	return useMemo(() => resolveWindow(view, extent), [view, extent]);
}
