"use client";

/**
 * Per-mission feedback store — last {@link MissionFeedback} keyed by `mission_id`.
 *
 * A tiny module-level store mapping a mission's `mission_id` to its most recent
 * parsed feedback. It exists to fix a flicker in the Mission Feedback widget
 * that is the mission-level twin of the per-agent map-marker interleave bug
 * (see README "Per-agent map markers").
 *
 * THE PROBLEM — `/multi_robot/mission_feedback` is a SINGLE shared ROS topic
 * carrying feedback for ALL missions, interleaved. The widget subscribes with a size-1
 * buffer and reads the buffer tail, then filters by the selected `mission_id`.
 * When an interleaved message for a DIFFERENT mission lands in that size-1
 * buffer, a naive "matches ? feedback : null" read flips the shown value to
 * `null` (rendering "Waiting for mission feedback…"), then back when the next
 * matching message arrives — a flicker (A → "Waiting…" → A).
 *
 * THE FIX — every parsed message is published into a per-mission slot keyed by
 * `mission_id`. A widget READS ONLY its own mission's slot, so an interleaved
 * message for another mission updates THAT slot and never blanks the mission this
 * widget shows. {@link feedbackSignature} (the signature of everything the
 * widget renders — plan and v2 progress) is the content-change detector: a slot
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

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { MissionFeedback, feedbackSignature } from "../types/mission-feedback";

/** One mission's slot: its plan signature + the stored value. */
interface FeedbackSlot {
	/** {@link feedbackSignature} of `value` — the content-change detector. */
	sig: string;
	/** The stored feedback (reference-stable while `sig` is unchanged). */
	value: MissionFeedback;
	/**
	 * `Date.now()` of the last publish for this mission — INCLUDING identical
	 * republishes, which prove the mission is still reporting even though they
	 * change no content.
	 *
	 * Deliberately mutated in place rather than triggering a notification: this
	 * store only ever added or updated entries, so a mission that was deleted, or
	 * whose publisher died, kept rendering its last "Started" badge forever with
	 * nothing to distinguish it from a live one. Readers poll this through
	 * {@link useFeedbackFreshness} on their own 1 s ticker instead, so an
	 * unchanged 2 Hz topic does not re-render every consumer twice a second.
	 *
	 * Null for a {@link FeedbackOrigin} `history` slot: a stored snapshot says
	 * nothing about whether the mission is reporting NOW, so it never counts as
	 * fresh (nor as stale — it has no age at all).
	 */
	updatedAt: number | null;
	/** Where the value came from — see {@link FeedbackOrigin}. */
	origin: FeedbackOrigin;
}

/**
 * Where a slot's feedback came from.
 *
 * - `live`: a `mission_feedback` topic message received on this page.
 * - `history`: the latest snapshot stored by the C2 (`GET :5000
 *   /mission-feedback/latest` or `/mission-feedback/:id`), seeded so a finished
 *   mission stays reviewable after a page reload.
 *
 * The merge rule, in one place ({@link publishMissionFeedback} /
 * {@link seedMissionFeedbackHistory}): **live wins while it is live**. A live
 * message replaces a history slot unconditionally; a history snapshot never
 * replaces a live slot heard within {@link FEEDBACK_STALE_AFTER_MS}, and
 * otherwise only replaces a slot whose content differs. History
 * never becomes the "latest published" mission, never has an age, and is kept
 * out of {@link getLiveMissionFeedback} — so it never reads as fresh and never
 * drives auto-select or the "now playing" strip.
 */
export type FeedbackOrigin = "live" | "history";

/** Past this age with no publish, a mission's live state is shown as stale. */
export const FEEDBACK_STALE_AFTER_MS = 15_000;

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
 * identical (same {@link feedbackSignature}) to the already-stored value AND
 * its mission is already the latest — the `mission_feedback` topic republishes
 * continuously, so identical republishes for the already-latest mission MUST NOT
 * churn consumers. On a REAL content change the slot's value object is replaced
 * immutably (so per-mission snapshots stay reference-stable while unchanged), and
 * `latestMissionId` is updated and listeners notified.
 *
 * @param fb - The parsed feedback to publish.
 */
export function publishMissionFeedback(fb: MissionFeedback): void {
	const sig = feedbackSignature(fb);
	const prev = feedbacks[fb.mission_id];
	const now = Date.now();
	const prevLive = prev?.origin === "live";

	// Identical republish for the already-latest mission → no re-render, but the
	// timestamp still moves: "unchanged" and "no longer reporting" are different
	// facts and the freshness indicator has to tell them apart.
	if (
		prev &&
		prevLive &&
		prev.sig === sig &&
		latestMissionId === fb.mission_id
	) {
		prev.updatedAt = now;
		return;
	}

	// Replace the slot object only on a REAL content change, so unchanged
	// missions keep a reference-stable value across an interleaved publish. A
	// history slot is ALWAYS replaced (live wins); when the content is the same
	// the value object is kept, only the origin changes.
	if (!prev || prev.sig !== sig || !prevLive) {
		feedbacks = {
			...feedbacks,
			[fb.mission_id]: {
				sig,
				value: prev && prev.sig === sig ? prev.value : fb,
				updatedAt: now,
				origin: "live",
			},
		};
	} else {
		prev.updatedAt = now;
	}

	latestMissionId = fb.mission_id;
	emit();
}

/**
 * Seed a STORED snapshot (from the C2's feedback history) into the store.
 *
 * Live wins while it is live: a no-op when the mission has a live slot heard
 * within {@link FEEDBACK_STALE_AFTER_MS}, and when an identical snapshot is
 * already there. A live slot that has gone STALE is replaced by a differing
 * snapshot — the C2 stored something newer than the last message this page
 * heard (the publisher died, or the topic dropped), and holding on to the old
 * live value would show a mission as still running after the C2 recorded it
 * ending. Never moves `latestMissionId` and never gives the slot an age (see
 * {@link FeedbackOrigin}).
 *
 * @param fb - The parsed stored snapshot.
 * @param now - The current time in ms (injectable for tests).
 * @returns True when the store changed.
 */
export function seedMissionFeedbackHistory(
	fb: MissionFeedback,
	now: number = Date.now(),
): boolean {
	const prev = feedbacks[fb.mission_id];
	if (
		prev?.origin === "live" &&
		(prev.updatedAt == null ||
			now - prev.updatedAt <= FEEDBACK_STALE_AFTER_MS)
	) {
		return false;
	}
	const sig = feedbackSignature(fb);
	if (prev && prev.sig === sig) return false;
	feedbacks = {
		...feedbacks,
		[fb.mission_id]: { sig, value: fb, updatedAt: null, origin: "history" },
	};
	emit();
	return true;
}

/**
 * Where a mission's stored feedback came from, outside React.
 * @param missionId - The mission id.
 * @returns `live`, `history`, or null when the mission is unknown.
 */
export function getMissionFeedbackOrigin(
	missionId: string | null | undefined,
): FeedbackOrigin | null {
	if (!missionId) return null;
	return feedbacks[missionId]?.origin ?? null;
}

/**
 * React hook: {@link getMissionFeedbackOrigin}, re-rendering on change.
 * @param missionId - The mission id.
 * @returns `live`, `history`, or null.
 */
export function useMissionFeedbackOrigin(
	missionId: string | null | undefined,
): FeedbackOrigin | null {
	const get = useCallback(
		() => getMissionFeedbackOrigin(missionId),
		[missionId],
	);
	return useSyncExternalStore(subscribe, get, get);
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
 * Every known mission's last feedback, in first-seen order, outside React.
 *
 * Reference-stable while no slot changed (cached on the `feedbacks` map
 * identity, which is replaced only on a real content change), so it is a valid
 * `useSyncExternalStore` snapshot. Includes terminal missions: the store never
 * forgets a mission during the session, which is what keeps a finished mission
 * reviewable after its producer sent the final snapshot and went quiet.
 *
 * @returns The feedback of every mission seen this session.
 */
export function getAllMissionFeedback(): MissionFeedback[] {
	if (allCache.source !== feedbacks) {
		allCache = {
			source: feedbacks,
			value: Object.values(feedbacks).map((slot) => slot.value),
		};
	}
	return allCache.value;
}

/**
 * The missions with LIVE feedback only (see {@link FeedbackOrigin}), in
 * first-seen order. Reference-stable while unchanged, like
 * {@link getAllMissionFeedback}. This is what "now playing" and auto-select
 * read: a stored snapshot must never make a mission look like it is playing.
 *
 * @returns The feedback of every mission heard live this session.
 */
export function getLiveMissionFeedback(): MissionFeedback[] {
	if (liveCache.source !== feedbacks) {
		liveCache = {
			source: feedbacks,
			value: Object.values(feedbacks)
				.filter((slot) => slot.origin === "live")
				.map((slot) => slot.value),
		};
	}
	return liveCache.value;
}

/** {@link getLiveMissionFeedback}'s identity cache. */
let liveCache: {
	source: Record<string, FeedbackSlot>;
	value: MissionFeedback[];
} = { source: {}, value: [] };

/** {@link getAllMissionFeedback}'s identity cache. */
let allCache: {
	source: Record<string, FeedbackSlot>;
	value: MissionFeedback[];
} = { source: {}, value: [] };

/**
 * When a mission's feedback was last published, outside React.
 *
 * @param missionId - The mission id (falsy → the latest published mission).
 * @returns The `Date.now()` of the last publish, or null when unknown.
 */
export function getMissionFeedbackUpdatedAt(
	missionId: string | null | undefined,
): number | null {
	const id = missionId || latestMissionId;
	if (!id) return null;
	return feedbacks[id]?.updatedAt ?? null;
}

/** How fresh a mission's live state is. */
export interface FeedbackFreshness {
	/** Milliseconds since the last publish, or null when none has arrived. */
	ageMs: number | null;
	/** True once `ageMs` exceeds {@link FEEDBACK_STALE_AFTER_MS}. */
	stale: boolean;
}

/**
 * Compute freshness from a timestamp (pure, so the threshold is testable).
 *
 * @param updatedAt - The last publish time, or null.
 * @param now - The current time in ms.
 * @param staleAfterMs - The staleness threshold.
 * @returns The age and whether it counts as stale.
 */
export function feedbackFreshness(
	updatedAt: number | null,
	now: number,
	staleAfterMs: number = FEEDBACK_STALE_AFTER_MS,
): FeedbackFreshness {
	if (updatedAt == null) return { ageMs: null, stale: false };
	const ageMs = Math.max(0, now - updatedAt);
	return { ageMs, stale: ageMs > staleAfterMs };
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
 * React hook: EXACTLY the given mission's feedback — null when no mission is
 * given, never "whatever published last".
 *
 * {@link useMissionFeedback}(null) falls back to the latest published mission.
 * The map and the feedback timeline used to do that silently, which drew another
 * mission's routes and status under nothing selected, with no tell as to what was
 * actually playing. They read this hook instead and say "no mission selected".
 *
 * @param missionId - The mission id, or null/undefined.
 * @returns The mission's feedback, or null.
 */
export function useMissionFeedbackExact(
	missionId: string | null | undefined,
): MissionFeedback | null {
	const get = useCallback(
		() => (missionId ? getMissionFeedback(missionId) : null),
		[missionId],
	);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * React hook: the missions with LIVE feedback. See {@link getLiveMissionFeedback}.
 * @returns The live feedback list, reference-stable while unchanged.
 */
export function useLiveMissionFeedback(): MissionFeedback[] {
	return useSyncExternalStore(
		subscribe,
		getLiveMissionFeedback,
		getLiveMissionFeedback,
	);
}

/**
 * React hook: one mission's feedback, LIVE only — a history snapshot reads as
 * null. For the lifecycle panel, whose command gating must rest on what the
 * mission reports now, not on a stored snapshot. Same latest-mission fallback
 * as {@link useMissionFeedback} when `missionId` is falsy.
 *
 * @param missionId - The mission id (or null/undefined → latest live mission).
 * @returns The live feedback, or null.
 */
export function useLiveMissionFeedbackFor(
	missionId: string | null | undefined,
): MissionFeedback | null {
	const get = useCallback(() => {
		const id = missionId || latestMissionId;
		if (!id) return null;
		const slot = feedbacks[id];
		return slot?.origin === "live" ? slot.value : null;
	}, [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * React hook: every mission's feedback seen this session (active and finished),
 * re-rendering when any of them changes. See {@link getAllMissionFeedback}.
 *
 * @returns The feedback list, reference-stable while unchanged.
 */
export function useAllMissionFeedback(): MissionFeedback[] {
	return useSyncExternalStore(
		subscribe,
		getAllMissionFeedback,
		getAllMissionFeedback,
	);
}

/**
 * React hook: how stale a mission's live state is, re-evaluated once a second.
 *
 * Its own 1 s ticker, NOT a store subscription: the feedback topic republishes
 * continuously, so driving this off the store would either re-render every
 * consumer at topic rate (if identical republishes notified) or never update at
 * all (they do not). A mission whose publisher stopped therefore crosses into
 * "stale" on its own, which is the whole point — a deleted or ended mission used
 * to keep rendering its last status badge indefinitely.
 *
 * @param missionId - The mission id (falsy → the latest published mission).
 * @returns The age in ms and whether it is past the staleness threshold.
 */
export function useFeedbackFreshness(
	missionId: string | null | undefined,
): FeedbackFreshness {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);
	const updatedAt = useSyncExternalStore(
		subscribe,
		() => getMissionFeedbackUpdatedAt(missionId),
		() => getMissionFeedbackUpdatedAt(missionId),
	);
	return feedbackFreshness(updatedAt, now);
}

/**
 * Format an age for display: "3s ago", "2m ago", or "—" when unknown.
 *
 * @param ageMs - Milliseconds since the last update, or null.
 * @returns A short human string.
 */
export function formatAge(ageMs: number | null): string {
	if (ageMs == null) return "—";
	const seconds = Math.floor(ageMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	return `${Math.floor(minutes / 60)}h ago`;
}

/**
 * Test-only: reset all module-level state. Not used in production code; exported
 * so unit tests can isolate the otherwise module-level store between cases.
 */
export function __resetMissionFeedbackStore(): void {
	feedbacks = {};
	latestMissionId = null;
	allCache = { source: {}, value: [] };
	liveCache = { source: {}, value: [] };
	listeners.clear();
}
