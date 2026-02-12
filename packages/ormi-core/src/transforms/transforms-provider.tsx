"use client";
/**
 * Transform Hooks
 *
 * Event-driven transform system using Jotai atoms.
 * Widgets subscribe directly to atoms - no provider needed.
 */

import { useAtomValue } from "jotai";
import { TransformTree } from "../types";
import { transformTreesAtom, transformFrameCountAtom } from "./transform-atoms";

/**
 * Hook to access transform trees directly from the Jotai atom
 * No provider needed - works anywhere in the app
 */
/** Access transform trees from the default store. */
export function useTransformSource(): {
	transformsTrees: Map<string, TransformTree>;
} {
	const transformsTrees = useAtomValue(transformTreesAtom);
	return { transformsTrees };
}

/**
 * Hook to get the count of frames in the transform tree
 * Useful for debugging/status displays
 */
/** Get the total number of frames across all transform trees. */
export function useTransformFrameCount(): number {
	return useAtomValue(transformFrameCountAtom);
}
