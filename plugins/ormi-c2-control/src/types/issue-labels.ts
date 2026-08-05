/**
 * Human-readable decoder for the C2 `MissionIssue` enum carried in the optional
 * numeric `issue` field of `mission_feedback`.
 *
 * Ground truth: `c2_msgs/json/Enums.hpp`. The wire carries a bare number (e.g.
 * `23`); this module resolves it to a short label, a full description and a
 * severity so widgets can render a meaningful badge instead of "Issue 23".
 *
 * Pure data map + lookup — no React.
 */

/** Severity bucket for a `MissionIssue` code. */
export type MissionIssueSeverity = "none" | "warn" | "fail";

/** Resolved, display-ready form of a `MissionIssue` code. */
export interface MissionIssue {
	/** The numeric C2 issue code. */
	code: number;
	/** Short label for a badge. */
	label: string;
	/** Full operator-facing description. */
	description: string;
	/** Severity bucket driving badge treatment. */
	severity: MissionIssueSeverity;
}

/**
 * The `MissionIssue` taxonomy, keyed by numeric code. `0` (NONE) is intentionally
 * omitted from rendering by {@link getMissionIssue}, but kept here for completeness.
 */
const MISSION_ISSUES: Record<number, MissionIssue> = {
	0: {
		code: 0,
		label: "No issue",
		description: "No issue.",
		severity: "none",
	},
	10: {
		code: 10,
		label: "Mission ID already in use",
		description:
			"Mission ID is already in use. The mission configuration will be overwritten; state set to INIT.",
		severity: "warn",
	},
	11: {
		code: 11,
		label: "UGV unavailable",
		description:
			"At least one UGV is unavailable. A reduced set of UGVs will be used; state set to PLANNED_ALTERNATIVE.",
		severity: "warn",
	},
	12: {
		code: 12,
		label: "Unknown config data",
		description:
			"The mission_config contains unknown keys; that data is ignored.",
		severity: "warn",
	},
	13: {
		code: 13,
		label: "Status change ignored",
		description:
			"The requested mission status change was not valid; the transition is ignored.",
		severity: "warn",
	},
	14: {
		code: 14,
		label: "Swarm planner unreachable",
		description:
			"Could not communicate with the swarm planner; mission state will not change.",
		severity: "warn",
	},
	15: {
		code: 15,
		label: "Edge module unreachable",
		description:
			"Could not communicate with at least one edge module; mission state will not change.",
		severity: "warn",
	},
	16: {
		code: 16,
		label: "Autonomy module unreachable",
		description:
			"Could not communicate with at least one autonomy module; mission state will not change.",
		severity: "warn",
	},
	20: {
		code: 20,
		label: "Config parsing failed",
		description:
			"The mission_config could not be parsed; mission set to FAILED.",
		severity: "fail",
	},
	21: {
		code: 21,
		label: "Config missing data",
		description:
			"The mission_config lacks sufficient data for planning; mission set to FAILED.",
		severity: "fail",
	},
	22: {
		code: 22,
		label: "Mission compromised",
		description:
			"The mission is compromised and cannot continue; mission set to FAILED.",
		severity: "fail",
	},
	23: {
		code: 23,
		label: "Swarm planner unreachable (failed)",
		description:
			"Could not communicate with the swarm planner; process failure, mission set to FAILED.",
		severity: "fail",
	},
	24: {
		code: 24,
		label: "Edge modules unreachable (failed)",
		description:
			"Could not communicate with edge modules; process failure, mission set to FAILED.",
		severity: "fail",
	},
	25: {
		code: 25,
		label: "Autonomy module unreachable (failed)",
		description:
			"Could not communicate with at least one autonomy module; timeout, mission set to FAILED.",
		severity: "fail",
	},
	30: {
		code: 30,
		label: "Not enough vehicles",
		description:
			"Not enough vehicles for the configuration; state set to PLANNED_ALTERNATIVE.",
		severity: "warn",
	},
	31: {
		code: 31,
		label: "Not enough coverage",
		description:
			"Not enough coverage for the configuration; state set to PLANNED_ALTERNATIVE.",
		severity: "warn",
	},
	32: {
		code: 32,
		label: "Date compromised",
		description:
			"Requested start/end date is compromised in the planning solution; state set to PLANNED anyway.",
		severity: "warn",
	},
	40: {
		code: 40,
		label: "No planning solution",
		description:
			"No planning solution found; re-init with adjusted config needed; state set to PLANNED_FAILED.",
		severity: "fail",
	},
	41: {
		code: 41,
		label: "Planner process failed",
		description:
			"Swarm planner process failed; state set to PLANNED_FAILED.",
		severity: "fail",
	},
};

/**
 * Decode a numeric `MissionIssue` code into a display-ready issue.
 *
 * Returns `null` for `null`/`undefined`/`0` (NONE) so callers can choose not to
 * render anything for "no issue". An unknown non-zero code yields a sensible
 * fallback (keeping the raw code visible) rather than losing information.
 *
 * @param code - The numeric `issue` from `mission_feedback`.
 * @returns The resolved issue, or `null` when there is no issue to show.
 */
export function getMissionIssue(
	code: number | null | undefined,
): MissionIssue | null {
	if (code == null || code === 0) return null;

	const known = MISSION_ISSUES[code];
	if (known) return known;

	return {
		code,
		label: `Issue ${code}`,
		description: "Unrecognized mission issue code.",
		severity: "warn",
	};
}

/**
 * Convenience: the short label for a `MissionIssue` code, or `null` for no issue.
 * @param code - The numeric `issue` from `mission_feedback`.
 * @returns The short label, or `null`.
 */
export function missionIssueLabel(
	code: number | null | undefined,
): string | null {
	return getMissionIssue(code)?.label ?? null;
}

/**
 * Convenience: the severity for a `MissionIssue` code. Returns `"none"` when
 * there is no issue to show.
 * @param code - The numeric `issue` from `mission_feedback`.
 * @returns The severity bucket.
 */
export function missionIssueSeverity(
	code: number | null | undefined,
): MissionIssueSeverity {
	return getMissionIssue(code)?.severity ?? "none";
}

/**
 * The `MissionIssue` codes that report the C2 *command-control* could not reach
 * the swarm planner: `14` (WARN — "state will not change") and `23` (FAILED).
 *
 * These are reconciled against the planner's OWN `/multi_robot/planner/state`
 * topic (written by the planner itself). The command-control's reachability
 * check can emit a stale/false disconnect while the planner is demonstrably
 * working, so callers suppress these codes when the live planner state proves it
 * reachable — otherwise the operator sees "swarm planner unreachable" for a
 * planner that is actively planning.
 */
const PLANNER_REACHABILITY_ISSUE_CODES: ReadonlySet<number> = new Set([14, 23]);

/**
 * Whether a `MissionIssue` code is a swarm-planner-reachability report (14 / 23).
 * @param code - The numeric `issue` from `mission_feedback`.
 * @returns True for codes 14 and 23.
 */
export function isPlannerReachabilityIssue(
	code: number | null | undefined,
): boolean {
	return code != null && PLANNER_REACHABILITY_ISSUE_CODES.has(code);
}
