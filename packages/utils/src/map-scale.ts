/**
 * Metric scale-bar arithmetic for the ORMI map widgets.
 *
 * Dependency-free on purpose — no React, no MapLibre — so the rounding and the
 * wording can be unit-tested directly. The component that measures a live map
 * and renders this is `map-chrome.tsx`, on its own subpath.
 *
 * ORMI does not use MapLibre's own `ScaleControl`, and the reason is the exact
 * range this work opens up. That control rounds through
 * `pow10 = 10 ** (String(Math.floor(d)).length - 1)`, which is `1` for every
 * distance below 10 m and therefore cannot produce a value under 1 m: ask it
 * for a bar spanning 0.8 m and it reports "1 m" and draws the bar 25% too
 * long. Below roughly z20 that never comes up; at the new zoom ceiling it is
 * the only range the operator is in. A scale bar that is quietly wrong is
 * worse than none, because it is the thing being trusted to read a distance.
 */

/**
 * Leading digits a scale bar is allowed to end on, ascending.
 *
 * 1/2/3/5 per decade — the conventional cartographic ladder, and the one that
 * keeps the bar within a factor of two of the space available at every zoom.
 */
const NICE_STEPS = [1, 2, 3, 5] as const;

/** A resolved scale bar: how far it spans, how wide to draw it, what it says. */
export interface ScaleBar {
	/** Ground distance the bar spans, in metres. */
	meters: number;
	/** Width to draw the bar at, in CSS pixels. Never exceeds the budget. */
	widthPx: number;
	/** Operator-facing label for {@link meters}: "30 cm", "2 m", "5 km". */
	label: string;
}

/**
 * Pick the bar to draw for a given map resolution and pixel budget.
 *
 * Always rounds DOWN to a nice distance, so the drawn bar fits the budget and
 * the label is exact rather than approximate — an operator measuring a track
 * against it is reading a real number, not a rounded one.
 *
 * @param metersPerPixel - Ground metres covered by one CSS pixel.
 * @param maxWidthPx - Largest bar width the layout can give.
 * @returns The bar, or `undefined` when either input is not a usable positive
 *   number (a map that has not laid out yet reports a zero-height container).
 */
export function resolveScaleBar(
	metersPerPixel: number,
	maxWidthPx: number,
): ScaleBar | undefined {
	if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0)
		return undefined;
	if (!Number.isFinite(maxWidthPx) || maxWidthPx <= 0) return undefined;

	const meters = niceDistanceAtMost(metersPerPixel * maxWidthPx);
	if (meters <= 0) return undefined;

	return {
		meters,
		// Clamped: floating point on the decade arithmetic can leave the nice
		// value a hair above the budget, and a bar that overhangs its own
		// container is more visible than the rounding it came from.
		widthPx: Math.min(meters / metersPerPixel, maxWidthPx),
		label: formatDistance(meters),
	};
}

/**
 * Largest 1/2/3/5-times-a-power-of-ten distance not exceeding `maxMeters`.
 *
 * @param maxMeters - Upper bound, in metres.
 * @returns The nice distance, or `0` for a non-positive bound.
 */
function niceDistanceAtMost(maxMeters: number): number {
	if (!Number.isFinite(maxMeters) || maxMeters <= 0) return 0;

	const decade = 10 ** Math.floor(Math.log10(maxMeters));
	const normalised = maxMeters / decade;

	let step: number = NICE_STEPS[0];
	for (const candidate of NICE_STEPS) {
		if (normalised >= candidate) step = candidate;
	}
	return step * decade;
}

/**
 * Render a ground distance in the unit an operator would say it in.
 *
 * The unit switches on the value rather than being fixed, because the maps now
 * span six orders of magnitude: "0.0003 km" and "0.3 m" and "30 cm" are the
 * same distance and only one of them is readable.
 *
 * @param meters - Distance in metres.
 * @returns Label with its unit, or an em dash for a non-positive distance.
 */
export function formatDistance(meters: number): string {
	if (!Number.isFinite(meters) || meters <= 0) return "—";
	if (meters >= 1000) return `${round2(meters / 1000)} km`;
	if (meters >= 1) return `${round2(meters)} m`;
	if (meters >= 0.01) return `${round2(meters * 100)} cm`;
	return `${round2(meters * 1000)} mm`;
}

/**
 * Render a map resolution as a per-pixel ground distance.
 *
 * Reported alongside the bar because the bar answers "how far is that?" and
 * this answers "how much finer can this get?" — the question an operator asks
 * when a feature is a few pixels across and they cannot tell whether they are
 * looking at the data's resolution or the screen's.
 *
 * @param metersPerPixel - Ground metres covered by one CSS pixel.
 * @returns Label with its unit, or an em dash when not a usable number.
 */
export function formatResolution(metersPerPixel: number): string {
	if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return "—";
	if (metersPerPixel >= 1) return `${precision2(metersPerPixel)} m/px`;
	if (metersPerPixel >= 0.01)
		return `${precision2(metersPerPixel * 100)} cm/px`;
	return `${precision2(metersPerPixel * 1000)} mm/px`;
}

/**
 * Two decimal places at most, trailing zeros dropped.
 *
 * Needed because the decade arithmetic is binary floating point: 0.3 m becomes
 * `30.000000000000004` cm on the way to a label.
 *
 * @param value - Number to render.
 * @returns Decimal string.
 */
function round2(value: number): string {
	return String(Math.round(value * 100) / 100);
}

/**
 * Two significant digits, trailing zeros dropped.
 *
 * @param value - Number to render.
 * @returns Decimal string.
 */
function precision2(value: number): string {
	return String(Number(value.toPrecision(2)));
}
