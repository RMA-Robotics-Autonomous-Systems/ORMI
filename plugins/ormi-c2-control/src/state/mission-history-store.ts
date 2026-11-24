"use client";

/**
 * The missions' undo / redo histories, keyed by `mission_id`, for the session.
 *
 * Holds data only: the three mission stores record into it
 * ({@link recordMissionCommand}), and `mission-undo.ts` takes a step and
 * applies it back through them. Keeping the stores out of this module is
 * what lets them import it without a cycle.
 *
 * Each mission keeps its own history while the operator switches between
 * missions; a Save keeps it (an Undo after a save makes the mission unsaved
 * again); a load that brings different content (a remote change, a reload)
 * and a deleted mission clear it.
 *
 * ⚠ SNAPSHOT DISCIPLINE — read through `useSyncExternalStore` with primitive
 * snapshots (booleans, a label string), never a `useMemo` keyed on a version
 * counter: the React Compiler strips the dead read and freezes the memo on
 * its first result (AGENTS.md, "React Compiler + external mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

import {
	amendLastCommand,
	EMPTY_MISSION_HISTORY,
	type MissionCommand,
	type MissionDocParts,
	type MissionHistory,
	pushCommand,
} from "./mission-history";

/** mission_id → its history. */
let histories: Record<string, MissionHistory> = {};

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * A mission's history, outside React. Treat as read-only.
 * @param missionId - The mission.
 * @returns Its history (empty when it has none).
 */
export function getMissionHistory(
	missionId: string | null | undefined,
): MissionHistory {
	if (!missionId) return EMPTY_MISSION_HISTORY;
	return histories[missionId] ?? EMPTY_MISSION_HISTORY;
}

/**
 * Replace a mission's history. For `mission-undo.ts`, which moves a step
 * between `past` and `future`.
 * @param missionId - The mission.
 * @param history - Its new history.
 */
export function setMissionHistory(
	missionId: string,
	history: MissionHistory,
): void {
	if (histories[missionId] === history) return;
	histories = { ...histories, [missionId]: history };
	emit();
}

/**
 * Record one applied operator edit as a step.
 * @param missionId - The mission it changed.
 * @param command - What it changed, before and after.
 */
export function recordMissionCommand(
	missionId: string,
	command: MissionCommand,
): void {
	setMissionHistory(
		missionId,
		pushCommand(getMissionHistory(missionId), command),
	);
}

/**
 * Fold a derived write into the mission's last step, when the part it
 * derives from is exactly what that step left. Otherwise the write follows
 * a load, not a step, and nothing is recorded.
 *
 * @param missionId - The mission.
 * @param source - The part the write derives from, and its current value.
 * @param before - Each part the write changed, as it was.
 * @param after - Each part as it is now.
 * @returns Whether a step was amended.
 */
export function amendMissionCommand(
	missionId: string,
	source: MissionDocParts,
	before: MissionDocParts,
	after: MissionDocParts,
): boolean {
	const history = getMissionHistory(missionId);
	const last = history.past[history.past.length - 1];
	if (!last) return false;
	const follows = Object.entries(source).every(
		([part, value]) =>
			part in last.after &&
			last.after[part as keyof MissionDocParts] === value,
	);
	if (!follows) return false;
	setMissionHistory(missionId, amendLastCommand(history, before, after));
	return true;
}

/**
 * Forget a mission's history: its content was replaced from outside (a
 * remote change, a reload), or the mission was deleted.
 * @param missionId - The mission.
 */
export function clearMissionHistory(
	missionId: string | null | undefined,
): void {
	if (!missionId || histories[missionId] === undefined) return;
	const { [missionId]: _dropped, ...rest } = histories;
	void _dropped;
	histories = rest;
	emit();
}

/** Whether a mission has a step to undo. */
export function canUndoMission(id: string | null | undefined): boolean {
	return getMissionHistory(id).past.length > 0;
}

/** Whether a mission has a step to redo. */
export function canRedoMission(id: string | null | undefined): boolean {
	return getMissionHistory(id).future.length > 0;
}

/**
 * How many steps Undo can take back. With the label, it tells whether the
 * step on top is still the one a notice offers to take back.
 */
export function missionUndoDepth(id: string | null | undefined): number {
	return getMissionHistory(id).past.length;
}

/** The label of the step Undo would take back, or "". */
export function missionUndoLabel(id: string | null | undefined): string {
	const past = getMissionHistory(id).past;
	return past[past.length - 1]?.label ?? "";
}

/** The label of the step Redo would do again, or "". */
export function missionRedoLabel(id: string | null | undefined): string {
	return getMissionHistory(id).future[0]?.label ?? "";
}

/**
 * Subscribe to history changes.
 * @param listener - Change callback.
 * @returns Unsubscribe function.
 */
export function subscribeMissionHistory(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** What the Undo and Redo controls show for a mission. */
export interface MissionUndoState {
	canUndo: boolean;
	canRedo: boolean;
	/** The step Undo would take back ("Add node"), or "". */
	undoLabel: string;
	/** The step Redo would do again, or "". */
	redoLabel: string;
	/** How many steps Undo can take back. */
	depth: number;
}

/**
 * React hook: what Undo and Redo can do for a mission. Each field is its own
 * primitive snapshot, so a component re-renders only on a real change.
 *
 * @param missionId - The mission.
 * @returns Whether each has a step, and the steps' labels.
 */
export function useMissionUndoState(
	missionId: string | null | undefined,
): MissionUndoState {
	const getUndo = useCallback(() => canUndoMission(missionId), [missionId]);
	const getRedo = useCallback(() => canRedoMission(missionId), [missionId]);
	const getUndoLabel = useCallback(
		() => missionUndoLabel(missionId),
		[missionId],
	);
	const getRedoLabel = useCallback(
		() => missionRedoLabel(missionId),
		[missionId],
	);
	const getDepth = useCallback(
		() => missionUndoDepth(missionId),
		[missionId],
	);
	return {
		canUndo: useSyncExternalStore(
			subscribeMissionHistory,
			getUndo,
			getUndo,
		),
		canRedo: useSyncExternalStore(
			subscribeMissionHistory,
			getRedo,
			getRedo,
		),
		undoLabel: useSyncExternalStore(
			subscribeMissionHistory,
			getUndoLabel,
			getUndoLabel,
		),
		redoLabel: useSyncExternalStore(
			subscribeMissionHistory,
			getRedoLabel,
			getRedoLabel,
		),
		depth: useSyncExternalStore(
			subscribeMissionHistory,
			getDepth,
			getDepth,
		),
	};
}

/** Test-only: reset all module-level state. */
export function __resetMissionHistoryStore(): void {
	histories = {};
	listeners.clear();
}
