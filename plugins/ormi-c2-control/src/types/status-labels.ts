import { MissionStatus } from "./c2-types";

/**
 * Human-readable labels for the `MissionStatus` enum (§2.6), for display
 * widgets that render the live mission state.
 */
const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
	[MissionStatus.NONE]: "None",
	[MissionStatus.PLANNED]: "Planned",
	[MissionStatus.PLANNED_ALTERNATIVE]: "Planned (alternative)",
	[MissionStatus.PLANNED_FAILED]: "Planning failed",
	[MissionStatus.ACCEPTED]: "Accepted",
	[MissionStatus.STARTED]: "Started",
	[MissionStatus.PAUSED]: "Paused",
	[MissionStatus.FAILED]: "Failed",
	[MissionStatus.STOPPED]: "Stopped",
	[MissionStatus.DELETED]: "Deleted",
	[MissionStatus.COMPLETED]: "Completed",
};

/**
 * Map a `MissionStatus` enum value to a display label.
 *
 * Tolerates an unknown/out-of-range numeric status (the C2 is the authority on
 * the enum and may add states) by labelling it generically rather than crashing.
 *
 * @param status - The numeric mission status from `mission_feedback`.
 * @returns A human-readable label.
 */
export function missionStatusLabel(status: number | null | undefined): string {
	if (status == null) return "Unknown";
	return MISSION_STATUS_LABELS[status as MissionStatus] ?? `Status ${status}`;
}
