/**
 * Label tables and severity coloring for `diagnostic_msgs/msg/DiagnosticStatus`
 * levels. Index positions match the ROS message constants exactly:
 * `OK = 0`, `WARN = 1`, `ERROR = 2`, `STALE = 3`.
 */

/** `level` labels, indexed by the enum value (0..3). */
export const LEVEL_LABELS = ["OK", "Warn", "Error", "Stale"] as const;

/**
 * Semantic `Badge` variant used to color a level badge. Restricted to the
 * design-system variants so the badge tracks the active theme automatically.
 */
export type LevelVariant = "success" | "warning" | "destructive" | "secondary";

/** Map a diagnostic `level` enum value to a semantic Badge variant. */
export function levelVariant(level: number): LevelVariant {
	switch (level) {
		case 0: // OK
			return "success";
		case 1: // WARN
			return "warning";
		case 2: // ERROR
			return "destructive";
		default: // STALE (3) and anything unexpected
			return "secondary";
	}
}

/**
 * Sort key that orders statuses worst-first: ERROR > STALE > WARN > OK.
 * Higher rank sorts earlier when sorting descending.
 */
export function levelRank(level: number): number {
	switch (level) {
		case 2: // ERROR
			return 3;
		case 3: // STALE
			return 2;
		case 1: // WARN
			return 1;
		default: // OK (0) and anything unexpected
			return 0;
	}
}

/**
 * Resolve a `level` enum value to its label. Out-of-range levels fall back to
 * "Unknown" (never "OK") so a garbage level reads as unknown, consistent with
 * {@link levelVariant} coloring it as the neutral `secondary` variant.
 */
export function levelLabel(level: number): string {
	return LEVEL_LABELS[level] ?? "Unknown";
}
