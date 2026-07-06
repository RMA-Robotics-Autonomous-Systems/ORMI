"use client";

import { Check, Pause } from "lucide-react";

import { MissionStatus } from "../types/c2-types";
import {
	MissionStateTone,
	MissionStepState,
	deriveMissionStepper,
	missionStateBadge,
} from "./mission-steps";

/**
 * Prominent, color-coded mission state-machine panel for the F8 control widget.
 *
 * Renders a clearly labeled "Mission state" block: a large current-state badge
 * (full C2 status set, color-coded by {@link missionStateBadge}) over a stepper
 * `Submit → Planned → Accepted → Started → Done` derived from the live
 * {@link MissionStatus}. The current step is highlighted with a ring, past steps
 * are checked green, future steps dimmed; PLANNED_ALTERNATIVE tints amber,
 * PLANNED_FAILED red, and the Pause⇄Start hold is flagged on the Started step.
 *
 * Display only — the `allowedActions()`-gated buttons remain the action surface;
 * all derivation lives in the pure helpers (tested separately). Module-level
 * component, stable identity (Pattern #10).
 */

/** Tailwind treatment per step state. */
const STEP_DOT_CLASS: Record<MissionStepState, string> = {
	done: "bg-success text-success-foreground border-success",
	current: "bg-info text-info-foreground border-info",
	upcoming: "bg-muted text-muted-foreground border-border",
	warn: "bg-warning text-warning-foreground border-warning",
	fail: "bg-destructive text-destructive-foreground border-destructive",
};

/** Ring highlight on the active (non-done) step so it visibly stands out. */
const STEP_RING_CLASS: Partial<Record<MissionStepState, string>> = {
	current: "ring-2 ring-offset-1 ring-offset-background ring-info",
	warn: "ring-2 ring-offset-1 ring-offset-background ring-warning",
	fail: "ring-2 ring-offset-1 ring-offset-background ring-destructive",
};

/** Label colour per step state. */
const STEP_LABEL_CLASS: Record<MissionStepState, string> = {
	done: "text-foreground",
	current: "text-foreground font-semibold",
	upcoming: "text-muted-foreground",
	warn: "text-warning font-semibold",
	fail: "text-destructive font-semibold",
};

/** Prominent current-state badge treatment per tone. */
const BADGE_TONE_CLASS: Record<MissionStateTone, string> = {
	neutral: "bg-muted text-foreground border border-border",
	info: "bg-info text-info-foreground",
	active: "bg-success text-success-foreground",
	warn: "bg-warning text-warning-foreground",
	fail: "bg-destructive text-destructive-foreground",
	success: "bg-success text-success-foreground",
};

/** Connector colour: solid once the preceding step is reached. */
function connectorClass(prevState: MissionStepState): string {
	return prevState === "done" ? "bg-success" : "bg-border";
}

/** Props for the {@link MissionStateMachine}. */
interface MissionStateMachineProps {
	/** The live mission status (null when no feedback has arrived yet). */
	status: MissionStatus | null | undefined;
}

/**
 * The mission state-machine panel: a labeled block with the prominent
 * current-state badge and the highlighted stepper.
 *
 * @param props - The live status.
 * @returns The panel element.
 */
export function MissionStateMachine(props: MissionStateMachineProps) {
	const model = deriveMissionStepper(props.status);
	const badge = missionStateBadge(props.status);

	return (
		<div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
					Mission state
				</span>
				<span
					className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold leading-none shadow-sm ${BADGE_TONE_CLASS[badge.tone]}`}
					title={badge.label}
				>
					{badge.label}
				</span>
			</div>

			{/* Stepper — shown for the in-progress states; terminal states
			    (Completed/Failed/Stopped/Deleted) are conveyed by the badge. */}
			{model.steps.length > 0 && (
				<div className="flex items-center gap-1 flex-wrap">
					{model.steps.map((step, index) => (
						<div key={step.id} className="flex items-center gap-1">
							{index > 0 && (
								<div
									className={`h-1 w-4 shrink-0 rounded ${connectorClass(
										model.steps[index - 1]?.state ??
											"upcoming",
									)}`}
								/>
							)}
							<div className="flex items-center gap-1.5">
								<div
									className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold leading-none ${STEP_DOT_CLASS[step.state]} ${STEP_RING_CLASS[step.state] ?? ""}`}
									title={step.label}
								>
									{step.state === "done" ? (
										<Check className="h-3 w-3" />
									) : (
										index + 1
									)}
								</div>
								<span
									className={`text-[11px] leading-none ${STEP_LABEL_CLASS[step.state]}`}
								>
									{step.label}
								</span>
								{/* Pause⇄Start hold hint on the Started step. */}
								{step.id === "started" && model.paused && (
									<span
										className="inline-flex items-center"
										title="Paused — Start resumes"
									>
										<Pause className="h-3 w-3 text-warning" />
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
