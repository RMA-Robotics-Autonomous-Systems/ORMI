"use client";

/**
 * Shared mission-draft store — the operator's working copy of a mission keyed by
 * `mission_id`, so the editor (F5) and the map (F6) author the SAME draft.
 *
 * THE PROBLEM — F5 and F6 each held a private working copy of the active mission
 * via `useState` (F5 a {@link MissionDraft}, F6 a {@link MissionConfig}). An edit
 * in one widget (draw a geometry on the map, toggle a vehicle, change a name) did
 * NOT propagate to the other: the two views drifted, and a save in one used a
 * config the other had never seen.
 *
 * THE FIX — a single module-level store maps a mission's `mission_id` to its
 * working {@link MissionDraft} (a superset of {@link MissionConfig}, so F6 can read
 * a slot directly as a `MissionConfig`). Both widgets BIND to the same slot via
 * {@link useMissionDraft}; an edit through {@link editMissionDraft} replaces the
 * slot immutably and notifies, so both views re-render off the same data. Each slot
 * also carries a `dirty` flag (operator has unsaved edits) read via
 * {@link useMissionDraftDirty}, so saving in either widget clears the shared dirty.
 *
 * Read through `useSyncExternalStore` with an identity-stable, change-fresh
 * snapshot — same contract as the feedback store (`state/mission-feedback-store.ts`)
 * and the agents store (`state/c2-agents-store.ts`).
 *
 * ⚠ TWO-SNAPSHOT-STABILITY DISCIPLINE — {@link useMissionDraft} returns the stored
 * draft OBJECT for its `missionId`. That object MUST be referentially STABLE while
 * the draft is unchanged and FRESH only after a real change, so the map's many
 * `missionConfig`-derived memos don't churn. {@link setMissionDraft} guarantees
 * this by deduping on a content signature ({@link draftSignature}): re-loading an
 * identical draft is a pure no-op (no slot swap, no notify), exactly like the
 * feedback store dedups on `feedbackPlanSignature`. {@link editMissionDraft} always
 * replaces the slot object (a real operator edit), so consumers see a fresh value.
 *
 * ⚠ Do NOT replace any of this with a `useMemo` keyed on a version counter that
 * reads the module store: the React Compiler (enabled in the web app) strips the
 * no-op version read and freezes the memo on its first result (the trap documented
 * in AGENTS.md "React Compiler + external mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

import type { MissionDraft } from "../widgets/mission-editor-helpers";

/** One mission's working-copy slot: its content signature + draft + dirty flag. */
interface DraftSlot {
	/** {@link draftSignature} of `draft` — the content-change detector. */
	sig: string;
	/** The stored working draft (reference-stable while `sig` is unchanged). */
	draft: MissionDraft;
	/** Whether the operator has unsaved edits in this draft. */
	dirty: boolean;
}

/** mission_id → working-draft slot. */
let drafts: Record<string, DraftSlot> = {};

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * Content signature of a draft — the dedup key for {@link setMissionDraft}. A
 * stable JSON serialization (the draft is JSON-safe), so an identical re-load
 * (same content) is recognized and skipped, keeping the stored object reference
 * stable while unchanged.
 *
 * @param draft - The draft to fingerprint.
 * @returns A stable string signature.
 */
function draftSignature(draft: MissionDraft): string {
	return JSON.stringify(draft);
}

/**
 * Load or replace a mission's working copy and mark it CLEAN (`dirty = false`).
 *
 * The load path (a fetch result, or a post-save merged config) calls this. A pure
 * no-op (no slot swap, no listener notification) when the incoming draft is
 * content-identical to the already-stored one AND that slot is already clean — so
 * a redundant load does not churn the map's geometry/validation memos. On a real
 * change (or when the slot was dirty) the slot object is replaced immutably and
 * listeners are notified.
 *
 * @param draft - The working draft to store for `draft.mission_id`.
 */
export function setMissionDraft(draft: MissionDraft): void {
	const sig = draftSignature(draft);
	const prev = drafts[draft.mission_id];

	// Identical re-load of an already-clean slot → pure no-op (reference-stable).
	if (prev && prev.sig === sig && !prev.dirty) return;

	drafts = { ...drafts, [draft.mission_id]: { sig, draft, dirty: false } };
	emit();
}

/**
 * Apply an operator edit to a mission's working copy and mark it DIRTY.
 *
 * The `updater` receives the current draft and returns the next one (immutably).
 * The slot object is always replaced (a real operator edit), so consumers see a
 * fresh value and re-render. A NO-OP when the slot is absent (the same null-guard
 * semantics as F5's old `editDraft`/F6's `setMissionConfig(prev => prev ? … :
 * prev)`): an edit can only land on a loaded mission.
 *
 * @param missionId - The mission whose draft to edit.
 * @param updater - Pure transform from the current draft to the next.
 */
export function editMissionDraft(
	missionId: string,
	updater: (draft: MissionDraft) => MissionDraft,
): void {
	const prev = drafts[missionId];
	if (!prev) return;
	const next = updater(prev.draft);
	drafts = {
		...drafts,
		[missionId]: { sig: draftSignature(next), draft: next, dirty: true },
	};
	emit();
}

/**
 * Read a mission's working draft outside React. Treat the result as read-only.
 *
 * @param id - The mission id to read.
 * @returns The stored draft, or null when none is loaded.
 */
export function getMissionDraft(
	id: string | null | undefined,
): MissionDraft | null {
	if (!id) return null;
	return drafts[id]?.draft ?? null;
}

/**
 * Whether a mission's working draft has unsaved operator edits, outside React.
 *
 * @param id - The mission id to read.
 * @returns `true` when the slot exists and is dirty.
 */
export function isMissionDraftDirty(id: string | null | undefined): boolean {
	if (!id) return false;
	return drafts[id]?.dirty ?? false;
}

/**
 * Whether a mission's working draft is loaded (a slot exists) — the load-
 * coordination guard. A widget that finds `true` adopts the existing shared draft
 * instead of re-fetching, so F5 and F6 never double-load the same mission and an
 * in-progress edit in one widget is not clobbered by a load in the other.
 *
 * @param id - The mission id to check.
 * @returns `true` when a slot exists for `id`.
 */
export function hasMissionDraft(id: string | null | undefined): boolean {
	if (!id) return false;
	return drafts[id] !== undefined;
}

/**
 * Drop a mission's working-draft slot (e.g. on discard, so the follow effect
 * reloads it fresh). A no-op (no notify) when no slot exists.
 *
 * @param id - The mission id to clear.
 */
export function clearMissionDraft(id: string | null | undefined): void {
	if (!id || drafts[id] === undefined) return;
	const { [id]: _dropped, ...rest } = drafts;
	void _dropped;
	drafts = rest;
	emit();
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
 * React hook: a mission's working draft, re-rendering on change.
 *
 * The snapshot is the stored draft OBJECT for `missionId` — referentially STABLE
 * while the draft is unchanged (the store dedups identical loads on a content
 * signature) and FRESH after a real edit. The per-id `getSnapshot` is built with
 * `useCallback` keyed on `missionId` so it closes over the right id while staying
 * stable across renders.
 *
 * ⚠ Do NOT key this on a version counter read inside a `useMemo` — the React
 * Compiler strips the dead read and freezes the result (AGENTS.md "React Compiler
 * + external mutable stores").
 *
 * @param missionId - The mission id (or null/undefined → null).
 * @returns The mission's working draft, or null.
 */
export function useMissionDraft(
	missionId: string | null | undefined,
): MissionDraft | null {
	const get = useCallback(() => getMissionDraft(missionId), [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * React hook: whether a mission's working draft has unsaved edits, re-rendering on
 * change. The snapshot is a boolean primitive — naturally reference-stable while
 * unchanged and fresh after a change.
 *
 * @param missionId - The mission id (or null/undefined → false).
 * @returns `true` when the draft is dirty.
 */
export function useMissionDraftDirty(
	missionId: string | null | undefined,
): boolean {
	const get = useCallback(() => isMissionDraftDirty(missionId), [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * Test-only: reset all module-level state. Not used in production code; exported
 * so unit tests can isolate the otherwise module-level store between cases.
 */
export function __resetMissionDraftStore(): void {
	drafts = {};
	listeners.clear();
}
