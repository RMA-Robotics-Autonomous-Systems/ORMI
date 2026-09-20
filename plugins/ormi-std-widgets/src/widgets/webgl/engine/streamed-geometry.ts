/**
 * GPU-attribute helpers for streamed point-cloud geometry.
 *
 * The point-cloud renderers stream large, frequently-updated vertex buffers and
 * must avoid full re-uploads. These helpers bind typed arrays as aliased
 * (non-copied) `DynamicDrawUsage` attributes and mark only the written spans for
 * upload. Shared by the scene and standalone point-cloud renderers.
 */

import * as THREE from "three";
import type { RingWriteSpan } from "@workspace/utils";

/** Upper bound on rolling-buffer capacity, in points. */
export const MAX_ROLLING_POINTS = 600000;
/** Lower bound on rolling-buffer capacity, in points. */
export const MIN_ROLLING_POINTS = 1000;

/** Clamp the configured rolling capacity to a sane range (default = max). */
export const clampRollingCapacity = (maxPoints: number | undefined): number => {
	const requested = Math.floor(maxPoints ?? MAX_ROLLING_POINTS);
	if (!Number.isFinite(requested)) return MAX_ROLLING_POINTS;
	return Math.min(
		MAX_ROLLING_POINTS,
		Math.max(MIN_ROLLING_POINTS, requested),
	);
};

/** Smallest power of two >= n (capacity headroom so attributes are rarely recreated). */
export const nextPowerOfTwo = (n: number): number => {
	if (n <= 1) return 1;
	return 2 ** (32 - Math.clz32(n - 1));
};

/**
 * Floor on the auto-ranged distance normalization, in metres.
 *
 * A cloud whose points all sit within a few centimetres of its own origin (the
 * first partial message of a scan, a single stray return) would otherwise
 * normalize over ~nothing and paint the whole thing across the full gradient,
 * which reads as structure that is not there.
 */
export const MIN_DISTANCE_RANGE = 1;

/**
 * How many points the range observer looks at, at most.
 *
 * Sampling cannot over-estimate the extent, and under-estimating it only clamps
 * the farthest points to the top of the gradient — which is what they should
 * read as anyway. So a stride buys a bounded cost on a million-point cloud for
 * an error that is invisible, and keeps this off the main-thread decode budget.
 */
export const RANGE_SAMPLE_BUDGET = 4096;

/**
 * Largest distance from the cloud's own origin, over a strided sample.
 *
 * Range is measured on the raw (pre-transform) positions, so it is the distance
 * from the sensor rather than from the scene's target frame. A robot 500 m from
 * the map origin has every point at ~500 m in the target frame — a range that is
 * about where the robot is, not about what it sees, and it collapses the whole
 * cloud onto one colour. Sensor range is also stable while the robot drives.
 *
 * @param points - Packed xyz triples.
 * @param pointCount - Number of points to consider.
 * @returns The sampled maximum distance, or 0 for an empty cloud.
 */
export const observePointRange = (
	points: Float32Array,
	pointCount: number,
): number => {
	if (pointCount <= 0) return 0;
	const stride = Math.max(1, Math.ceil(pointCount / RANGE_SAMPLE_BUDGET));
	let maxSquared = 0;
	for (let i = 0; i < pointCount; i += stride) {
		const base = i * 3;
		const x = points[base] ?? 0;
		const y = points[base + 1] ?? 0;
		const z = points[base + 2] ?? 0;
		const squared = x * x + y * y + z * z;
		if (squared > maxSquared) maxSquared = squared;
	}
	return Math.sqrt(maxSquared);
};

/** Fraction of the gap to the observed range closed per message when shrinking. */
export const DISTANCE_RANGE_RELEASE = 0.05;

/**
 * Fold a newly observed range into the running one: rise at once, fall slowly.
 *
 * Rising immediately is what keeps the mapping honest — a point beyond the
 * current range would otherwise clamp to the far colour and the operator would
 * read "as far as anything gets" for something that is further. Falling slowly
 * is what keeps it readable: the range is a divisor for every point's colour, so
 * tracking the per-message maximum exactly would recolour the entire cloud each
 * time a car drives through the far end of the scan.
 *
 * @param current - Running range (metres).
 * @param observed - Range observed in the message just ingested (metres).
 * @returns The new running range, never below {@link MIN_DISTANCE_RANGE}.
 */
export const relaxDistanceRange = (
	current: number,
	observed: number,
): number => {
	const floored = Math.max(observed, MIN_DISTANCE_RANGE);
	if (!Number.isFinite(current) || floored >= current) return floored;
	return Math.max(
		MIN_DISTANCE_RANGE,
		current + (floored - current) * DISTANCE_RANGE_RELEASE,
	);
};

/** The four streamed vertex attributes and their item sizes. */
export const STREAMED_ATTRIBUTES: ReadonlyArray<readonly [string, number]> = [
	["position", 3],
	["color", 3],
	["intensity", 1],
	["timestamp", 1],
];

/** The four typed arrays aliased as streamed geometry attributes. */
export interface StreamedArrays {
	positions: Float32Array;
	colors: Float32Array;
	intensities: Float32Array;
	timestamps: Float32Array;
}

/**
 * Bind the streamed arrays as geometry attributes (aliased, not copied) with
 * `DynamicDrawUsage`. Creating an attribute performs one full upload; afterwards
 * partial uploads go through {@link applyWriteSpans}.
 */
export const setStreamedAttributes = (
	geometry: THREE.BufferGeometry,
	arrays: StreamedArrays,
): void => {
	const make = (array: Float32Array, itemSize: number) => {
		const attribute = new THREE.BufferAttribute(array, itemSize);
		attribute.setUsage(THREE.DynamicDrawUsage);
		return attribute;
	};
	geometry.setAttribute("position", make(arrays.positions, 3));
	geometry.setAttribute("color", make(arrays.colors, 3));
	geometry.setAttribute("intensity", make(arrays.intensities, 1));
	geometry.setAttribute("timestamp", make(arrays.timestamps, 1));
};

/**
 * Mark only the written point spans for GPU upload on every streamed attribute.
 * Spans are in points; converted here to array elements per attribute. The
 * renderer consumes and clears the ranges on the next drawn frame.
 */
export const applyWriteSpans = (
	geometry: THREE.BufferGeometry,
	spans: ReadonlyArray<RingWriteSpan>,
): void => {
	for (const [name, itemSize] of STREAMED_ATTRIBUTES) {
		const attribute = geometry.getAttribute(name) as
			THREE.BufferAttribute | undefined;
		if (!attribute) continue;
		for (const span of spans) {
			attribute.addUpdateRange(
				span.start * itemSize,
				span.count * itemSize,
			);
		}
		attribute.needsUpdate = true;
	}
};
