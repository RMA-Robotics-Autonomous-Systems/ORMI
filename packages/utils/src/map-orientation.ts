/**
 * Bearing arithmetic for the ORMI map widgets' north indicator.
 *
 * Dependency-free on purpose — no React, no MapLibre — so the wraparound and
 * the wording can be unit-tested directly. The component that reads a live map
 * and renders this lives in `map-chrome.tsx`.
 */

/** Degrees within which a view counts as facing north. */
const NORTH_TOLERANCE_DEG = 0.5;

/** Degrees within which a view counts as looking straight down. */
const FLAT_TOLERANCE_DEG = 0.5;

/**
 * Fold any angle into `[0, 360)`.
 *
 * MapLibre reports a bearing that is signed and unbounded — it keeps counting
 * past ±180 as the operator drags — so every reader has to fold it before it
 * means anything.
 *
 * @param degrees - Any angle in degrees.
 * @returns The equivalent angle in `[0, 360)`, or `0` for a non-finite input.
 */
export function normalizeBearing(degrees: number): number {
	if (!Number.isFinite(degrees)) return 0;
	return ((degrees % 360) + 360) % 360;
}

/**
 * Render a bearing the way a heading is spoken and written: three digits.
 *
 * Zero-padded because an operator reading a column of headings needs them the
 * same width, and because "7°" and "70°" differ by a glance.
 *
 * Rounding happens **before** the final fold, not after: 359.6° rounds to 360,
 * which is not a heading — it is 000. Folding first would print "360°".
 *
 * @param degrees - Any angle in degrees.
 * @returns A three-digit heading with its degree sign, e.g. `"037°"`.
 */
export function formatBearing(degrees: number): string {
	const rounded = Math.round(normalizeBearing(degrees)) % 360;
	return `${String(rounded).padStart(3, "0")}°`;
}

/**
 * Whether the view is effectively unrotated.
 *
 * The indicator stays on screen either way — an operator must not have to
 * learn that a missing control means "north" — but this decides whether it
 * reads as a *state to act on* or as a quiet confirmation.
 *
 * @param bearing - Map bearing in degrees.
 * @returns `true` when the view is within half a degree of north.
 */
export function isNorthUp(bearing: number): boolean {
	const folded = normalizeBearing(bearing);
	return folded <= NORTH_TOLERANCE_DEG || folded >= 360 - NORTH_TOLERANCE_DEG;
}

/**
 * Whether the view is effectively looking straight down.
 *
 * Reported separately from the bearing because the two are independent and the
 * standard map widget **opens** pitched (`pitch: 45`): a tilt is its normal
 * state, not something to flag, whereas a rotation is always something the
 * operator did.
 *
 * @param pitch - Map pitch in degrees.
 * @returns `true` when the view is within half a degree of flat.
 */
export function isFlat(pitch: number): boolean {
	return !Number.isFinite(pitch) || Math.abs(pitch) <= FLAT_TOLERANCE_DEG;
}
