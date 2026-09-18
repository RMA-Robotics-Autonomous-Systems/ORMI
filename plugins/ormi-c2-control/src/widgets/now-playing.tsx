"use client";

/**
 * "Now playing" — what is running, unmistakably.
 *
 * Shared pieces, all reading ONLY the per-mission feedback store (no topic of
 * their own — whichever widget subscribes to `mission_feedback` feeds it). The
 * Mission Feedback widget's own header (name picker, status pill, "also
 * running" pills) lives in `mission-feedback.tsx`; here:
 *
 *  - {@link activeMissions} / {@link useNow}: small shared helpers.
 *  - {@link useAutoSelectActiveMission}: with nothing selected and exactly one
 *    live active mission, select it — the operator opening the page mid-mission
 *    lands on it instead of on an empty screen.
 */

import { useEffect, useState } from "react";

import { MissionFeedback } from "../types/mission-feedback";
import {
	feedbackFreshness,
	getMissionFeedbackUpdatedAt,
	useLiveMissionFeedback,
} from "../state/mission-feedback-store";
import {
	getSelectedMission,
	setSelectedMission,
} from "../state/selection-store";
import { missionPhase } from "./mission-progress";

/**
 * A wall clock that re-renders its caller every `intervalMs`.
 * @param intervalMs - Tick period.
 * @returns `Date.now()` as of the last tick.
 */
export function useNow(intervalMs = 1000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}

/**
 * The active missions (accepted / started / paused) among every known mission.
 * @param missions - Every known mission's feedback.
 * @returns The active ones, in store order.
 */
export function activeMissions(missions: MissionFeedback[]): MissionFeedback[] {
	return missions.filter((fb) => missionPhase(fb.status) === "active");
}

/**
 * Select the single live active mission when nothing is selected.
 *
 * "Live" excludes a mission whose feedback went stale: a committed mission
 * whose publisher died is still listed (flagged stale) but must not be picked
 * over the operator's head. Never overrides an existing selection — an operator
 * reviewing a finished mission keeps it.
 *
 * The decision runs in an effect that reads the store's timestamps directly
 * (never in render, where the React Compiler could memoise the read away).
 *
 * @param enabled - False for a widget pinned to a fixed mission.
 */
export function useAutoSelectActiveMission(enabled: boolean): void {
	// LIVE missions only: a stored history snapshot of a mission that was
	// running when it was stored must never be selected over the operator.
	const missions = useLiveMissionFeedback();
	const now = useNow(2000);
	useEffect(() => {
		if (!enabled || getSelectedMission()) return;
		const live = activeMissions(missions).filter(
			(fb) =>
				!feedbackFreshness(
					getMissionFeedbackUpdatedAt(fb.mission_id),
					Date.now(),
				).stale,
		);
		if (live.length === 1) setSelectedMission(live[0]!.mission_id);
	}, [enabled, missions, now]);
}

/**
 * {@link useAutoSelectActiveMission} as a render-nothing component, so its 2 s
 * ticker re-renders only itself and not the (large) widget body hosting it.
 */
export function AutoSelectActiveMission(props: { enabled: boolean }) {
	useAutoSelectActiveMission(props.enabled);
	return null;
}
