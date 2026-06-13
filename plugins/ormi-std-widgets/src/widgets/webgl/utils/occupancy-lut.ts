/**
 * Occupancy-grid colorization via a 256-entry RGBA lookup table.
 *
 * Canonical occupancy byte encoding:
 *   0     = free
 *   1-253 = cost gradient
 *   254   = lethal / occupied
 *   255   = unknown
 *
 * The colormap math (lerp, plasma, costmap gradient) runs only when the LUT is
 * (re)built — i.e. on a color-mode/opacity/show-unknown config change. The hot
 * per-cell recolor is then 4 byte copies per cell into a caller-owned buffer
 * with zero allocations, instead of recomputing gradients and allocating RGB
 * tuples for every cell of every update.
 */

import type { MapGridColorMode } from "../types/scene-3d-types";

/** Linear interpolation between two RGB triplets. */
const lerpRgb = (
	a: [number, number, number],
	b: [number, number, number],
	t: number,
): [number, number, number] => [
	Math.round(a[0] + (b[0] - a[0]) * t),
	Math.round(a[1] + (b[1] - a[1]) * t),
	Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Approximate plasma colormap. */
const plasmaRgb = (t: number): [number, number, number] => {
	const stops: [number, number, number][] = [
		[13, 8, 135],
		[126, 3, 168],
		[204, 72, 120],
		[248, 149, 64],
		[240, 249, 33],
	];
	const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
	const lo = Math.floor(scaled);
	const hi = Math.min(lo + 1, stops.length - 1);
	return lerpRgb(stops[lo]!, stops[hi]!, scaled - lo);
};

/** Green -> yellow -> red gradient (costmap). */
const costmapRgb = (t: number): [number, number, number] => {
	const clamped = Math.max(0, Math.min(1, t));
	if (clamped < 0.5)
		return lerpRgb([13, 184, 38], [255, 224, 0], clamped * 2);
	return lerpRgb([255, 224, 0], [230, 13, 13], (clamped - 0.5) * 2);
};

/** Map a canonical occupancy byte (0-255) to an RGBA tuple. */
const toRgba = (
	value: number,
	mode: MapGridColorMode,
	alpha: number,
	showUnknown: boolean,
): [number, number, number, number] => {
	if (value > 254) {
		// unknown
		if (!showUnknown) return [0, 0, 0, 0];
		return [115, 115, 115, Math.round(alpha * 0.45 * 255)];
	}
	if (value === 0) {
		// free
		if (mode === "grayscale")
			return [242, 242, 242, Math.round(alpha * 0.25 * 255)];
		return [13, 184, 38, Math.round(alpha * 0.12 * 255)];
	}

	const t = (value - 1) / 253;
	let rgb: [number, number, number];
	if (mode === "grayscale") {
		const g = Math.round(255 - t * 235);
		rgb = [g, g, g];
	} else if (mode === "heatmap") {
		rgb = plasmaRgb(t);
	} else {
		rgb = costmapRgb(t);
	}
	return [rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)];
};

/**
 * Build the 256-entry RGBA lookup table for an occupancy colormap config.
 * Opacity is baked into the alpha channel.
 *
 * @param mode - Colormap variant.
 * @param opacity - Base opacity (0-1), baked into per-entry alpha.
 * @param showUnknown - Whether unknown cells (255) are visible.
 * @returns Flat `Uint8ClampedArray` of 256 RGBA entries (1024 bytes).
 */
export function buildOccupancyLut(
	mode: MapGridColorMode,
	opacity: number,
	showUnknown: boolean,
): Uint8ClampedArray {
	const lut = new Uint8ClampedArray(256 * 4);
	for (let value = 0; value < 256; value++) {
		const [r, g, b, a] = toRgba(value, mode, opacity, showUnknown);
		const i = value * 4;
		lut[i] = r;
		lut[i + 1] = g;
		lut[i + 2] = b;
		lut[i + 3] = a;
	}
	return lut;
}

/**
 * Recolor an occupancy grid into a caller-owned RGBA buffer through the LUT,
 * rotating 90° clockwise: a width×height grid becomes a height×width image.
 * The destination stride is the rotated row length (= grid height); the caller
 * sizes its canvas/ImageData height×width to match.
 *
 * Allocation-free: writes in place so the same buffer (and the texture wrapping
 * it) can be reused across updates.
 *
 * @param dst - RGBA output, length `width * height * 4` (rotated image pixels).
 * @param src - Canonical occupancy bytes, length `width * height`.
 * @param width - Grid width (cells per grid row).
 * @param height - Grid height (grid rows).
 * @param lut - 256-entry RGBA table from {@link buildOccupancyLut}.
 */
export function recolorOccupancyRotated(
	dst: Uint8ClampedArray,
	src: Uint8Array,
	width: number,
	height: number,
	lut: Uint8ClampedArray,
): void {
	const outWidth = height;
	for (let row = 0; row < height; row++) {
		const srcRow = row * width;
		const dstCol = height - 1 - row;
		for (let col = 0; col < width; col++) {
			// Missing cells read as 255 (unknown).
			const cell = src[srcRow + col] ?? 255;
			const li = cell * 4;
			const di = (col * outWidth + dstCol) * 4;
			dst[di] = lut[li]!;
			dst[di + 1] = lut[li + 1]!;
			dst[di + 2] = lut[li + 2]!;
			dst[di + 3] = lut[li + 3]!;
		}
	}
}
