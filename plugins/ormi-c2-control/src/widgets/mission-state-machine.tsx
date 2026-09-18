"use client";

import { Badge } from "@workspace/ui/components/badge";
import { Check, Pause } from "lucide-react";

import { MissionStatus } from "../types/c2-types";
import {
	MissionStateTone,
	MissionStepState,
	deriveMissionStepper,
	missionStateBadge,
} from "./mission-steps";

/**
 * Prominent, color-coded mission state-machine panel for the mission control
 * widget.
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
 * component, stable identity.
 */

/** Tailwind treatment per step state. */
const STEP_DOT_CLASS: Record<MissionStepState, string> = {
	done: "bg-success text-success-foreground border-success",
	current: "bg-info text-info-foreground border-info",
	upcoming: "bg-muted text-muted-foreground border-border",
	warn: "bg-warning text-warning-foreground border-warning",
	// Text on a destructive fill is white: `destructive-foreground` is the
	// same red as the fill in light mode.
	fail: "bg-destructive text-white border-destructive",
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

/** Current-state `Badge` variant per tone (a status: never `default`). */
const BADGE_VARIANT: Record<
	MissionStateTone,
	"success" | "warning" | "destructive" | "outline"
> = {
	neutral: "outline",
	info: "outline",
	active: "success",
	warn: "warning",
	fail: "destructive",
	success: "success",
};

/** Dot colour of the compact one-line stepper, per step state. */
const COMPACT_DOT_CLASS: Record<MissionStepState, string> = {
	done: "bg-success",
	current: "bg-info",
	upcoming: "bg-muted-foreground",
	warn: "bg-warning",
	fail: "bg-destructive",
};

/** Connector colour: solid once the preceding step is reached. */
function connectorClass(prevState: MissionStepState): string {
	return prevState === "done" ? "bg-success" : "bg-border";
}

/** Props for the {@link MissionStateMachine}. */
interface MissionStateMachineProps {
	/** The live mission status (null when no feedback has arrived yet). */
	status: MissionStatus | null | undefined;
	/**
	 * Narrow container: the stepper collapses to one non-wrapping line,
	 * "Step n/5 · <label>", instead of a row of numbered dots.
	 */
	compact?: boolean;
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

	// The step the mission is at: the first one not yet done (all done → last).
	const currentIndex = Math.max(
		0,
		model.steps.findIndex((step) => step.state !== "done"),
	);
	const current =
		model.steps.find((step) => step.state !== "done") ??
		model.steps[model.steps.length - 1];

	return (
		<div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
			<div className="flex items-center gap-2 min-w-0">
				<span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Mission state
				</span>
				<Badge
					variant={BADGE_VARIANT[badge.tone]}
					className="ml-auto"
					title={badge.label}
				>
					{badge.label}
				</Badge>
			</div>

			{/* Stepper — shown for the in-progress states; terminal states
			    (Completed/Failed/Stopped/Deleted) are conveyed by the badge. */}
			{props.compact && current && (
				<div
					className="flex items-center gap-1.5 min-w-0 text-xs"
					title={model.steps.map((step) => step.label).join(" → ")}
				>
					<span
						className={`size-2 shrink-0 rounded-full ${COMPACT_DOT_CLASS[current.state]}`}
						aria-hidden
					/>
					<span className="truncate whitespace-nowrap">
						<span className="text-muted-foreground tabular-nums">
							Step {currentIndex + 1}/{model.steps.length}
						</span>
						{" · "}
						<span className={STEP_LABEL_CLASS[current.state]}>
							{current.label}
						</span>
					</span>
					{current.id === "started" && model.paused && (
						<span
							className="inline-flex shrink-0 items-center"
							title="Paused — Start resumes"
						>
							<Pause className="size-3 text-warning" />
						</span>
					)}
				</div>
			)}
			{!props.compact && model.steps.length > 0 && (
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
									className={`flex size-5 items-center justify-center rounded-full border text-[10px] font-bold leading-none ${STEP_DOT_CLASS[step.state]} ${STEP_RING_CLASS[step.state] ?? ""}`}
									title={step.label}
								>
									{step.state === "done" ? (
										<Check className="size-3" />
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
										<Pause className="size-3 text-warning" />
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
