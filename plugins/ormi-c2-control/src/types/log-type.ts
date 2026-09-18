/**
 * Swarm-log severity (`c2_msgs/msg/SwarmLog.log_type`).
 *
 * GROUND TRUTH — `centralized_msgs/json/Enums.hpp`:
 *
 * ```cpp
 * enum class LogType { INFO = 0, WARNING = 1, ERROR = 2, FATAL = 3 };
 * ```
 *
 * ⚠ Do NOT follow the backend's own `EnumsTools.hpp` helper. Its
 * `LogType`-to-string switch is missing `break` statements (CODE_AUDIT, 0 of 8
 * copies fixed), so it falls through and reports the wrong severity for every
 * value but the last. The enum declaration above is the contract; the helper is
 * a bug.
 *
 * Why this matters here: the swarm-log widget rendered `log_type` as a bare
 * integer, so a FATAL line read `[3]` and looked exactly like everything else.
 * The stabilization plan's central finding is that this system's failures are
 * invisible — 95.2 % of 351k log documents are one repeated message logged at
 * INFO, and only **eight** ERROR rows exist in the whole database. The one place
 * severity does reach an operator should therefore state it in words and colour.
 */

/** Severity levels a `SwarmLog` entry can carry. */
export enum SwarmLogType {
	INFO = 0,
	WARNING = 1,
	ERROR = 2,
	FATAL = 3,
}

/** Display label per severity. */
const LABELS: Record<SwarmLogType, string> = {
	[SwarmLogType.INFO]: "INFO",
	[SwarmLogType.WARNING]: "WARN",
	[SwarmLogType.ERROR]: "ERROR",
	[SwarmLogType.FATAL]: "FATAL",
};

/**
 * Tailwind classes per severity. INFO stays muted (it is 96 % of the volume and
 * must not shout); WARNING/ERROR/FATAL escalate, FATAL with a filled background
 * so it survives a fast-scrolling list.
 */
const CLASSES: Record<SwarmLogType, string> = {
	[SwarmLogType.INFO]: "text-muted-foreground",
	[SwarmLogType.WARNING]: "text-warning",
	[SwarmLogType.ERROR]: "text-destructive",
	[SwarmLogType.FATAL]: "text-destructive font-bold",
};

/** Row-level emphasis so a severe line is visible without reading the badge. */
const ROW_CLASSES: Record<SwarmLogType, string> = {
	[SwarmLogType.INFO]: "",
	[SwarmLogType.WARNING]: "bg-warning/10",
	[SwarmLogType.ERROR]: "bg-destructive/10",
	[SwarmLogType.FATAL]: "bg-destructive/20",
};

/**
 * Coerce a wire `log_type` to a {@link SwarmLogType}.
 *
 * Tolerates the three shapes seen on the topic: the numeric enum (rosbridge),
 * a numeric string (`"2"`), and a name (`"ERROR"`, any case). Anything else —
 * including a value outside 0–3, which is what a widened backend enum would look
 * like to this build — returns `null`, and the caller shows the raw value rather
 * than guessing a severity it does not know.
 *
 * @param value - The raw `log_type` field.
 * @returns The severity, or null when it cannot be decoded.
 */
export function parseSwarmLogType(value: unknown): SwarmLogType | null {
	if (typeof value === "number") {
		return Number.isInteger(value) && value in LABELS
			? (value as SwarmLogType)
			: null;
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.length === 0) return null;
		if (/^\d+$/.test(trimmed)) {
			const numeric = Number(trimmed);
			return numeric in LABELS ? (numeric as SwarmLogType) : null;
		}
		const upper = trimmed.toUpperCase();
		for (const [key, label] of Object.entries(LABELS)) {
			if (label === upper) return Number(key) as SwarmLogType;
		}
		// Accept the C++ spelling too (`WARNING` vs the compact `WARN` label).
		if (upper === "WARNING") return SwarmLogType.WARNING;
		return null;
	}
	return null;
}

/**
 * Human label for a raw `log_type`.
 *
 * @param value - The raw `log_type` field.
 * @returns `INFO`/`WARN`/`ERROR`/`FATAL`, or the raw value stringified when it
 *   cannot be decoded (information is never dropped).
 */
export function swarmLogTypeLabel(value: unknown): string {
	const parsed = parseSwarmLogType(value);
	if (parsed != null) return LABELS[parsed];
	return value == null ? "?" : String(value);
}

/**
 * Tailwind classes for the severity badge.
 * @param value - The raw `log_type` field.
 * @returns The class string (muted for an undecodable value).
 */
export function swarmLogTypeClass(value: unknown): string {
	const parsed = parseSwarmLogType(value);
	return parsed != null ? CLASSES[parsed] : "text-muted-foreground";
}

/**
 * Tailwind classes for the whole log row.
 * @param value - The raw `log_type` field.
 * @returns The class string (empty for INFO and for an undecodable value).
 */
export function swarmLogRowClass(value: unknown): string {
	const parsed = parseSwarmLogType(value);
	return parsed != null ? ROW_CLASSES[parsed] : "";
}
