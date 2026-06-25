"use client";

/**
 * C2 catalog store — shared UUID→human-name maps.
 *
 * A tiny module-level store mapping `mission_id → name` and `feature_id → name`.
 * The widgets that already fetch these lists (the mission browser F4 and editor
 * F5 for missions, the map F6 for features) publish names here; the read-only
 * display widgets (control panel F7, feedback F10, swarm log F11, editor
 * geometry list) resolve a UUID to its human name without each one refetching
 * the list (the redundant-request anti-pattern — see AGENTS.md "prefer
 * structural fix over caching").
 *
 * Kept SEPARATE from the selection store (`selection-store.ts`) and the
 * map-editing store (`map-editing-store.ts`): the active mission, a geometry
 * hand-off, and a name catalog are independent concerns, exactly as those two
 * are kept separate from each other. Agents/vehicles are deliberately NOT held
 * here (a later phase).
 *
 * Read through `useSyncExternalStore` with an identity-stable, change-fresh
 * snapshot — same contract as the transform store
 * (`packages/ormi-core/src/transforms/transform-atoms.ts`).
 *
 * ⚠ CRITICAL — each hook resolves a SINGLE id to its name STRING (a primitive),
 * and its `getSnapshot` returns that primitive, NOT the underlying map object.
 * A primitive snapshot is naturally reference-stable while unchanged and fresh
 * after a change, so `useSyncExternalStore` neither loops nor goes stale. The
 * per-id getSnapshot is built with `useCallback` keyed on the id so it closes
 * over the right id while staying stable across renders.
 *
 * ⚠ Do NOT replace this with a `useMemo` keyed on a version counter that reads
 * the module store: the React Compiler (enabled in the web app) strips the
 * no-op version read and freezes the memo on its first result (the trap
 * documented in AGENTS.md "React Compiler + external mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

/** mission_id → operator-facing mission name. */
let missionNames: Record<string, string> = {};
/** feature_id → operator-facing feature name. */
let featureNames: Record<string, string> = {};

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * Shorten a UUID for display when no human name is known: first 8 chars + "…".
 *
 * @param id - The id to shorten; empty/`null`/`undefined` yields "".
 * @returns The shortened id, or "" when there is nothing to show.
 */
export function shortId(id: string | null | undefined): string {
	if (!id) return "";
	return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

/**
 * Merge a list of `{ id, name }` rows into a name map, returning a NEW map only
 * when at least one name actually changed (so identical re-fetches are no-ops).
 *
 * Entries without a usable string name are skipped (they keep any prior name).
 */
function mergeNames(
	current: Record<string, string>,
	rows: { id: string; name?: string }[],
): Record<string, string> {
	let next: Record<string, string> | null = null;
	for (const row of rows) {
		const id = row.id;
		if (!id) continue;
		const name = typeof row.name === "string" ? row.name : undefined;
		if (!name) continue;
		if (current[id] === name) continue;
		if (!next) next = { ...current };
		next[id] = name;
	}
	return next ?? current;
}

/**
 * Publish mission names (from a `c2.missions.list` fetch).
 *
 * Merges into the mission map. A no-op (no listener notification) when every
 * resolved name is already present and unchanged, so repeated identical list
 * fetches do not churn consumers.
 *
 * @param rows - Mission rows carrying `mission_id` and an optional `name`.
 */
export function publishMissionNames(
	rows: { mission_id: string; name?: string }[],
): void {
	const next = mergeNames(
		missionNames,
		rows.map((r) => ({ id: r.mission_id, name: r.name })),
	);
	if (next === missionNames) return;
	missionNames = next;
	emit();
}

/**
 * Publish feature names (from a `c2.features.list` fetch).
 *
 * Merges into the feature map. A no-op (no listener notification) when every
 * resolved name is already present and unchanged.
 *
 * @param features - Features carrying `feature_id` and an optional `name`.
 */
export function publishFeatureNames(
	features: { feature_id: string; name?: string }[],
): void {
	const next = mergeNames(
		featureNames,
		features.map((f) => ({ id: f.feature_id, name: f.name })),
	);
	if (next === featureNames) return;
	featureNames = next;
	emit();
}

/**
 * Resolve a mission id to its human name outside React.
 *
 * @param id - The mission id.
 * @returns The known name, or `shortId(id)` when none is known.
 */
export function getMissionName(id: string | null | undefined): string {
	if (!id) return "";
	return missionNames[id] ?? shortId(id);
}

/**
 * Resolve a feature id to its human name outside React.
 *
 * @param id - The feature id.
 * @returns The known name, or `shortId(id)` when none is known.
 */
export function getFeatureName(id: string | null | undefined): string {
	if (!id) return "";
	return featureNames[id] ?? shortId(id);
}

/**
 * Subscribe to catalog changes (the `useSyncExternalStore` subscribe arg).
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
 * React hook: the human name for a mission id, re-rendering on change.
 *
 * The snapshot is the resolved name STRING (a primitive) for `id`, not the map
 * object — identity-stable while unchanged, fresh after a publish. Falls back to
 * `shortId(id)` until a name is known.
 *
 * @param id - The mission id (or null/undefined → "").
 * @returns The mission's human name or a shortened id.
 */
export function useMissionName(id: string | null | undefined): string {
	const getName = useCallback(() => getMissionName(id), [id]);
	return useSyncExternalStore(subscribe, getName, getName);
}

/**
 * React hook: the human name for a feature id, re-rendering on change.
 *
 * Same primitive-snapshot contract as {@link useMissionName}.
 *
 * @param id - The feature id (or null/undefined → "").
 * @returns The feature's human name or a shortened id.
 */
export function useFeatureName(id: string | null | undefined): string {
	const getName = useCallback(() => getFeatureName(id), [id]);
	return useSyncExternalStore(subscribe, getName, getName);
}
