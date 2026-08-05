import { MissionStatus } from "../types/c2-types";
import type { MissionDraft } from "./mission-editor-helpers";
import { cleanMissionConfig } from "./mission-editor-helpers";

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

/**
 * Whether the C2 is idle/terminal for this mission — i.e. there is no live,
 * in-progress mission occupying the command surface that an unchanged re-Submit
 * would duplicate.
 *
 * `null`/`undefined` (no feedback yet), `NONE` (no live mission), and the
 * terminal/failed states (`COMPLETED`/`DELETED`/`STOPPED`/`FAILED`/
 * `PLANNED_FAILED`) all count as idle: a fresh Submit/re-plan is always fine.
 * The active states (`PLANNED`/`PLANNED_ALTERNATIVE`/`ACCEPTED`/`STARTED`/
 * `PAUSED`) are NOT idle — re-Submitting an unchanged config there is the
 * accidental re-plan we gate against in {@link canSubmit}.
 *
 * @param status - The live `MissionStatus`, or `null`/`undefined`.
 * @returns `true` when the mission is idle/terminal for this command surface.
 */
export function isMissionIdle(
	status: MissionStatus | null | undefined,
): boolean {
	if (status == null) return true;
	switch (status) {
		case MissionStatus.NONE:
		case MissionStatus.PLANNED_FAILED:
		case MissionStatus.FAILED:
		case MissionStatus.STOPPED:
		case MissionStatus.DELETED:
		case MissionStatus.COMPLETED:
			return true;
		default:
			return false;
	}
}

/**
 * Stable content signature of the meaningful mission config — the dirty-detector
 * for {@link canSubmit}.
 *
 * Runs the config through {@link cleanMissionConfig} first (dropping the empty
 * optional blocks JSON-Forms materializes), so two drafts that differ only in
 * half-formed `{}` blocks share a signature, then serializes with stable
 * key-order. Identical meaningful config → identical string; any real edit (a
 * geometry, a vehicle, a name, a behavior) → a different string.
 *
 * Key order is stable because `cleanMissionConfig` rebuilds the object with a
 * fixed property order and `JSON.stringify` preserves insertion order; the draft
 * is JSON-safe.
 *
 * @param config - The working mission draft.
 * @returns A stable signature string for the meaningful config content.
 */
export function missionConfigSignature(config: MissionDraft): string {
	return JSON.stringify(cleanMissionConfig(config));
}

/** Inputs to the Submit dirty-gate. */
export interface CanSubmitArgs {
	/** Live `MissionStatus` from feedback (or `null`/`undefined`). */
	status: MissionStatus | null | undefined;
	/** Signature of the operator's current working draft (or `null`). */
	currentSig: string | null;
	/** Signature last submitted for this mission (or `null` if never). */
	lastSubmittedSig: string | null;
}

/**
 * Whether Submit (initialize / re-plan) should be available.
 *
 * Submit is allowed when EITHER:
 *  - the mission is idle/terminal ({@link isMissionIdle}) — a fresh Submit is
 *    always fine when nothing live occupies the command surface; OR
 *  - the config has CHANGED since the last submit — both signatures are present
 *    and differ, so the operator has refined an active mission and may re-plan.
 *
 * The gated case is the one this prevents: an active (PLANNED/ACCEPTED/STARTED/
 * PAUSED) mission whose config is unchanged since it was submitted → Submit
 * disabled, so the operator can't accidentally re-plan an in-flight mission.
 *
 * @param args - {@link CanSubmitArgs}.
 * @returns `true` when Submit should be enabled by the dirty-gate.
 */
export function canSubmit(args: CanSubmitArgs): boolean {
	if (isMissionIdle(args.status)) return true;
	return (
		args.currentSig != null &&
		args.lastSubmittedSig != null &&
		args.currentSig !== args.lastSubmittedSig
	);
}
