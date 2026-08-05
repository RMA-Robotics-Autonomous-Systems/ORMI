"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Pure in-flight guard used by {@link useAsyncAction}.
 *
 * Holds a synchronous latch (`inFlight`) and runs an async function under it:
 * the first call latches before awaiting; every re-entrant call while a run is
 * in flight is dropped (returns immediately). `onPendingChange` mirrors the
 * latch state for display (the React hook wires it to `setState`).
 *
 * Extracted as a plain function — independent of React — so the re-entry
 * semantics ("a second call while pending is a no-op") are unit-testable without
 * a DOM/renderer.
 *
 * @typeParam K - The action-key type.
 * @param latch - Mutable single-field box acting as the synchronous guard.
 * @param onPendingChange - Called with the active key (or `null`) as it changes.
 * @returns A `run(key, fn)` function honoring the guard.
 */
export function createAsyncActionRunner<K extends string>(
	latch: { inFlight: boolean },
	onPendingChange: (pending: K | null) => void,
): (key: K, fn: () => Promise<void>) => Promise<void> {
	return async (key, fn) => {
		if (latch.inFlight) return;
		latch.inFlight = true;
		onPendingChange(key);
		try {
			await fn();
		} finally {
			latch.inFlight = false;
			onPendingChange(null);
		}
	};
}

/**
 * In-flight guard for one-shot async UI actions (mission lifecycle commands,
 * Save, Delete, …).
 *
 * The mission widgets fire remote calls on click. Without a guard a fast
 * double-click — or a click on a *second* action before the first resolves —
 * dispatches the same (or a conflicting) command twice, because React state
 * updates are asynchronous: `disabled` derived from a `useState` busy flag does
 * not take effect until the next render, leaving a window in which the handler
 * is re-entrant.
 *
 * This hook closes that window with a **synchronous** ref guard: the first call
 * latches the ref before awaiting, and every re-entrant call returns immediately
 * until the in-flight promise settles. The `pending` state is the *display*
 * mirror (drives spinners / disabled styling); the ref is the *correctness*
 * mechanism and does not depend on a render landing first.
 *
 * `pending` carries the in-flight action key so a widget with several buttons
 * can render the spinner on the clicked one while disabling all of them
 * (`pending !== null`). For a single-action widget use a literal key (e.g.
 * `"save"`); the `null`/non-null distinction is all that matters there.
 *
 * @typeParam K - The action-key type (a string-literal union, or `string`).
 * @returns `{ pending, run }` where `pending` is the in-flight key (or `null`),
 *   and `run(key, fn)` executes `fn` unless an action is already in flight.
 */
export function useAsyncAction<K extends string = string>(): {
	/** The in-flight action key, or `null` when idle. */
	pending: K | null;
	/**
	 * Run `fn` under the in-flight guard. A no-op (returns immediately) when an
	 * action is already in flight. `pending` is set to `key` for the duration and
	 * cleared once `fn` settles (resolve or reject).
	 */
	run: (key: K, fn: () => Promise<void>) => Promise<void>;
} {
	const [pending, setPending] = useState<K | null>(null);
	// Synchronous re-entry latch — set/cleared without waiting for a render, so a
	// double-click can't slip a second dispatch through before `pending` updates.
	const latch = useRef({ inFlight: false });

	const run = useCallback(
		(key: K, fn: () => Promise<void>) =>
			createAsyncActionRunner<K>(latch.current, setPending)(key, fn),
		[],
	);

	return { pending, run };
}
