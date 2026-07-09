/**
 * Label tables and health coloring for `sensor_msgs/msg/BatteryState` enums.
 * Index positions match the ROS message constants exactly.
 */

/** `power_supply_status` labels, indexed by the enum value (0..4). */
export const STATUS_LABELS = [
	"Unknown",
	"Charging",
	"Discharging",
	"Not charging",
	"Full",
] as const;

/** `power_supply_health` labels, indexed by the enum value (0..8). */
export const HEALTH_LABELS = [
	"Unknown",
	"Good",
	"Overheat",
	"Dead",
	"Overvoltage",
	"Unspec. failure",
	"Cold",
	"Watchdog expire",
	"Safety timer expire",
] as const;

/** `power_supply_technology` labels, indexed by the enum value (0..8). */
export const TECH_LABELS = [
	"Unknown",
	"NiMH",
	"Li-ion",
	"LiPo",
	"LiFe",
	"NiCd",
	"LiMn",
	"Ternary",
	"VRLA",
] as const;

/**
 * Semantic `Badge` variant used to color the health badge. Restricted to the
 * design-system variants so the badge tracks the active theme automatically.
 *
 * Note: the design system has no dedicated "warning" (amber) token, so the
 * warning tier (Overheat/Overvoltage/Cold) maps to the closest neutral-emphasis
 * variant, `secondary`, rather than a hardcoded palette color.
 */
export type HealthVariant = "default" | "secondary" | "destructive" | "outline";

/** Map a `power_supply_health` enum value to a semantic Badge variant. */
export function healthVariant(health: number): HealthVariant {
	switch (health) {
		case 1: // Good
			return "default";
		case 2: // Overheat
		case 4: // Overvoltage
		case 6: // Cold
			return "secondary"; // no dedicated warning token — closest neutral emphasis
		case 3: // Dead
		case 5: // Unspecified failure
		case 7: // Watchdog timer expire
		case 8: // Safety timer expire
			return "destructive";
		default: // Unknown
			return "outline";
	}
}

/** Resolve an enum value to its label, falling back to "Unknown". */
export function enumLabel(labels: readonly string[], value: number): string {
	return labels[value] ?? "Unknown";
}
