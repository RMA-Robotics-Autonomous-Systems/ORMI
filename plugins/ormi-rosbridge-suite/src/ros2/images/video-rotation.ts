/**
 * Quarter-turn rotation of a video feed, as persisted in the widget's
 * `rotation` setting (degrees clockwise: 0, 90, 180 or 270).
 */

/** One rotation step, in degrees. */
const QUARTER_TURN = 90;

/**
 * Read the persisted rotation defensively. Stored settings outlive the build
 * that wrote them, so anything that is not a whole number of quarter turns
 * reads as upright.
 * @param value - The raw `rotation` setting.
 * @returns 0, 90, 180 or 270.
 */
export function readRotation(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	if (value % QUARTER_TURN !== 0) return 0;
	return ((value % 360) + 360) % 360;
}

/**
 * Rotate by a number of quarter turns.
 * @param rotation - Current rotation, as returned by {@link readRotation}.
 * @param quarterTurns - Positive is clockwise, negative counter-clockwise.
 * @returns 0, 90, 180 or 270.
 */
export function rotateBy(rotation: number, quarterTurns: number): number {
	return readRotation(rotation + quarterTurns * QUARTER_TURN);
}
