import { PlannerState } from "./planner-state";

/** A display descriptor for a planner state (badge label + tone + tooltip). */
export interface PlannerStateBadge {
	/** Short badge label. */
	label: string;
	/** Badge treatment bucket — `fail` → destructive. */
	tone: "info" | "success" | "fail";
	/** Tooltip / longer description shown on hover. */
	description: string;
}

/**
 * Map a planner state to its operator-facing badge descriptor, or null when
 * there is nothing worth surfacing (the `initialized` pre-planning state and
 * unknown/absent states show no badge — the mission status already covers them).
 *
 * The planner emits only the integer state (no error string), so a `failed`
 * badge carries a generic, actionable reason rather than a machine message.
 *
 * @param state - The mission's planner state, or null when unknown.
 * @returns The badge descriptor, or null when nothing should be shown.
 */
export function plannerStateBadge(
	state: PlannerState | null | undefined,
): PlannerStateBadge | null {
	switch (state) {
		case "planning":
			return {
				label: "Planning…",
				tone: "info",
				description:
					"The planner is computing a plan for this mission.",
			};
		case "planned":
			return {
				label: "Planned",
				tone: "success",
				description: "The planner produced a plan for this mission.",
			};
		case "failed":
			return {
				label: "Planning failed",
				tone: "fail",
				description:
					"The planner could not plan this mission. Check that the mission geometry is inside the map and reachable.",
			};
		default:
			// `initialized` / unknown / absent → no badge.
			return null;
	}
}
