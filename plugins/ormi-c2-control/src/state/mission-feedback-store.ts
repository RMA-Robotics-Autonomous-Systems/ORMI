"use client";

/**
 * Per-mission feedback store — last {@link MissionFeedback} keyed by `mission_id`.
 *
 * A tiny module-level store mapping a mission's `mission_id` to its most recent
 * parsed feedback. It exists to fix a flicker in the Mission Feedback widget
 * (F10) that is the mission-level twin of the per-agent map-marker interleave bug
 * (see README "Per-agent map markers").
 *
 * THE PROBLEM — `/multi_robot/mission_feedback` is a SINGLE shared ROS topic
 * carrying feedback for ALL missions, interleaved. F10 subscribes with a size-1
 * buffer and reads the buffer tail, then filters by the selected `mission_id`.
 * When an interleaved message for a DIFFERENT mission lands in that size-1
 * buffer, a naive "matches ? feedback : null" read flips the shown value to
 * `null` (rendering "Waiting for mission feedback…"), then back when the next
 * matching message arrives — a flicker (A → "Waiting…" → A).
 *
 * THE FIX — every parsed message is published into a per-mission slot keyed by
 * `mission_id`. A widget READS ONLY its own mission's slot, so an interleaved
 * message for another mission updates THAT slot and never blanks the mission this
 * widget shows. {@link feedbackPlanSignature} (the signature of the RENDERED
 * plan, which is exactly what F10 displays) is the content-change detector: a slot
 * is only replaced on a REAL content change, so each mission's stored value object
 * stays reference-stable while unchanged.
 *
 * Read through `useSyncExternalStore` with an identity-stable, change-fresh
 * snapshot — same contract as the agents store (`state/c2-agents-store.ts`) and
 * the transform store (`packages/ormi-core/src/transforms/transform-atoms.ts`).
 *
 * ⚠ TWO-SNAPSHOT-STABILITY DISCIPLINE — {@link useMissionFeedback} returns the
 * stored value OBJECT for its `missionId` (or the latest mission's value when no
 * id is pinned). That object MUST be referentially STABLE while the mission's
 * rendered plan is unchanged and FRESH only after a real change, exactly like
 * {@link useAgentRecord}. The store guarantees this by replacing a slot's value
 * object ONLY when its plan signature actually changed; identical republishes
 * (the topic streams continuously) are pure no-ops that neither swap the object
 * nor notify listeners.
 *
 * ⚠ Do NOT replace any of this with a `useMemo` keyed on a version counter that
 * reads the module store: the React Compiler (enabled in the web app) strips the
 * no-op version read and freezes the memo on its first result (the trap
 * documented in AGENTS.md "React Compiler + external mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

import {
	MissionFeedback,
	feedbackPlanSignature,
} from "../types/mission-feedback";

/** One mission's slot: its plan signature + the stored value. */
interface FeedbackSlot {
	/** {@link feedbackPlanSignature} of `value` — the content-change detector. */
	sig: string;
	/** The stored feedback (reference-stable while `sig` is unchanged). */
	value: MissionFeedback;
}

/** mission_id → last feedback slot. */
let feedbacks: Record<string, FeedbackSlot> = {};

/** The mission_id of the most recently published feedback, or null. */
let latestMissionId: string | null = null;

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * Publish a parsed feedback into its per-mission slot.
 *
 * A pure no-op (no slot swap, no listener notification) when the feedback is
 * identical (same {@link feedbackPlanSignature}) to the already-stored value AND
 * its mission is already the latest — the `mission_feedback` topic republishes
 * continuously, so identical republishes for the already-latest mission MUST NOT
 * churn consumers. On a REAL content change the slot's value object is replaced
 * immutably (so per-mission snapshots stay reference-stable while unchanged), and
 * `latestMissionId` is updated and listeners notified.
 *
 * @param fb - The parsed feedback to publish.
 */
export function publishMissionFeedback(fb: MissionFeedback): void {
	const sig = feedbackPlanSignature(fb);
	const prev = feedbacks[fb.mission_id];

	// Identical republish for the already-latest mission → pure no-op.
	if (prev && prev.sig === sig && latestMissionId === fb.mission_id) return;

	// Replace the slot object only on a REAL content change, so unchanged
	// missions keep a reference-stable value across an interleaved publish.
	if (!prev || prev.sig !== sig) {
		feedbacks = { ...feedbacks, [fb.mission_id]: { sig, value: fb } };
	}

	latestMissionId = fb.mission_id;
	emit();
}

/**
 * Read a mission's last feedback outside React. Treat the result as read-only.
 *
 * @param missionId - The mission id to read. When falsy (no mission pinned /
 *   selected), returns the LATEST published mission's feedback — preserving the
 *   "show whatever the latest feedback carries" behavior, but without the
 *   parse-null blanking.
 * @returns The mission's stored feedback, or null when none is known.
 */
export function getMissionFeedback(
	missionId: string | null | undefined,
): MissionFeedback | null {
	if (!missionId) {
		return latestMissionId
			? (feedbacks[latestMissionId]?.value ?? null)
			: null;
	}
	return feedbacks[missionId]?.value ?? null;
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
 * React hook: a mission's last feedback, re-rendering on change.
 *
 * The snapshot is the stored value OBJECT for `missionId` (or the latest
 * mission's value when `missionId` is falsy) — referentially STABLE while that
 * mission's rendered plan is unchanged, because the store only replaces a slot's
 * value on a real content change. This mirrors {@link useAgentRecord}; an
 * interleaved publish for another mission never swaps this mission's object, so
 * the widget does not flicker. The per-id `getSnapshot` is built with
 * `useCallback` keyed on `missionId` so it closes over the right id while staying
 * stable across renders.
 *
 * ⚠ Do NOT key this on a version counter read inside a `useMemo` — the React
 * Compiler strips the dead read and freezes the result (AGENTS.md "React
 * Compiler + external mutable stores").
 *
 * @param missionId - The mission id (or null/undefined → latest mission's value).
 * @returns The mission's feedback, or null.
 */
export function useMissionFeedback(
	missionId: string | null | undefined,
): MissionFeedback | null {
	const get = useCallback(() => getMissionFeedback(missionId), [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * Test-only: reset all module-level state. Not used in production code; exported
 * so unit tests can isolate the otherwise module-level store between cases.
 */
export function __resetMissionFeedbackStore(): void {
	feedbacks = {};
	latestMissionId = null;
	listeners.clear();
}
