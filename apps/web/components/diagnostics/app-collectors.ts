/**
 * Heavy-tier app collectors for the diagnostics overlay.
 *
 * Started only while the overlay is open (the host flips `metrics.heavy`
 * before starting these). Each collector feeds the metrics registry:
 *
 * - `app.longtasks` — counter, one add per long-task entry (reporter rate =
 *   long tasks per second). Unsupported on some browsers (Firefox/Safari);
 *   collection is silently skipped there.
 * - `app.frames` — counter incremented by a self-chaining
 *   `requestAnimationFrame` loop (reporter rate = FPS).
 * - `app.heapBytes` — gauge polled at 1 Hz from the non-standard
 *   `performance.memory.usedJSHeapSize` (Chrome only; the interval is not
 *   started at all when the API is absent).
 */

import { metrics } from "@workspace/utils";

/** Counter ids — registered once at module scope (registration is idempotent). */
const longtasksId = metrics.counter("app.longtasks");
const framesId = metrics.counter("app.frames");
const heapBytesId = metrics.counter("app.heapBytes");

/** Interval between heap-gauge reads. */
const HEAP_POLL_MS = 1000;

/**
 * Start the app collectors.
 *
 * @returns Stop function — disconnects the long-task observer, cancels the
 *   rAF loop, and clears the heap interval. Idempotent.
 */
export function startAppCollectors(): () => void {
	// Long tasks — unsupported entry types throw on observe() in some
	// browsers; on failure we simply don't collect.
	let observer: PerformanceObserver | null = null;
	try {
		observer = new PerformanceObserver((list) => {
			metrics.add(longtasksId, list.getEntries().length);
		});
		observer.observe({ entryTypes: ["longtask"] });
	} catch {
		observer = null;
	}

	// Frames — self-chaining rAF; the reporter's per-second rate is the FPS.
	let rafHandle: number | null = null;
	const onFrame = () => {
		metrics.add(framesId);
		rafHandle = requestAnimationFrame(onFrame);
	};
	rafHandle = requestAnimationFrame(onFrame);

	// Heap — Chrome-only non-standard API; skip the interval entirely when
	// unavailable.
	let heapTimer: ReturnType<typeof setInterval> | null = null;
	const memory = (
		performance as Performance & {
			memory?: { usedJSHeapSize?: number };
		}
	).memory;
	if (typeof memory?.usedJSHeapSize === "number") {
		heapTimer = setInterval(() => {
			const used = (
				performance as Performance & {
					memory?: { usedJSHeapSize?: number };
				}
			).memory?.usedJSHeapSize;
			if (typeof used === "number") metrics.set(heapBytesId, used);
		}, HEAP_POLL_MS);
	}

	let stopped = false;
	return () => {
		if (stopped) return;
		stopped = true;
		observer?.disconnect();
		observer = null;
		if (rafHandle !== null) {
			cancelAnimationFrame(rafHandle);
			rafHandle = null;
		}
		if (heapTimer !== null) {
			clearInterval(heapTimer);
			heapTimer = null;
		}
	};
}
