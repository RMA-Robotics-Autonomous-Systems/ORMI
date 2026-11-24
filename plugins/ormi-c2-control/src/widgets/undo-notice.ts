/**
 * The notice a deletion of the mission's own items leaves: "Deleted 3
 * steps", with an Undo that takes the deletion back.
 *
 * Mission items (graph nodes, links, mission assets) are deleted at once,
 * without a question, because one Undo puts them back (the mission's
 * history, `state/mission-undo.ts`). The notice is where that Undo is in
 * reach, by touch as much as by Ctrl+Z. It offers to take back THAT step
 * only: once anything else is done to the mission, the step on top is not
 * the deletion any more and the notice goes.
 */

import { getMissionHistory } from "../state/mission-history-store";

/** A deletion the operator can take back. */
export interface UndoNotice {
	missionId: string;
	/** "Deleted “Navigate”", "Deleted 3 steps". */
	text: string;
	/** The mission history's depth right after the deletion. */
	depth: number;
	/** The deletion's step label, as the history holds it. */
	label: string;
}

/**
 * The notice for the step just recorded on a mission.
 * @param missionId - The mission.
 * @param text - What the notice says.
 * @returns The notice, or null when nothing was recorded.
 */
export function undoNoticeFor(
	missionId: string | null | undefined,
	text: string,
): UndoNotice | null {
	if (!missionId) return null;
	const past = getMissionHistory(missionId).past;
	const top = past[past.length - 1];
	if (!top) return null;
	return { missionId, text, depth: past.length, label: top.label };
}

/**
 * Whether a notice still offers the step on top of the mission's history.
 * @param notice - The notice.
 * @param missionId - The mission shown.
 * @param history - The history's depth and the label of its top step.
 * @returns True while Undo would take back exactly the deletion.
 */
export function isUndoNoticeLive(
	notice: UndoNotice | null,
	missionId: string | null | undefined,
	history: { depth: number; undoLabel: string },
): notice is UndoNotice {
	return (
		notice != null &&
		notice.missionId === missionId &&
		notice.depth === history.depth &&
		notice.label === history.undoLabel
	);
}

/**
 * What a deletion in the node editor says.
 * @param nodeLabels - The labels of the nodes deleted.
 * @param links - How many links went (with the nodes, or selected).
 * @returns E.g. "Deleted “Navigate”", "Deleted 3 steps and 2 links".
 */
export function graphDeletionText(
	nodeLabels: readonly string[],
	links: number,
): string {
	const linkText = `${links} link${links === 1 ? "" : "s"}`;
	if (nodeLabels.length === 0) return `Deleted ${linkText}`;
	const nodes =
		nodeLabels.length === 1
			? `“${nodeLabels[0]}”`
			: `${nodeLabels.length} steps`;
	return links > 0 ? `Deleted ${nodes} and ${linkText}` : `Deleted ${nodes}`;
}
