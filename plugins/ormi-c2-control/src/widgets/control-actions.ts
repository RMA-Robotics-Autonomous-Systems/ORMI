import { MissionStatus } from "../types/c2-types";

/**
 * F8 lifecycle-control gating (pure, testable).
 *
 * Maps the live `MissionStatus` (from `mission_feedback`, parsed by S2) to which
 * lifecycle commands the operator may issue. Drives button enable/disable in the
 * control panel so the UI cannot send a forbidden transition.
 *
 * Authoritative state machine: §2.6. The two rules that bite:
 *  - **Submit/initialize** is always available — it (re)targets the single-mission
 *    `:5001` command surface at the active mission (§2.2). Re-submitting is also
 *    how the operator refines a Draft and re-plans.
 *  - **Approve precedes Start** — `PLANNED → STARTED` is forbidden; the path is
 *    `PLANNED → ACCEPTED (APPROVE) → STARTED (START)` (§2.2/§2.6). So Start is
 *    enabled only once the mission has reached `ACCEPTED` (or is `PAUSED`, where
 *    Start resumes).
 *
 * Defensive default (§ task): when status is unknown/missing, allow only Submit —
 * never offer Approve/Start/Pause/Stop/Delete against an unknown state.
 */

/** The lifecycle actions the control panel can issue. */
export type ControlAction =
	| "submit"
	| "approve"
	| "start"
	| "pause"
	| "stop"
	| "delete";

/** Which actions are currently allowed, keyed by action. */
export type AllowedActions = Record<ControlAction, boolean>;

/** All actions disabled — the conservative base. */
const NONE: AllowedActions = {
	submit: false,
	approve: false,
	start: false,
	pause: false,
	stop: false,
	delete: false,
};

/**
 * Compute which lifecycle actions are allowed for a given live mission status.
 *
 * @param status - The live `MissionStatus` from `mission_feedback`, or
 *   `null`/`undefined` when no feedback has arrived yet.
 * @returns The allowed-actions map.
 */
export function allowedActions(
	status: MissionStatus | null | undefined,
): AllowedActions {
	// Submit/initialize is always available — it targets/retargets the active
	// mission on :5001 and doubles as re-plan. Everything else is gated below.
	const base: AllowedActions = { ...NONE, submit: true };

	if (status == null) {
		// Unknown/missing status → conservative: only Submit (defensive, § task).
		return base;
	}

	switch (status) {
		case MissionStatus.NONE:
			// Pre-submit / no live mission: only Submit.
			return base;

		case MissionStatus.PLANNED:
		case MissionStatus.PLANNED_ALTERNATIVE:
			// Planned: may Approve, or Stop/Delete. NOT Start (Approve first).
			return { ...base, approve: true, stop: true, delete: true };

		case MissionStatus.PLANNED_FAILED:
			// Planning failed: re-submit (Draft refine) or tear down.
			return { ...base, stop: true, delete: true };

		case MissionStatus.ACCEPTED:
			// Approved & tasks dispatched: may Start, or Stop/Delete.
			return { ...base, start: true, stop: true, delete: true };

		case MissionStatus.STARTED:
			// Running: may Pause or Stop.
			return { ...base, pause: true, stop: true };

		case MissionStatus.PAUSED:
			// Paused: Start resumes, or Stop.
			return { ...base, start: true, stop: true };

		case MissionStatus.STOPPED:
		case MissionStatus.FAILED:
			// Terminal-ish: only Delete (and a fresh Submit).
			return { ...base, delete: true };

		case MissionStatus.COMPLETED:
		case MissionStatus.DELETED:
			// Done: nothing but a fresh Submit.
			return base;

		default:
			// Unknown numeric status the C2 may add → conservative: only Submit.
			return base;
	}
}
