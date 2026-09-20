/**
 * When the mission map's authoring affordances stand down — pure, so the rule is
 * stated in one place and tested rather than spread through a 3000-line widget.
 *
 * The map has two modes behind one toolbar button: **Edit**, where the operator
 * draws and reshapes, and **View**, where the same geometry renders but nothing
 * is armed. The operator picks between them — except that approving a mission
 * commits its plan, and a map still armed over a committed plan is an invitation
 * to edit something the C2 has already dispatched.
 */

import { MissionStatus } from "../types/c2-types";

/**
 * Whether a mission's plan is committed — approved, and possibly already
 * running.
 *
 * `ACCEPTED` is the state `APPROVE` produces; `STARTED` and `PAUSED` are past
 * it. The terminal and failed states are deliberately **not** committed: a
 * `STOPPED` / `FAILED` / `PLANNED_FAILED` mission is refined and re-submitted,
 * which is authoring, and {@link allowedActions} keeps Submit available there
 * for exactly that reason. The two predicates have to agree — a status that
 * still offers Approve must never read as committed, or the map would lock
 * before the operator had approved anything.
 *
 * `null` (no feedback yet, or no feedback topic configured) is not committed:
 * absence of news is not a reason to take authoring away.
 *
 * @param status - The live `MissionStatus`, or `null`/`undefined`.
 * @returns True when the plan is approved or beyond.
 */
export function isMissionCommitted(
	status: MissionStatus | null | undefined,
): boolean {
	return (
		status === MissionStatus.ACCEPTED ||
		status === MissionStatus.STARTED ||
		status === MissionStatus.PAUSED
	);
}

/** What decides whether the map is showing rather than authoring. */
export interface ViewOnlyInput {
	/** The operator's own View/Edit choice: true when they picked View. */
	readOnly: boolean;
	/** True while the mission context is active (map-feature editing is not it). */
	inMissionContext: boolean;
	/** Live `MissionStatus` of the selected mission, if any has arrived. */
	status: MissionStatus | null | undefined;
	/**
	 * The status under which the operator last deliberately chose Edit, or null
	 * if they have not since it last mattered.
	 *
	 * This is what makes the rule a **transition** rather than a lock. Comparing
	 * against the live status means an operator who really does want to edit an
	 * approved mission says so once and is left alone — until the status moves
	 * again (approved → started), which is a new fact and takes the map back to
	 * View. A plain "committed ⇒ read-only" would instead bounce the Edit button
	 * back the instant it was pressed, with nothing on screen explaining why.
	 */
	editUnlockedAt: MissionStatus | null;
}

/**
 * Resolve whether the map is in View (showing) rather than Edit (authoring).
 *
 * Derived, not stored: a status-driven `setState` in an effect would be a
 * cascading render on every feedback message, and silencing the lint rule for it
 * would opt the whole map body out of React Compiler.
 *
 * The mission context is required because map-feature authoring — roads,
 * geofences, risk areas — belongs to the map, not to any mission. An operator
 * mid-polygon on a geofence must not be thrown into View because a mission they
 * are not looking at was approved, possibly from another console.
 *
 * @param input - See {@link ViewOnlyInput}.
 * @returns True when authoring affordances should be stood down.
 */
export function resolveViewOnly({
	readOnly,
	inMissionContext,
	status,
	editUnlockedAt,
}: ViewOnlyInput): boolean {
	if (readOnly) return true;
	if (!inMissionContext) return false;
	if (!isMissionCommitted(status)) return false;
	return editUnlockedAt !== status;
}
