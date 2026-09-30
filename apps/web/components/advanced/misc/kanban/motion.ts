import type { MotionTiming } from "@workspace/ui/hooks/use-motion-timing";

/**
 * dnd-kit's sortable `transition` option from a motion step: the token's
 * duration and easing, or `null` (no transition) when the step is 0ms, as it
 * is under reduced motion.
 *
 * @param timing - A resolved motion step (`useMotionTiming`).
 * @returns The `useSortable({ transition })` value.
 */
export function sortableTransition(
	timing: MotionTiming,
): { duration: number; easing: string } | null {
	return timing.duration > 0
		? { duration: timing.duration, easing: timing.easing }
		: null;
}
