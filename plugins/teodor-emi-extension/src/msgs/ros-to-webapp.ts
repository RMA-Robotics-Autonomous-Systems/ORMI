/**
 * Payload-shape parity between a recording and a live robot.
 *
 * The foxglove datasource converts a decoded message into the webapp shape
 * before publishing it, keyed on the webapp type it derives from the ROS type
 * (`UnifiedConverter.convertToWebapp`, `foxglove-source.worker.ts`). A replayed
 * recording that published raw ROS shapes under the same topics would reach
 * widgets differently from the live robot, and the difference would surface as
 * a widget that "works online but not offline".
 *
 * Two facts keep this small:
 *
 * - `emi_msgs/*` has no converter, so foxglove falls through to the raw parsed
 *   message. The EMI topics — the ones this page is about — are already raw on
 *   both paths and need nothing here.
 * - Of the ancillary topics this page reads, only `NavSatFix` has a converter.
 *   `QuaternionStamped` deliberately has none: the registry knows nothing about
 *   it, so the live path publishes it raw and so must the replay.
 *
 * KNOWN DUPLICATION. The authoritative registry is `UnifiedConverter` inside
 * `ormi-foxglove`, and a plugin→plugin dependency is not acceptable, so the one
 * entry below is copied. Recorded as a decision rather than discovered later as
 * a bug: if a third consumer ever needs this, promote the converter registry to
 * `packages/utils` instead of copying it a third time.
 */

import type { NavSatFix } from "./emi-types";

/**
 * Webapp type tags, matching what `UnifiedConverter.getWebappTypeFromROSType`
 * returns for the same ROS types.
 *
 * Deliberately one entry. Adding a type here that the registry does not carry
 * would *create* the divergence this module exists to prevent, in the opposite
 * direction: the replay would convert something the live path leaves alone.
 */
const WEBAPP_TYPE: Readonly<Record<string, string>> = {
	"sensor_msgs/msg/NavSatFix": "GeolocationPosition",
};

/**
 * The webapp type for a ROS type, falling back to the ROS name.
 *
 * Falling back rather than failing is what foxglove does, and it is why the EMI
 * types reach widgets under their own names on both paths.
 *
 * @param rosType - Fully qualified ROS 2 type name.
 * @returns The webapp type tag.
 */
export function webappTypeFor(rosType: string): string {
	return WEBAPP_TYPE[rosType] ?? rosType;
}

/** The shape `GeolocationPosition` widgets consume. */
interface GeolocationLike {
	coords: {
		latitude: number;
		longitude: number;
		altitude: number;
		accuracy: number;
		altitudeAccuracy: number;
		heading: number;
		speed: number;
	};
	timestamp: number;
}

/**
 * Convert a decoded ROS message to the webapp shape a widget expects.
 *
 * Anything without a conversion is returned untouched, which is the behaviour
 * every EMI topic relies on.
 *
 * The `NavSatFix` mapping reproduces `UnifiedConverter`'s `fromRos2` field for
 * field, including two things that look like mistakes and are not ours to fix
 * here:
 *
 * - `altitudeAccuracy`, `heading` and `speed` are read from covariance cells
 *   2, 4 and 8. That is not what those cells mean in `sensor_msgs/NavSatFix`
 *   (it is a 3×3 position covariance), but it is what every widget on the live
 *   path already receives.
 * - The covariance is only read when `Array.isArray` accepts it, and the CDR
 *   reader returns a `Float64Array` for `float64[9]` — so in practice all four
 *   derived numbers are 0 on the live path. Diverging here would mean a replay
 *   showed an accuracy the live robot never shows.
 *
 * Both are mirrored on purpose. If the upstream converter is corrected, correct
 * this in the same change.
 *
 * @param rosType - The topic's ROS 2 type name.
 * @param data - The decoded ROS message.
 * @param fallbackTimeMs - Time to stamp when the message carries no header.
 * @returns The converted payload, or `data` unchanged.
 */
export function convertToWebapp(
	rosType: string,
	data: unknown,
	fallbackTimeMs: number,
): unknown {
	if (rosType !== "sensor_msgs/msg/NavSatFix") return data;

	const fix = data as NavSatFix;
	const covariance = Array.isArray(fix.position_covariance)
		? fix.position_covariance
		: [];
	const stamp = fix.header?.stamp;
	const timestamp = stamp
		? stamp.sec * 1000 + stamp.nanosec / 1e6
		: fallbackTimeMs;

	const out: GeolocationLike = {
		coords: {
			latitude: Number(fix.latitude ?? 0),
			longitude: Number(fix.longitude ?? 0),
			altitude: Number(fix.altitude ?? 0),
			accuracy: Number(covariance[0] ?? 0),
			altitudeAccuracy: Number(covariance[2] ?? 0),
			heading: Number(covariance[4] ?? 0),
			speed: Number(covariance[8] ?? 0),
		},
		timestamp,
	};
	return out;
}
