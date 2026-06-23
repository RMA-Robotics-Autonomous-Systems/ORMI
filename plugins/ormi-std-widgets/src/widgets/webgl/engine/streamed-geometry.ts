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
			| THREE.BufferAttribute
			| undefined;
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
