"use client";
/**
 * Transform Hooks
 *
 * Event-driven transform system using Jotai atoms.
 * Widgets subscribe directly to atoms - uses the shared transformStore.
 */

import { useAtomValue } from "jotai";
import { TransformTree } from "../types";
import {
	transformTreesAtom,
	transformFrameCountAtom,
	transformFrameIdsAtom,
	transformStore,
} from "./transform-atoms";

/**
 * Hook to access transform trees directly from the Jotai atom
 * Uses the shared transformStore to ensure consistency with processTFMessage
 */
/** Access transform trees from the shared store. */
export function useTransformSource(): {
	transformsTrees: Map<string, TransformTree>;
} {
	const transformsTrees = useAtomValue(transformTreesAtom, {
		store: transformStore,
	});
	return { transformsTrees };
}

/**
 * Hook to get the count of frames in the transform tree
 * Useful for debugging/status displays
 */
/** Get the total number of frames across all transform trees. */
export function useTransformFrameCount(): number {
	return useAtomValue(transformFrameCountAtom, { store: transformStore });
}

/**
 * Hook to get the sorted list of all transform frame ids.
 * Only triggers a re-render when the frame list changes, not on every TF
 * value update — safe to use in UI components at high-frequency update rates.
 */
/** Sorted frame id list; stable across high-frequency TF value updates. */
export function useTransformFrameIds(): string[] {
	return useAtomValue(transformFrameIdsAtom, { store: transformStore });
}
