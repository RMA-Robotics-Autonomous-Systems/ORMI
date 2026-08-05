"use client";

/**
 * F5/F6 — C2 map-editing store.
 *
 * A tiny module-level store that hands geometry from the map widget (F6) to the
 * mission editor (F5):
 *  - `pickedFeatureId` — the MapDB feature the operator last clicked (View mode),
 *    which F5 can drop into `objective.geometries[]` as `{ feature_id }`.
 *  - `draftGeometry` — a geometry the operator drew in the map's authoring layer,
 *    which F5 can drop in as `{ geometry }`.
 *
 * Kept SEPARATE from the selection store (`selection-store.ts`): the active
 * mission (`selectedMissionId`) and a geometry hand-off are independent concerns,
 * and conflating them would couple F6 picking to mission selection.
 *
 * Read through `useSyncExternalStore` with an identity-stable, change-fresh
 * snapshot — same contract as the transform store
 * (`packages/ormi-core/src/transforms/transform-atoms.ts`).
 *
 * ⚠ CRITICAL — the snapshot is an OBJECT, not a primitive. `getSnapshot` MUST
 * return a referentially-STABLE object that only changes identity when a field
 * actually changes. Each setter therefore builds the next state object once and
 * keeps the SAME reference between writes; `getSnapshot` returns that stored
 * reference verbatim. Returning a fresh object literal on every `getSnapshot`
 * call would make `useSyncExternalStore` think the store changed on every render
 * and loop forever (the same trap the selection store avoids with a primitive).
 *
 * ⚠ Do NOT replace this with a `useMemo` keyed on a version counter that reads
 * the module store: the React Compiler (enabled in the web app) strips the
 * no-op version read and freezes the memo (the trap documented in AGENTS.md
 * "React Compiler + external mutable stores").
 */

import { useSyncExternalStore } from "react";

/** A geometry drawn in the map authoring layer, ready to drop into a mission. */
export interface DraftGeometry {
	/** e.g. "Point" | "LineString" | "Polygon". */
	geometry_type: string;
	/** GeoJSON `[lng, lat]` coordinates (single pair, ring, or array of rings). */
	coordinates: unknown;
}

/** The full map-editing state object (read-only to consumers). */
export interface MapEditingState {
	/** The MapDB feature id the operator last picked (View mode), or null. */
	pickedFeatureId: string | null;
	/** A geometry drawn in the authoring layer awaiting hand-off, or null. */
	draftGeometry: DraftGeometry | null;
}

/** The authoritative state (module-level). A NEW object is created on each write. */
let state: MapEditingState = { pickedFeatureId: null, draftGeometry: null };

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * Set the picked feature id and notify subscribers.
 *
 * A no-op (no new object, no notification) when the value is unchanged, so
 * identical writes do not churn consumers.
 * @param id - The picked MapDB feature id, or `null` to clear.
 */
export function setPickedFeature(id: string | null): void {
	if (id === state.pickedFeatureId) return;
	state = { ...state, pickedFeatureId: id };
	emit();
}

/**
 * Set the draft geometry (handed off to the mission editor) and notify.
 *
 * Always produces a fresh state object when called with a non-identical value;
 * clearing (passing `null`) when already null is a no-op.
 * @param geometry - The drawn geometry, or `null` to clear.
 */
export function setDraftGeometry(geometry: DraftGeometry | null): void {
	if (geometry === state.draftGeometry) return;
	state = { ...state, draftGeometry: geometry };
	emit();
}

/**
 * Clear both hand-off fields. No-op (no notification) when already cleared.
 */
export function clearMapEditing(): void {
	if (state.pickedFeatureId === null && state.draftGeometry === null) return;
	state = { pickedFeatureId: null, draftGeometry: null };
	emit();
}

/**
 * Subscribe to map-editing changes (the `useSyncExternalStore` subscribe arg).
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
 * Current-state snapshot (the `useSyncExternalStore` getSnapshot arg).
 *
 * Returns the stored object reference verbatim — identity-stable while unchanged,
 * fresh only after a real write. Treat the result as read-only.
 * @returns The current {@link MapEditingState}.
 */
export function getSnapshot(): MapEditingState {
	return state;
}

/**
 * React hook: the current map-editing state, re-rendering on change.
 * @returns The current {@link MapEditingState}.
 */
export function useC2MapEditing(): MapEditingState {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
