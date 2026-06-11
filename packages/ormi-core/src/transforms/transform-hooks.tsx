"use client";
/**
 * Transform Hooks
 *
 * React bindings for the transform table. All hooks read through
 * `useSyncExternalStore(subscribeToTransforms, getTransformTableSnapshot)`: the snapshot is a
 * version-keyed `Map` whose identity changes exactly when the table changes, so every derived
 * `useMemo` keys on the table **value** itself.
 *
 * ⚠️ Do NOT reintroduce version-keyed memos (`void version; …, [version]`). The React Compiler
 * (enabled in the web app) infers memo dependencies from the callback body — a `void` read is
 * dead code, `getTransformTable` looks pure, and the memo gets frozen on its first result. In
 * production this stranded every TF consumer on the table contents at first render (static-only
 * 2D tree, empty 3D scene) while the underlying table was fully populated.
 */

import { useMemo, useSyncExternalStore } from "react";
import { useAtomValue } from "jotai";
import {
	FrameDiagnostic,
	Quaternion,
	TransformEdge,
	TransformTable,
	Vector3,
	WorldFrame,
} from "../types";
import {
	transformFrameCountAtom,
	transformStore,
	subscribeToTransforms,
	getTransformTableSnapshot,
	getServerTransformTableSnapshot,
} from "./transform-atoms";
import {
	resolveWorldPose,
	selectFrameDiagnostics,
	selectWorldFrames,
} from "./geometry-selectors";

/**
 * Read a live snapshot of the transform table, refreshed whenever transforms change.
 *
 * The returned `Map` is identity-stable while the table is unchanged and a fresh instance after
 * each change, so it is safe (and intended) as a `useMemo`/`useEffect` dependency.
 * @returns A read-only snapshot of the transform table.
 */
export function useTransformTable(): TransformTable {
	return useSyncExternalStore(
		subscribeToTransforms,
		getTransformTableSnapshot,
		getServerTransformTableSnapshot,
	);
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
 * Read the raw transform edges, optionally filtered to a single datasource.
 * @param source - Optional datasource id filter.
 * @returns Live array of edges (recomputed when the table changes).
 */
export function useTransformEdges(source?: string): TransformEdge[] {
	const table = useTransformTable();
	return useMemo(() => {
		const all = Array.from(table.values());
		return source ? all.filter((edge) => edge.source === source) : all;
	}, [table, source]);
}

/**
 * Resolve every frame to world space (for 3D rendering).
 * @param targetFrame - Restrict to the tree containing this frame (empty = all).
 * @param staleMs - Staleness threshold override.
 * @returns World-resolved frames.
 */
export function useWorldFrames(
	targetFrame?: string,
	staleMs?: number,
): WorldFrame[] {
	const table = useTransformTable();
	return useMemo(
		() => selectWorldFrames(table, { targetFrame, staleMs }),
		[table, targetFrame, staleMs],
	);
}

/**
 * Resolve a single frame's world pose.
 * @param frameId - Frame id to resolve (null/undefined → null).
 * @returns World pose or null.
 */
export function useWorldPose(
	frameId: string | null | undefined,
): { position: Vector3; rotation: Quaternion } | null {
	const table = useTransformTable();
	return useMemo(
		() => (frameId ? resolveWorldPose(table, frameId) : null),
		[table, frameId],
	);
}

/**
 * Per-frame diagnostics for the transform-tree UI.
 *
 * Recomputes when the table changes; callers that need staleness to advance while no
 * transforms arrive should pair this with their own periodic tick.
 *
 * @param options - Optional source filter and staleness threshold.
 * @returns One diagnostic per frame.
 */
export function useFrameDiagnostics(options?: {
	source?: string;
	staleMs?: number;
}): FrameDiagnostic[] {
	const table = useTransformTable();
	const source = options?.source;
	const staleMs = options?.staleMs;
	return useMemo(() => {
		const all = selectFrameDiagnostics(table, { staleMs });
		return source ? all.filter((d) => d.source === source) : all;
	}, [table, source, staleMs]);
}
