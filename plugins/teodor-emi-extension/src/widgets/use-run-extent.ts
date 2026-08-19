"use client";

/**
 * The run's time span, with a stable identity.
 *
 * Every time panel needs `[first, last]` and passes it into gesture handlers as
 * a dependency. Recomputing a fresh tuple on each render would give those
 * handlers a new identity every time, which is harmless but noisy — and would
 * defeat the memoisation of anything downstream that keys on it.
 */

import { useMemo } from "react";
import type { EmiRun } from "../detector/run-types";

/**
 * Time extent of a run.
 *
 * Keyed on the run object and its sample count: a growing mission reallocates
 * its columns but keeps the same object, so `n` is what says the extent moved.
 *
 * @param run - The run, or null.
 * @returns `[t0, t1]` in seconds; `[0, 1]` when there is nothing to show.
 */
export function useRunExtent(run: EmiRun | null): [number, number] {
	const n = run?.n ?? 0;
	return useMemo<[number, number]>(() => {
		if (!run || n === 0) return [0, 1];
		const t0 = run.t[0] ?? 0;
		const t1 = run.t[n - 1] ?? t0 + 1;
		return t1 > t0 ? [t0, t1] : [t0, t0 + 1];
	}, [run, n]);
}
