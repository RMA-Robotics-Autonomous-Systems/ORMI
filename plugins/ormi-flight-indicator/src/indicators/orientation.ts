import { Quaternion } from "@workspace/ormi-core/types";

/**
 * Locate the attitude quaternion in a message one of the orientation
 * indicators subscribed to.
 *
 * The level and heading indicators both read an orientation and both accept
 * the several shapes that carry one, because a robot publishes its attitude in
 * whichever of them its driver happened to choose:
 *
 * - `IMU` and `Pose` are *wrappers*: each has exactly one field of quaternion
 *   shape (`orientation`), so stepping over the wrapper is a fact rather than
 *   a guess.
 * - `geometry_msgs/msg/QuaternionStamped` arrives unconverted, with the
 *   rotation under `quaternion` beside the header.
 * - A bare `geometry_msgs/msg/Quaternion` *is* the rotation.
 *
 * Deliberately no fallback beyond those: a message that carries a rotation
 * somewhere else needs the operator to say where, and a dial fed a guessed
 * field shows a plausible wrong attitude that nobody catches.
 *
 * @param message - One buffered message from the bound topic.
 * @returns The quaternion, or `null` when the message carries none.
 */
export function readOrientation(message: unknown): Quaternion | null {
	if (!message || typeof message !== "object") return null;

	const candidate = message as {
		quaternion?: unknown;
		orientation?: unknown;
	};

	const nested = candidate.quaternion ?? candidate.orientation;
	if (isQuaternion(nested)) return nested;
	if (isQuaternion(message)) return message;

	return null;
}

/**
 * Whether a value carries the four numeric components of a rotation.
 *
 * `w` is the discriminator: a `Vector3` has `x`/`y`/`z` and would otherwise
 * pass for a rotation with an undefined scalar part, which reads as a valid
 * attitude rather than as missing data.
 *
 * @param value - Value to test.
 * @returns True when the value is a quaternion.
 */
function isQuaternion(value: unknown): value is Quaternion {
	if (!value || typeof value !== "object") return false;
	const q = value as Record<string, unknown>;
	return (
		typeof q.x === "number" &&
		typeof q.y === "number" &&
		typeof q.z === "number" &&
		typeof q.w === "number"
	);
}
