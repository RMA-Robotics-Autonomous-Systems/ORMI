"use client";

/**
 * S3 / D8 — C2 selection store.
 *
 * A tiny module-level store holding the operator's active mission id. Display
 * widgets (F7/F10/F11/…) follow this selection so selecting a mission in the
 * browser (F4) drives the rest; a widget may instead pin a fixed `mission_id`
 * in its config and ignore the active selection.
 *
 * Read through `useSyncExternalStore` with an identity-stable, change-fresh
 * snapshot — same contract as the transform store
 * (`packages/ormi-core/src/transforms/transform-atoms.ts`). The snapshot here is
 * a primitive (`string | null`), so it is naturally reference-stable while
 * unchanged and a fresh value after each change.
 *
 * ⚠ Do NOT replace this with a `useMemo` keyed on a version counter that reads
 * the module store: the React Compiler (enabled in the web app) strips the
 * no-op version read and freezes the memo on its first result (the trap
 * documented in AGENTS.md "React Compiler + external mutable stores").
 */

import { useSyncExternalStore } from "react";

/** The authoritative active mission id (module-level, mutated in place). */
let selectedMissionId: string | null = null;

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/**
 * Set the active mission id and notify subscribers.
 *
 * A no-op (no notification) when the value is unchanged, so identical writes do
 * not churn `useSyncExternalStore` consumers.
 *
 * @param id - The mission id to make active, or `null` to clear the selection.
 */
export function setSelectedMission(id: string | null): void {
	if (id === selectedMissionId) return;
	selectedMissionId = id;
	for (const listener of listeners) listener();
}

/**
 * Read the active mission id outside React. Treat as read-only.
 * @returns The active mission id, or `null` when none is selected.
 */
export function getSelectedMission(): string | null {
	return selectedMissionId;
}

/**
 * Subscribe to selection changes (the `useSyncExternalStore` subscribe arg).
 * @param listener - Change callback.
 * @returns Unsubscribe function.
 */
export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Current-value snapshot (the `useSyncExternalStore` getSnapshot arg).
 *
 * Identity-stable while unchanged (a primitive), fresh after each change.
 * @returns The active mission id, or `null`.
 */
export function getSnapshot(): string | null {
	return selectedMissionId;
}

/**
 * React hook: the active mission id, re-rendering on change.
 *
 * `getSnapshot` doubles as the SSR snapshot — the server value is always the
 * initial `null` until a client selection lands.
 * @returns The active mission id, or `null` when none is selected.
 */
export function useSelectedMission(): string | null {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
