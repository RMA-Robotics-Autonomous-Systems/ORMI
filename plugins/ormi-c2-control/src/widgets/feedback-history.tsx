"use client";

/**
 * Stored mission-feedback history → the per-mission feedback store.
 *
 * A terminal mission publishes one final snapshot and then goes silent, so after
 * a page reload the topic says nothing about it and it could no longer be
 * reviewed. The C2 REST server (`:5000`, the datasource's `dbUrl`) keeps the
 * latest snapshot of every mission:
 *
 *  - `GET /mission-feedback/latest` → every mission's latest snapshot, newest
 *    first (`c2.feedback.latest`);
 *  - `GET /mission-feedback/:mission_id` → one mission's (`c2.feedback.get`,
 *    404 `MISSION_NOT_FOUND` when none).
 *
 * {@link MissionFeedbackHistorySync} seeds those into the store as `history`
 * slots (`seedMissionFeedbackHistory`): live topic messages always win, and a
 * history slot never counts as fresh and never drives auto-select or "now
 * playing" (see `FeedbackOrigin` in `state/mission-feedback-store.ts`).
 *
 * When it fetches:
 *  - the list: on mount, whenever the C2 datasource's call definitions appear or
 *    change (the datasource connected), and on `refreshKey` changes (the mission
 *    picker opening). Shared across every mounted instance and throttled, so the
 *    map and the timeline together still fetch once.
 *  - one mission: when the selected mission has no feedback at all in the store.
 */

import {
	RemoteCallDefinition,
	useAvailableRemoteCalls,
	useRemoteCall,
} from "@workspace/ormi-core/datasources";
import { useEffect, useMemo } from "react";

import { C2Call } from "../datasource/remote-calls";
import {
	MissionFeedback,
	parseMissionFeedback,
} from "../types/mission-feedback";
import {
	getMissionFeedback,
	seedMissionFeedbackHistory,
} from "../state/mission-feedback-store";

/**
 * Parse a history response into feedbacks.
 *
 * Accepts the documented bare array, a single document (the `/:id` route), and —
 * defensively — a `{ feedback | missions | items: [...] }` wrapper. Each element
 * is the MissionFeedback JSON document itself (v1 or v2, plus a Mongo `_id`,
 * which the parser ignores); a document stored as a JSON string, or wrapped in
 * `{ mission_feedback: "<json>" }` like the topic, is accepted too. Unparseable
 * entries are dropped.
 *
 * @param data - The remote-call response data.
 * @returns The parsed snapshots, in response order.
 */
export function parseFeedbackHistory(data: unknown): MissionFeedback[] {
	let list: unknown[];
	if (Array.isArray(data)) list = data;
	else if (data != null && typeof data === "object") {
		const obj = data as Record<string, unknown>;
		const wrapped = obj.feedback ?? obj.missions ?? obj.items;
		list = Array.isArray(wrapped) ? wrapped : [data];
	} else return [];

	const out: MissionFeedback[] = [];
	for (const entry of list) {
		if (entry == null) continue;
		const inner =
			typeof entry === "object" &&
			typeof (entry as { mission_feedback?: unknown })
				.mission_feedback === "string"
				? (entry as { mission_feedback: string }).mission_feedback
				: entry;
		const fb = parseMissionFeedback(
			inner as Parameters<typeof parseMissionFeedback>[0],
		);
		if (fb) out.push(fb);
	}
	return out;
}

/**
 * Seed a history response into the store (live slots are left alone).
 *
 * The list is newest first; when it holds several snapshots of one mission only
 * the first (newest) is seeded.
 *
 * @param data - The remote-call response data.
 * @param seed - The sink (the store, unless a test swaps it).
 * @returns How many missions changed in the store.
 */
export function seedFeedbackHistory(
	data: unknown,
	seed: (fb: MissionFeedback) => boolean = seedMissionFeedbackHistory,
): number {
	const done = new Set<string>();
	let changed = 0;
	for (const fb of parseFeedbackHistory(data)) {
		if (done.has(fb.mission_id)) continue;
		done.add(fb.mission_id);
		if (seed(fb)) changed += 1;
	}
	return changed;
}

/** Minimum spacing between two list fetches, across all instances. */
const LIST_THROTTLE_MS = 5_000;

/** Minimum spacing between two fetches of the same mission. */
const MISSION_RETRY_MS = 30_000;

/** Module-level fetch bookkeeping, shared by every mounted instance. */
const fetchState = {
	lastListAt: 0,
	listKey: "",
	missionAt: new Map<string, number>(),
};

/**
 * Whether a list fetch should go out now (and record it if so).
 *
 * @param key - Identifies what asks (datasource + refresh counter); a NEW key
 *   bypasses the throttle, so a datasource that just connected or a picker that
 *   was just opened always refreshes.
 * @param now - The current time in ms.
 * @returns True when the caller should fetch.
 */
export function claimListFetch(key: string, now: number): boolean {
	if (
		key === fetchState.listKey &&
		now - fetchState.lastListAt < LIST_THROTTLE_MS
	)
		return false;
	if (key !== fetchState.listKey && now - fetchState.lastListAt < 250)
		return false; // two instances mounting in the same tick
	fetchState.listKey = key;
	fetchState.lastListAt = now;
	return true;
}

/**
 * Whether one mission's snapshot should be fetched now (and record it if so).
 * @param missionId - The mission.
 * @param now - The current time in ms.
 * @returns True when the caller should fetch.
 */
export function claimMissionFetch(missionId: string, now: number): boolean {
	const last = fetchState.missionAt.get(missionId);
	if (last != null && now - last < MISSION_RETRY_MS) return false;
	fetchState.missionAt.set(missionId, now);
	return true;
}

/** Test-only: reset the shared fetch bookkeeping. */
export function __resetFeedbackHistoryFetchState(): void {
	fetchState.lastListAt = 0;
	fetchState.listKey = "";
	fetchState.missionAt.clear();
}

/** Body once the call definitions are known (hooks need a definition). */
function HistorySyncBody(props: {
	latestDef?: RemoteCallDefinition;
	getDef?: RemoteCallDefinition;
	fallbackDef: RemoteCallDefinition;
	selectedId: string | null;
	refreshKey: number;
}) {
	const latest = useRemoteCall<Record<string, never>, unknown>(
		props.latestDef ?? props.fallbackDef,
	);
	const get = useRemoteCall<{ mission_id: string }, unknown>(
		props.getDef ?? props.fallbackDef,
	);
	const { execute: executeLatest } = latest;
	const { execute: executeGet } = get;
	const hasLatest = Boolean(props.latestDef);
	const hasGet = Boolean(props.getDef);
	const datasourceId = props.fallbackDef.datasource_id;

	// Every mission's latest snapshot: on mount, on datasource (re)connect —
	// the definitions change identity — and when the picker asks.
	useEffect(() => {
		if (!hasLatest) return;
		if (!claimListFetch(`${datasourceId}#${props.refreshKey}`, Date.now()))
			return;
		// No cancellation on cleanup: seeding a module-level store after an
		// unmount is harmless, and dropping the answer would lose it for good
		// (the throttle already claimed this fetch — StrictMode's double effect
		// run would otherwise discard every first load in development).
		void (async () => {
			const result = await executeLatest({});
			if (result.success) seedFeedbackHistory(result.data);
		})();
	}, [executeLatest, hasLatest, datasourceId, props.refreshKey]);

	// The selected mission, when the store knows nothing about it.
	const { selectedId } = props;
	useEffect(() => {
		if (!hasGet || !selectedId) return;
		if (getMissionFeedback(selectedId)) return;
		if (!claimMissionFetch(selectedId, Date.now())) return;
		void (async () => {
			const result = await executeGet({ mission_id: selectedId });
			// A 404 (MISSION_NOT_FOUND) simply means no snapshot yet.
			if (result.success) seedFeedbackHistory(result.data);
		})();
	}, [executeGet, hasGet, selectedId]);

	return null;
}

/**
 * Render-nothing component that keeps the store seeded from the C2's stored
 * feedback history. Renders nothing (and fetches nothing) when no C2 datasource
 * exposes the history calls — e.g. an older `:5000` without the routes.
 *
 * @param props.selectedId - The shown mission; fetched on its own when unknown.
 * @param props.refreshKey - Bump to force a list refresh (picker opened).
 * @param props.datasourceId - Pin to a C2 datasource; absent → any.
 */
export function MissionFeedbackHistorySync(props: {
	selectedId: string | null;
	refreshKey?: number;
	datasourceId?: string;
}) {
	const { calls } = useAvailableRemoteCalls(
		props.datasourceId ? { datasource_id: props.datasourceId } : undefined,
	);
	const latestDef = useMemo(
		() => calls.find((c) => c.name === C2Call.FeedbackLatest),
		[calls],
	);
	const getDef = useMemo(
		() => calls.find((c) => c.name === C2Call.FeedbackGet),
		[calls],
	);
	const fallbackDef = latestDef ?? getDef;
	if (!fallbackDef) return null;
	return (
		<HistorySyncBody
			latestDef={latestDef}
			getDef={getDef}
			fallbackDef={fallbackDef}
			selectedId={props.selectedId}
			refreshKey={props.refreshKey ?? 0}
		/>
	);
}
