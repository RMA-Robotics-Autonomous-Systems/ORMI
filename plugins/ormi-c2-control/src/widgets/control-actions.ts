import { MissionStatus } from "../types/c2-types";
import type { MissionDraft } from "./mission-editor-helpers";
import { cleanMissionConfig } from "./mission-editor-helpers";

/**
 * Lifecycle-control gating for the mission control panel (pure, testable).
 *
 * Maps the live `MissionStatus` (from `mission_feedback`) to which lifecycle
 * commands the operator may issue. Drives button enable/disable in the control
 * panel so the UI cannot send a forbidden transition.
 *
 * The C2's mission state machine has two rules that bite:
 *  - **Submit/initialize** is always available — it (re)targets the single-mission
 *    `:5001` command surface at the active mission. Re-submitting is also how the
 *    operator refines a Draft and re-plans.
 *  - **Approve precedes Start** — `PLANNED → STARTED` is forbidden; the path is
 *    `PLANNED → ACCEPTED (APPROVE) → STARTED (START)`. So Start is enabled only
 *    once the mission has reached `ACCEPTED` (or is `PAUSED`, where Start
 *    resumes).
 *
 * Unknown/missing status is asymmetric, because the two kinds of error are:
 *  - Approve/Start/Pause/Delete stay OFF — never advance a mission from a state
 *    nobody has confirmed.
 *  - **Stop stays ON** in every state that is not known to be terminal
 *    ({@link isTerminalStatus}), including no status at all. The panel reads
 *    live feedback only, so a history snapshot, a missing topic or a silent
 *    publisher all arrive here as null — and a robot moving under a panel that
 *    cannot hear it is exactly when the operator needs Stop. A redundant Stop
 *    costs a refused command; a missing one cost a robot driving on.
 */

/** The lifecycle actions the control panel can issue. */
export type ControlAction =
	"submit" | "approve" | "start" | "pause" | "stop" | "delete";

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
 * Whether a status is known to be final — the mission is over and there is
 * nothing left to stop. Anything else (including null and a numeric status this
 * build does not know) may still have robots moving.
 *
 * @param status - The live `MissionStatus`, or null/undefined when unknown.
 * @returns True only for STOPPED / FAILED / COMPLETED / DELETED.
 */
export function isTerminalStatus(
	status: MissionStatus | null | undefined,
): boolean {
	switch (status) {
		case MissionStatus.STOPPED:
		case MissionStatus.FAILED:
		case MissionStatus.COMPLETED:
		case MissionStatus.DELETED:
			return true;
		default:
			return false;
	}
}

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
	// mission on :5001 and doubles as re-plan. Stop is available whenever the
	// mission is not known to be over. Everything else is gated below.
	const base: AllowedActions = {
		...NONE,
		submit: true,
		stop: !isTerminalStatus(status),
	};

	if (status == null) {
		// Unknown/missing status → advance nothing, but never withhold Stop.
		return base;
	}

	switch (status) {
		case MissionStatus.NONE:
			// Pre-submit / no live mission reported: Submit, and Stop in case
			// the C2 still has a runtime this panel has not heard about.
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
			// Terminal: only Delete (and a fresh Submit).
			return { ...base, delete: true };

		case MissionStatus.COMPLETED:
		case MissionStatus.DELETED:
			// Done: nothing but a fresh Submit.
			return base;

		default:
			// Unknown numeric status the C2 may add → advance nothing; Stop
			// stays available (it is not a known terminal state).
			return base;
	}
}

/**
 * Whether a mission's live status shows that a dispatched command took effect.
 *
 * A 2xx from the C2 only says the command was accepted for processing; the
 * mission's own feedback is the confirmation. Stop is confirmed only by a
 * terminal status — any other movement (say a first feedback message arriving
 * with `STARTED`) is not evidence the robot stood down. Every other command is
 * confirmed by the status moving off the one it was dispatched from.
 *
 * @param action - The command that was sent.
 * @param fromStatus - The live status when it was sent (null when unknown).
 * @param status - The mission's live status now (null when unknown).
 * @returns True once the feedback confirms the command.
 */
export function isCommandConfirmed(
	action: ControlAction,
	fromStatus: MissionStatus | null,
	status: MissionStatus | null | undefined,
): boolean {
	if (status == null) return false;
	if (action === "stop") return isTerminalStatus(status);
	return status !== fromStatus;
}

/** What the control panel knows when it decides whether a command may be sent. */
export interface GatingInput {
	/** Whether a mission is selected/pinned — i.e. whether a target exists. */
	hasMission: boolean;
	/** Whether a mission-feedback topic is configured. */
	hasTopic: boolean;
	/**
	 * The status in the feedback store's slot. ⚠ With no mission selected the
	 * store returns the LATEST mission's feedback, which is why this must be
	 * filtered rather than used directly.
	 */
	storeStatus: MissionStatus | null | undefined;
}

/**
 * The status that may gate a lifecycle command — or `null` when none may.
 *
 * THE BUG THIS CLOSES — `useMissionFeedback(null)` deliberately returns the
 * **latest** mission's feedback so a panel with nothing pinned is not blank. The
 * control panel fed that straight into {@link allowedActions}, so with no mission
 * selected it showed another mission's status AND enabled that mission's Stop
 * button — while `change_status` was dispatched with no `mission_id`, landing on
 * whatever `:5001` had last initialized. Three different missions could be
 * involved in one click: the one displayed, the one intended, and the one acted
 * on.
 *
 * The rule: a status gates a command only when it is THIS panel's mission's
 * status. No selection, or no feedback topic, means no gating status — and
 * {@link allowedActions} then permits only Submit and Stop, both of which are
 * additionally gated on a selection ({@link gatedActions}).
 *
 * @param input - {@link GatingInput}.
 * @returns The gating status, or null.
 */
export function gatingStatus(input: GatingInput): MissionStatus | null {
	if (!input.hasTopic) return null;
	if (!input.hasMission) return null;
	return input.storeStatus ?? null;
}

/**
 * Which lifecycle actions a control panel may offer, given everything it knows.
 *
 * {@link allowedActions} answers "what does this status permit"; this answers
 * "may we act at all". Without a selected mission the answer is nothing —
 * including Submit, which needs a `mission_id` just as much as the others.
 *
 * @param input - {@link GatingInput}.
 * @returns The allowed-actions map after the no-target gate.
 */
export function gatedActions(input: GatingInput): AllowedActions {
	if (!input.hasMission) return { ...NONE };
	return allowedActions(gatingStatus(input));
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
	/**
	 * The C2 answered a command for this mission with `NO_TARGET_MISSION`: it
	 * holds no runtime for it (typically after a backend restart), whatever the
	 * last feedback still says. Nothing is in flight to duplicate, so Submit is
	 * the operator's next step and the dirty-gate must not block it.
	 */
	c2HasNoRuntime?: boolean;
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
 * A `NO_TARGET_MISSION` answer ({@link CanSubmitArgs.c2HasNoRuntime}) also
 * re-enables it: the C2 has nothing to duplicate.
 *
 * @param args - {@link CanSubmitArgs}.
 * @returns `true` when Submit should be enabled by the dirty-gate.
 */
export function canSubmit(args: CanSubmitArgs): boolean {
	if (args.c2HasNoRuntime) return true;
	if (isMissionIdle(args.status)) return true;
	return (
		args.currentSig != null &&
		args.lastSubmittedSig != null &&
		args.currentSig !== args.lastSubmittedSig
	);
}

/** The lifecycle actions that can be the panel's "next step" (never Stop). */
export type PrimaryControlAction = "submit" | "approve" | "start";

/**
 * Which lifecycle command is the operator's next step, so the panel can give
 * exactly that one button the primary (filled) treatment and leave the others
 * outlined. Two filled buttons side by side say nothing about what to press.
 *
 * The progression is Submit → Approve → Start. Submit comes first because,
 * once narrowed by {@link canSubmit}, it is only offered on an active mission
 * when the config has changed since it was submitted — and then re-planning is
 * the next step, since Approve would approve the plan the operator just edited
 * away from. Otherwise Approve (PLANNED) or Start (ACCEPTED / PAUSED). Pause,
 * Stop and Delete are never "next" — Stop is the safety control and carries its
 * own destructive styling, and a teardown is never the suggested step. Returns
 * null when none applies (a running, unedited mission).
 *
 * Takes the gate's answer before transient holds (a command in flight, one
 * awaiting feedback), so the emphasis does not flicker while a click settles.
 *
 * @param allowed - What the status permits ({@link gatedActions}), with
 *   `submit` already narrowed by {@link canSubmit}.
 * @returns The action to render as primary, or null.
 */
export function primaryAction(
	allowed: Pick<AllowedActions, PrimaryControlAction>,
): PrimaryControlAction | null {
	if (allowed.submit) return "submit";
	if (allowed.approve) return "approve";
	if (allowed.start) return "start";
	return null;
}

/** The mission status the panel displays, and whether it is being heard now. */
export interface DisplayedStatus {
	/** The status to render (null when nothing at all is known). */
	status: MissionStatus | null;
	/** True when it is this panel's live gating status; false for a stored one. */
	live: boolean;
}

/**
 * The status the control panel DISPLAYS — distinct from the one it gates on.
 *
 * Gating rests on live feedback only ({@link gatingStatus}). Displaying only that
 * printed "Unknown" for a mission whose last feedback (a history snapshot, or
 * live feedback heard by another panel) said Completed, right beside a feedback
 * panel showing Completed — two panels contradicting each other about one
 * mission. The live status wins when there is one; otherwise the last known
 * status is shown, flagged as not live so it is never read as current.
 *
 * @param liveStatus - The gating status ({@link gatingStatus}), or null.
 * @param lastKnown - The mission's last stored status (any origin), or null.
 * @returns What to display and whether it is live.
 */
export function displayedStatus(
	liveStatus: MissionStatus | null,
	lastKnown: MissionStatus | null | undefined,
): DisplayedStatus {
	if (liveStatus != null) return { status: liveStatus, live: true };
	return { status: lastKnown ?? null, live: false };
}
