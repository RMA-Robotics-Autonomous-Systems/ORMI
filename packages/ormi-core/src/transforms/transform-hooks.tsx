"use client"
/**
 * Transform Hooks
 * 
 * Event-driven transform system using Jotai atoms.
 * Widgets subscribe directly to atoms - uses the shared transformStore.
 */

import { useAtomValue } from 'jotai';
import { TransformTree } from '../types';
import { transformTreesAtom, transformFrameCountAtom, transformStore } from './transform-atoms';

/**
 * Hook to access transform trees directly from the Jotai atom
 * Uses the shared transformStore to ensure consistency with processTFMessage
 */
export function useTransformSource(): { transformsTrees: Map<string, TransformTree> } {
    const transformsTrees = useAtomValue(transformTreesAtom, { store: transformStore });
    return { transformsTrees };
}

/**
 * Hook to get the count of frames in the transform tree
 * Useful for debugging/status displays
 */
export function useTransformFrameCount(): number {
    return useAtomValue(transformFrameCountAtom, { store: transformStore });
}