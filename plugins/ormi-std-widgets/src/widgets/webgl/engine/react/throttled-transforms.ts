"use client";
/**
 * Rate-capped view over the core transform table for the 3D viewer.
 *
 * A `ws://` (main-thread, no worker) Foxglove source can push TF at 20 Hz. Each
 * bump drives a full-scene transform re-resolve ({@link SceneEngine.applyTransforms})
 * and a full React re-render of the transform-tree — human-perceptible motion does
 * not need 20 Hz React reconciliation. This module sits between
 * `subscribeToTransforms`/`getTransformTableSnapshot` and the React consumers and
 * caps the *re-processing* rate to {@link TF_THROTTLE_MS} while never dropping the
 * latest table:
 *
 * - **Leading edge** — the first bump after an idle window publishes immediately.
 * - **Trailing edge** — bumps inside the window coalesce into a single deferred
 *   publish that reads the *current* core snapshot when it fires, so the freshest
 *   table always lands. Steady-state data stays fresh; only the cadence is capped.
 *
 * The published snapshot keeps the core snapshot's identity contract: the **same**
 * `Map` instance between publishes and a **fresh** instance on each publish, so it
 * is a valid `useSyncExternalStore` snapshot and a real `useMemo` dependency. The
 * React Compiler therefore keeps derived memos fresh (never a frozen version-keyed
 * memo — see `packages/ormi-core/src/transforms/transform-hooks.tsx`).
 *
 * One shared singleton governs every consumer, so the engine re-resolve and the
 * transform-tree re-render advance in lockstep at the same capped cadence.
 */

import { useMemo, useSyncExternalStore } from "react";
import {
	getServerTransformTableSnapshot,
	getTransformTableSnapshot,
	selectWorldFrames,
	subscribeToTransforms,
} from "@workspace/ormi-core/transforms";
import type { TransformTable, WorldFrame } from "@workspace/ormi-core/types";

/** Re-processing cadence cap for TF-driven scene work (~13.3 Hz). */
export const TF_THROTTLE_MS = 75;

/** Minimal external store the throttle wraps (the core transform table by default). */
export interface TransformSource {
	subscribe: (callback: () => void) => () => void;
	getSnapshot: () => TransformTable;
}

/** A `useSyncExternalStore`-compatible store with stable `subscribe`/`getSnapshot`. */
export interface ThrottledTransformStore {
	subscribe: (callback: () => void) => () => void;
	getSnapshot: () => TransformTable;
}

/** Opaque timer handle produced by the throttle's scheduler. */
type TimerHandle = ReturnType<typeof setTimeout>;

/** Injectable clock + timers (defaulting to the platform ones; overridden in tests). */
export interface ThrottleTimers {
	now: () => number;
	setTimer: (callback: () => void, ms: number) => TimerHandle;
	clearTimer: (handle: TimerHandle) => void;
}

const defaultTimers: ThrottleTimers = {
	now: () =>
		typeof performance !== "undefined" ? performance.now() : Date.now(),
	setTimer: (callback, ms) => setTimeout(callback, ms),
	clearTimer: (handle) => clearTimeout(handle),
};

/**
 * Build a leading+trailing throttle over a {@link TransformSource}.
 *
 * The returned `getSnapshot` yields the last *published* table (identity-stable
 * between publishes); `subscribe` attaches to the source lazily on the first
 * listener and detaches on the last. The trailing publish always re-reads
 * `source.getSnapshot()`, guaranteeing the most recent table is never dropped.
 *
 * @param source - Underlying transform store.
 * @param intervalMs - Minimum spacing between publishes.
 * @param timers - Injectable clock/timers (defaults to the platform ones).
 */
export function createThrottledTransformStore(
	source: TransformSource,
	intervalMs: number,
	timers: ThrottleTimers = defaultTimers,
): ThrottledTransformStore {
	const { now, setTimer, clearTimer } = timers;
	let published = source.getSnapshot();
	let lastPublish = Number.NEGATIVE_INFINITY;
	let trailingTimer: TimerHandle | null = null;
	let sourceUnsub: (() => void) | null = null;
	const listeners = new Set<() => void>();

	const publish = (): void => {
		lastPublish = now();
		if (trailingTimer !== null) {
			clearTimer(trailingTimer);
			trailingTimer = null;
		}
		// Re-read the source: the freshest table is the one that must land.
		const latest = source.getSnapshot();
		if (latest === published) return;
		published = latest;
		for (const listener of listeners) listener();
	};

	const onSourceChange = (): void => {
		const elapsed = now() - lastPublish;
		if (elapsed >= intervalMs) {
			publish();
		} else if (trailingTimer === null) {
			trailingTimer = setTimer(publish, intervalMs - elapsed);
		}
		// Else a trailing publish is already scheduled; it will read the latest
		// snapshot when it fires, so intermediate bumps coalesce without loss.
	};

	const subscribe = (listener: () => void): (() => void) => {
		listeners.add(listener);
		if (sourceUnsub === null) {
			// First listener: sync to the current table and open a fresh window so
			// the next bump publishes on the leading edge.
			published = source.getSnapshot();
			lastPublish = Number.NEGATIVE_INFINITY;
			sourceUnsub = source.subscribe(onSourceChange);
		}
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) {
				sourceUnsub?.();
				sourceUnsub = null;
				if (trailingTimer !== null) {
					clearTimer(trailingTimer);
					trailingTimer = null;
				}
			}
		};
	};

	const getSnapshot = (): TransformTable => published;

	return { subscribe, getSnapshot };
}

/** Shared singleton throttling the core transform table for all 3D consumers. */
const throttledTransformStore = createThrottledTransformStore(
	{
		subscribe: subscribeToTransforms,
		getSnapshot: getTransformTableSnapshot,
	},
	TF_THROTTLE_MS,
);

/**
 * Rate-capped view of the core transform table. Drop-in for `useTransformTable`
 * on the 3D re-resolve path: identity-stable between publishes, fresh on each.
 */
export function useThrottledTransformTable(): TransformTable {
	return useSyncExternalStore(
		throttledTransformStore.subscribe,
		throttledTransformStore.getSnapshot,
		getServerTransformTableSnapshot,
	);
}

/**
 * Rate-capped equivalent of core `useWorldFrames`: resolves every frame to world
 * space from the throttled table. The memo keys on the throttled snapshot (a real
 * reactive value), so it stays fresh under the React Compiler.
 *
 * @param targetFrame - Restrict to the tree containing this frame (empty = all).
 * @param staleMs - Staleness threshold override.
 */
export function useThrottledWorldFrames(
	targetFrame?: string,
	staleMs?: number,
): WorldFrame[] {
	const table = useThrottledTransformTable();
	return useMemo(
		() => selectWorldFrames(table, { targetFrame, staleMs }),
		[table, targetFrame, staleMs],
	);
}
