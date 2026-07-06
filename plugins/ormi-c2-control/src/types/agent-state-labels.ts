/**
 * Human-readable labels for the `task_msgs` agent `State` enum (the `state` field
 * of `task_msgs/msg/Feedback`), for the fleet widget which would otherwise show a
 * bare number an operator can't read.
 *
 * Ground truth: `task_msgs/json/Enums.hpp` — `enum class State { INACTIVE = 0,
 * ACTIVE = 1 }`.
 */
const AGENT_STATE_LABELS: Record<number, string> = {
	0: "Inactive",
	1: "Active",
};

/**
 * Map an agent `state` value to a display label.
 *
 * Tolerates a number or a numeric/name string (the wire payload may carry either)
 * and an unknown/out-of-range value (labelled generically rather than crashing).
 *
 * @param state - The agent state from `Feedback.state` (number or string).
 * @returns A human-readable label.
 */
export function agentStateLabel(
	state: number | string | null | undefined,
): string {
	if (state == null || state === "") return "Unknown";
	if (typeof state === "string") {
		const upper = state.trim().toUpperCase();
		if (upper === "INACTIVE") return "Inactive";
		if (upper === "ACTIVE") return "Active";
		const num = Number(state);
		if (!Number.isNaN(num))
			return AGENT_STATE_LABELS[num] ?? `State ${state}`;
		return state;
	}
	return AGENT_STATE_LABELS[state] ?? `State ${state}`;
}
