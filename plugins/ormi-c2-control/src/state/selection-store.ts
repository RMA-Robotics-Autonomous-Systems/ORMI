"use client";

/**
 * C2 selection store.
 *
 * A tiny module-level store holding the operator's active mission id and the
 * active MAP name. Display
 * widgets (fleet status, mission feedback, swarm log, …) follow this selection
 * so selecting a mission in the mission browser drives the rest; a widget may instead pin a fixed `mission_id`
 * in its config and ignore the active selection.
 *
 * The active map is the same kind of thing and lives here for the same reason:
 * the mission map owns the map switcher, and any other panel that has to talk
 * about "the map the operator is looking at" (the behaviour-graph editor's
 * asset list) must follow it rather than resolving one of its own. Two panels
 * each picking "the first map in the registry" is how a graph editor ends up
 * offering assets that are not on the map beside it.
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

/** The authoritative active MAP name, as published by the mission map. */
let activeMapName: string | null = null;

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify every subscriber. */
function emit(): void {
	for (const listener of listeners) listener();
}

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
	emit();
}

/**
 * Publish the map the operator is currently working on, and notify.
 *
 * Written by the mission map whenever its own `selectedMap` changes. A no-op
 * (no notification) when unchanged, so the map's per-render ref sync does not
 * churn consumers. An empty string is normalized to `null`: "no map yet" is one
 * state, not two.
 *
 * @param name - The map's registry name, or `null`/`""` to clear it.
 */
export function setActiveMap(name: string | null): void {
	const next = name && name.length > 0 ? name : null;
	if (next === activeMapName) return;
	activeMapName = next;
	emit();
}

/**
 * Read the active map name outside React. Treat as read-only.
 * @returns The active map name, or `null` when none has been published.
 */
export function getActiveMap(): string | null {
	return activeMapName;
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

/**
 * Active-map snapshot (the `useSyncExternalStore` getSnapshot arg).
 *
 * Identity-stable while unchanged (a primitive), fresh after each change —
 * the same contract {@link getSnapshot} holds for the mission, which is why
 * the map name is a bare string here and not wrapped in an object.
 * @returns The active map name, or `null`.
 */
export function getActiveMapSnapshot(): string | null {
	return activeMapName;
}

/**
 * React hook: the map the operator is working on, re-rendering on change.
 *
 * `getActiveMapSnapshot` doubles as the SSR snapshot — the server value is
 * always the initial `null` until the mission map publishes one.
 * @returns The active map name, or `null` when none has been published.
 */
export function useActiveMap(): string | null {
	return useSyncExternalStore(
		subscribe,
		getActiveMapSnapshot,
		getActiveMapSnapshot,
	);
}
