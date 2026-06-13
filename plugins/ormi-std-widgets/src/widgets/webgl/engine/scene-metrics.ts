/**
 * Counter ids for the 3D scene engine.
 *
 * Registration is the cold path and runs once at module load; the engine then
 * caches these ids and increments them via `metrics.add` (a single typed-array
 * write) on the hot path. Registration is idempotent, so re-importing across
 * mount/unmount cycles never grows storage.
 */

import { metrics } from "@workspace/utils";

/** Pre-registered counter ids for the scene engine's hot paths. */
export const SCENE3D = {
	/** Demanded frames the engine flushed (`onFrame`). */
	frames: metrics.counter("scene3d.frames"),
	/** Bytes uploaded to the GPU during layer flushes. */
	uploadBytes: metrics.counter("scene3d.uploadBytes"),
	/** Data-plane dirty events (a sample was ingested). */
	dirtyData: metrics.counter("scene3d.dirty.data"),
	/** Transform-plane dirty events (a TF table was applied). */
	dirtyTf: metrics.counter("scene3d.dirty.tf"),
	/** Config-plane dirty events (a human-rate config change). */
	dirtyConfig: metrics.counter("scene3d.dirty.config"),
} as const;
