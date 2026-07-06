"use client";

/**
 * Per-mission planner-state store — last {@link PlannerState} keyed by
 * `mission_id`.
 *
 * A tiny module-level store mapping a mission's `mission_id` to its most recent
 * planner state, fed from `/multi_robot/planner/state`. It is the planner-side
 * twin of the per-mission feedback store (`state/mission-feedback-store.ts`):
 * the planner topic carries state for ALL missions interleaved in each message,
 * so a widget reads ONLY its own mission's state via {@link usePlannerState}
 * without an interleaved message for another mission blanking it.
 *
 * Read through `useSyncExternalStore` with an identity-stable, change-fresh
 * snapshot — same contract as the selection store (`state/selection-store.ts`)
 * and the transform store. The per-mission snapshot is a primitive
 * (`PlannerState | null`), so it is naturally reference-stable while unchanged.
 *
 * ⚠ Do NOT replace this with a `useMemo` keyed on a version counter that reads
 * the module store: the React Compiler (enabled in the web app) strips the
 * no-op version read and freezes the memo on its first result (the trap
 * documented in AGENTS.md "React Compiler + external mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

import {
	PlannerState,
	PlannerStateMap,
	plannerStateSignature,
} from "../types/planner-state";

/** mission_id → last planner state. */
let states: PlannerStateMap = {};

/** Signature of the current `states` map — the content-change detector. */
let statesSig = "";

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * Publish a freshly parsed per-mission state map.
 *
 * A pure no-op (no swap, no notification) when the incoming map is identical to
 * the stored one — the planner topic republishes continuously, so identical
 * republishes MUST NOT churn consumers. The map is replaced wholesale (the
 * planner publishes the full per-mission list every tick, so a mission absent
 * from the new map has genuinely been cleared by the planner).
 *
 * @param map - The parsed per-mission state map.
 */
export function publishPlannerState(map: PlannerStateMap): void {
	const sig = plannerStateSignature(map);
	if (sig === statesSig) return;
	states = map;
	statesSig = sig;
	emit();
}

/**
 * Read a mission's last planner state outside React.
 *
 * @param missionId - The mission id to read. When falsy, returns null (there is
 *   no meaningful "latest" planner state without a selected mission).
 * @returns The mission's planner state, or null when unknown.
 */
export function getPlannerState(
	missionId: string | null | undefined,
): PlannerState | null {
	if (!missionId) return null;
	return states[missionId] ?? null;
}

/**
 * Subscribe to store changes (the `useSyncExternalStore` subscribe arg).
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
 * React hook: a mission's last planner state, re-rendering on change.
 *
 * The snapshot is a primitive (`PlannerState | null`), naturally reference-
 * stable while unchanged and fresh after each change. The per-id `getSnapshot`
 * is built with `useCallback` keyed on `missionId` so it closes over the right
 * id while staying stable across renders.
 *
 * ⚠ Do NOT key this on a version counter read inside a `useMemo` — the React
 * Compiler strips the dead read and freezes the result (AGENTS.md "React
 * Compiler + external mutable stores").
 *
 * @param missionId - The mission id (or null/undefined → null).
 * @returns The mission's planner state, or null.
 */
export function usePlannerState(
	missionId: string | null | undefined,
): PlannerState | null {
	const get = useCallback(() => getPlannerState(missionId), [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * Test-only: reset all module-level state. Not used in production code; exported
 * so unit tests can isolate the otherwise module-level store between cases.
 */
export function __resetPlannerStateStore(): void {
	states = {};
	statesSig = "";
	listeners.clear();
}
