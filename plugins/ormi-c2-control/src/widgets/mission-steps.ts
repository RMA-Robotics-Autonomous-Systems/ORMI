import { MissionStatus } from "../types/c2-types";
import { missionStatusLabel } from "../types/status-labels";

/**
 * Pure step-derivation for the mission state-machine stepper (orientation-only
 * visual in the control panel header). Maps the live {@link MissionStatus} to a
 * compact `Submit → Planned → Accepted → Started → Done` progression so the
 * operator can see where the mission is at a glance, with the Pause⇄Start loop
 * indicated. This is display logic only — gating stays in
 * {@link allowedActions}; never duplicate it here.
 *
 * No React — pure data so it can be unit-tested.
 */

/** The ordered steps in the stepper. */
export type MissionStepId =
	| "submit"
	| "planned"
	| "accepted"
	| "started"
	| "done";

/** Per-step render state. */
export type MissionStepState =
	| "done" // a past step, completed
	| "current" // the active step
	| "upcoming" // a future step, dimmed
	| "warn" // current step in a degraded variant (PLANNED_ALTERNATIVE)
	| "fail"; // current step in a failed variant (PLANNED_FAILED)

/** The canonical step order (also the render order). */
export const MISSION_STEPS: readonly MissionStepId[] = [
	"submit",
	"planned",
	"accepted",
	"started",
	"done",
] as const;

/**
 * A terminal outcome — when set, the stepper collapses to a single outcome chip
 * rather than showing the progression.
 */
export interface MissionOutcome {
	/** Short outcome label. */
	label: string;
	/** Chip treatment bucket. */
	tone: "success" | "fail" | "neutral";
}

/** The derived stepper view for a given live status. */
export interface MissionStepperModel {
	/** Per-step state, in {@link MISSION_STEPS} order. Empty when terminal. */
	steps: { id: MissionStepId; label: string; state: MissionStepState }[];
	/** True when the mission is paused (drives the Pause⇄Start loop hint). */
	paused: boolean;
	/** Set for terminal states — render this chip INSTEAD of the steps. */
	outcome: MissionOutcome | null;
}

/** Display label per step. */
const STEP_LABELS: Record<MissionStepId, string> = {
	submit: "Submit",
	planned: "Planned",
	accepted: "Accepted",
	started: "Started",
	done: "Done",
};

/**
 * The 0-based index of the step a non-terminal status sits ON. Terminal statuses
 * return -1 (the caller renders an outcome chip instead).
 */
function activeStepIndex(status: MissionStatus | null | undefined): number {
	switch (status) {
		case MissionStatus.NONE:
		case null:
		case undefined:
			return 0; // Submit
		case MissionStatus.PLANNED:
		case MissionStatus.PLANNED_ALTERNATIVE:
		case MissionStatus.PLANNED_FAILED:
			return 1; // Planned
		case MissionStatus.ACCEPTED:
			return 2; // Accepted
		case MissionStatus.STARTED:
		case MissionStatus.PAUSED:
			return 3; // Started
		default:
			// Unknown numeric status the C2 may add → treat as pre-submit.
			return 0;
	}
}

/**
 * Resolve a terminal {@link MissionOutcome}, or null for a non-terminal status.
 * COMPLETED → success; FAILED → fail; STOPPED/DELETED → neutral.
 *
 * @param status - The live mission status.
 * @returns The outcome chip, or null when the mission is still in progress.
 */
function terminalOutcome(
	status: MissionStatus | null | undefined,
): MissionOutcome | null {
	switch (status) {
		case MissionStatus.COMPLETED:
			return { label: "Completed", tone: "success" };
		case MissionStatus.FAILED:
			return { label: "Failed", tone: "fail" };
		case MissionStatus.STOPPED:
			return { label: "Stopped", tone: "neutral" };
		case MissionStatus.DELETED:
			return { label: "Deleted", tone: "neutral" };
		default:
			return null;
	}
}

/**
 * Derive the stepper model for a live {@link MissionStatus}.
 *
 * Past steps are `done`, the active step is `current` (or `warn`/`fail` on the
 * Planned step for PLANNED_ALTERNATIVE / PLANNED_FAILED), and future steps are
 * `upcoming`. Terminal statuses (COMPLETED/FAILED/STOPPED/DELETED) collapse to
 * an outcome chip with no steps. Unknown numeric statuses fall back to the
 * pre-submit progression (never crash).
 *
 * @param status - The live mission status, or null/undefined when no feedback
 *   has arrived yet.
 * @returns The stepper model.
 */
export function deriveMissionStepper(
	status: MissionStatus | null | undefined,
): MissionStepperModel {
	const outcome = terminalOutcome(status);
	if (outcome) {
		return { steps: [], paused: false, outcome };
	}

	const active = activeStepIndex(status);
	const degraded = status === MissionStatus.PLANNED_ALTERNATIVE;
	const failed = status === MissionStatus.PLANNED_FAILED;

	const steps = MISSION_STEPS.map((id, index) => {
		let state: MissionStepState;
		if (index < active) state = "done";
		else if (index > active) state = "upcoming";
		else if (failed) state = "fail";
		else if (degraded) state = "warn";
		else state = "current";
		return { id, label: STEP_LABELS[id], state };
	});

	return {
		steps,
		paused: status === MissionStatus.PAUSED,
		outcome: null,
	};
}

/** Semantic tone bucket for the prominent current-state badge. */
export type MissionStateTone =
	| "neutral" // pre-submit / stopped / deleted
	| "info" // planned / accepted (in progress, nominal)
	| "active" // started (running)
	| "warn" // planned-alternative / paused (degraded / held)
	| "fail" // planning-failed / failed
	| "success"; // completed

/** The prominent current-state badge: the live status label + a colour tone. */
export interface MissionStateBadge {
	label: string;
	tone: MissionStateTone;
}

/** Tone per C2 mission status (full state set from C2 `Enums.hpp`). */
const STATUS_TONE: Record<MissionStatus, MissionStateTone> = {
	[MissionStatus.NONE]: "neutral",
	[MissionStatus.PLANNED]: "info",
	[MissionStatus.PLANNED_ALTERNATIVE]: "warn",
	[MissionStatus.PLANNED_FAILED]: "fail",
	[MissionStatus.ACCEPTED]: "info",
	[MissionStatus.STARTED]: "active",
	[MissionStatus.PAUSED]: "warn",
	[MissionStatus.FAILED]: "fail",
	[MissionStatus.STOPPED]: "neutral",
	[MissionStatus.DELETED]: "neutral",
	[MissionStatus.COMPLETED]: "success",
};

/**
 * Derive the prominent current-state badge for a live {@link MissionStatus}.
 *
 * Covers the full C2 status set with a clear operator-facing label and a colour
 * tone; `null`/`undefined`/`NONE` (no feedback yet) reads "Awaiting submit".
 *
 * @param status - The live mission status.
 * @returns The badge label + tone.
 */
export function missionStateBadge(
	status: MissionStatus | null | undefined,
): MissionStateBadge {
	if (
		status === null ||
		status === undefined ||
		status === MissionStatus.NONE
	) {
		return { label: "Awaiting submit", tone: "neutral" };
	}
	return {
		label: missionStatusLabel(status),
		tone: STATUS_TONE[status] ?? "neutral",
	};
}
