"use client";

/**
 * Undo and Redo for a mission: one history across its three working copies.
 *
 * The draft, the behaviour graph and the map's assets each live in their
 * own store, and each store records an operator edit as a step of the
 * mission's history (`mission-history-store.ts`). {@link editMission} is the
 * entry for an edit that changes MORE than one of them, recorded as one step,
 * and {@link undoMission} / {@link redoMission} put every part a step changed
 * back, through each store's non-recording restore. Whichever panel the
 * operator is in, one Ctrl+Z takes back the last thing done to the mission.
 *
 * Only the mission's unsaved working copy is in it. A stored map feature is
 * saved the moment it is confirmed, and is never a step here.
 */

import type { MissionAssets } from "../widgets/mission-assets";
import type { MissionDraft } from "../widgets/mission-editor-helpers";
import type { MissionGraph } from "../widgets/mission-graph";
import {
	editMissionAssets,
	getMissionAssets,
	restoreMissionAssets,
} from "./mission-assets-store";
import {
	editMissionDraft,
	getMissionDraft,
	restoreMissionDraft,
} from "./mission-draft-store";
import {
	editMissionGraph,
	getMissionGraph,
	restoreMissionGraph,
} from "./mission-graph-store";
import type { MissionDocParts } from "./mission-history";
import { redoStep, undoStep } from "./mission-history";
import {
	getMissionHistory,
	recordMissionCommand,
	setMissionHistory,
} from "./mission-history-store";

/** Per part, the change {@link editMission} applies. */
export interface MissionEdit {
	draft?: (draft: MissionDraft) => MissionDraft;
	graph?: (graph: MissionGraph) => MissionGraph;
	assets?: (assets: MissionAssets) => MissionAssets;
}

/**
 * Apply an operator edit to one or more parts of a mission and record it as
 * ONE step, so a change that spans panels is one Undo. A part whose slot is
 * not loaded, or whose updater changes nothing, is left out; with nothing
 * changed, nothing is recorded.
 *
 * @param missionId - The mission.
 * @param label - The step's name for Undo ("Import Gate").
 * @param edit - Per part, the change.
 * @param options - `gesture`: key shared by the edits of one gesture.
 * @returns Whether anything changed.
 */
export function editMission(
	missionId: string,
	label: string,
	edit: MissionEdit,
	options: { gesture?: string } = {},
): boolean {
	const before: MissionDocParts = {};
	const after: MissionDocParts = {};
	if (edit.draft) {
		const prev = getMissionDraft(missionId);
		editMissionDraft(missionId, edit.draft, { record: false });
		const next = getMissionDraft(missionId);
		if (prev && next !== prev) {
			before.draft = prev;
			after.draft = next;
		}
	}
	if (edit.graph) {
		const prev = getMissionGraph(missionId);
		editMissionGraph(missionId, edit.graph, { record: false });
		const next = getMissionGraph(missionId);
		if (prev && next !== prev) {
			before.graph = prev;
			after.graph = next;
		}
	}
	if (edit.assets) {
		const prev = getMissionAssets(missionId);
		editMissionAssets(missionId, edit.assets, { record: false });
		const next = getMissionAssets(missionId);
		if (prev && next !== prev) {
			before.assets = prev;
			after.assets = next;
		}
	}
	if (Object.keys(after).length === 0) return false;
	recordMissionCommand(missionId, {
		label,
		gesture: options.gesture,
		before,
		after,
	});
	return true;
}

/** Put each part of a step's snapshot back, recording nothing. */
function restoreParts(missionId: string, parts: MissionDocParts): void {
	if (parts.draft !== undefined)
		restoreMissionDraft(missionId, parts.draft as MissionDraft);
	if (parts.graph !== undefined)
		restoreMissionGraph(missionId, parts.graph as MissionGraph);
	if (parts.assets !== undefined)
		restoreMissionAssets(missionId, parts.assets as MissionAssets);
}

/**
 * Take back the mission's last step. Each part it changed goes back to what
 * it was, and is unsaved unless that is what was last saved.
 *
 * @param missionId - The mission.
 * @returns The step's label, or null when there was none.
 */
export function undoMission(
	missionId: string | null | undefined,
): string | null {
	if (!missionId) return null;
	const step = undoStep(getMissionHistory(missionId));
	if (!step) return null;
	// History first: a store's listener that reads it sees the step moved.
	setMissionHistory(missionId, step.history);
	restoreParts(missionId, step.command.before);
	return step.command.label;
}

/**
 * Do again the step last taken back.
 *
 * @param missionId - The mission.
 * @returns The step's label, or null when there was none.
 */
export function redoMission(
	missionId: string | null | undefined,
): string | null {
	if (!missionId) return null;
	const step = redoStep(getMissionHistory(missionId));
	if (!step) return null;
	setMissionHistory(missionId, step.history);
	restoreParts(missionId, step.command.after);
	return step.command.label;
}
