"use client";
/**
 * Scene-local transform overlay.
 *
 * A 3D scene can co-visualize multiple datasources by *anchoring* each source's root frame into
 * a shared scene world. Anchors are overlaid onto an **effective** transform table at read time
 * and are NEVER written to the global core table — two scenes can anchor the same robot
 * differently without conflict.
 *
 * Renderers read `useSceneTransforms()`, which returns the scene's effective forest when inside
 * a provider and falls back to the global core forest otherwise (so standalone widgets and
 * single-source scenes are unaffected).
 */

import React, {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
} from "react";
import {
	frameRawName,
	isNamespacedFrame,
	namespaceFrame,
	useTransformTable,
} from "@workspace/ormi-core/transforms";
import type { TransformEdge, TransformTable } from "@workspace/ormi-core/types";
import type {
	LayerTransformStatus,
	SceneAnchor,
} from "../types/scene-3d-types";

/**
 * Deduplicating reporter for a layer's {@link LayerTransformStatus}.
 *
 * Returns an identity-stable function (safe in effect dependency arrays — it never re-triggers
 * the data effects it is called from) that forwards a status to `onTransformStatus` only when
 * it changed since the last report. The callback itself is read through a ref, so an inline
 * arrow prop from the parent doesn't churn the consumer's effects.
 *
 * @param onTransformStatus - Optional status callback from the scene.
 * @returns Stable `report(status)` function.
 */
export function useTransformStatusReporter(
	onTransformStatus?: (status: LayerTransformStatus) => void,
): (status: LayerTransformStatus) => void {
	const callbackRef = useRef(onTransformStatus);
	callbackRef.current = onTransformStatus;
	const lastRef = useRef<LayerTransformStatus | null>(null);
	return useCallback((status: LayerTransformStatus) => {
		if (lastRef.current === status) return;
		lastRef.current = status;
		callbackRef.current?.(status);
	}, []);
}

/** Source prefix for the synthetic scene world key (kept distinct from real datasource ids). */
export const SCENE_SOURCE = "scene";
/** `edge.source` tag for synthetic anchor edges. */
export const SCENE_ANCHOR_SOURCE = "scene-anchor";

/** The namespaced key for the scene's world frame. */
export function sceneWorldKey(worldFrame: string): string {
	return namespaceFrame(SCENE_SOURCE, worldFrame || "world");
}

/**
 * Qualify a (bare) frame reference by its datasource so it resolves to that source's frame
 * rather than ambiguously matching another source. Already-namespaced or empty refs pass
 * through unchanged.
 */
export function qualifyFrame(
	datasourceId: string | undefined,
	frame: string,
): string {
	if (!datasourceId || !frame || isNamespacedFrame(frame)) return frame;
	return namespaceFrame(datasourceId, frame);
}

/** Build a synthetic anchor edge `worldKey → frameKey` (identity unless a pose is given). */
function makeAnchorEdge(
	frameKey: string,
	rawFrameId: string,
	worldKey: string,
	position?: { x: number; y: number; z: number },
	rotation?: { x: number; y: number; z: number; w: number },
): TransformEdge {
	return {
		frameId: frameKey,
		rawFrameId,
		parentId: worldKey,
		source: SCENE_ANCHOR_SOURCE,
		transform: {
			position: {
				x: position?.x ?? 0,
				y: position?.y ?? 0,
				z: position?.z ?? 0,
				w: 1,
			},
			rotation: {
				x: rotation?.x ?? 0,
				y: rotation?.y ?? 0,
				z: rotation?.z ?? 0,
				w: rotation?.w ?? 1,
			},
			convention: "THREE",
		},
		stamp: undefined,
		receivedAt: 0,
		isStatic: true,
		parentObserved: false,
	};
}

/** A pending synthetic anchor before its {@link TransformEdge} is materialized. */
interface PendingAnchor {
	key: string;
	rawFrameId: string;
	worldKey: string;
	position?: { x: number; y: number; z: number };
	rotation?: { x: number; y: number; z: number; w: number };
}

/**
 * Derive the anchor edges to overlay (manual takes precedence over autoAnchor for the same
 * key). Scans the table but allocates no edge objects — just the small pending set. Never
 * targets an observed key.
 */
function derivePendingAnchors(
	table: TransformTable,
	anchors: SceneAnchor[] | undefined,
	worldKey: string,
	autoAnchor: boolean,
	hasManual: boolean,
): PendingAnchor[] {
	const pending = new Map<string, PendingAnchor>();

	if (hasManual) {
		for (const anchor of anchors!) {
			if (!anchor?.source || !anchor?.rootFrame) continue;
			const childKey = namespaceFrame(anchor.source, anchor.rootFrame);
			if (table.has(childKey) || pending.has(childKey)) continue;
			pending.set(childKey, {
				key: childKey,
				rawFrameId: anchor.rootFrame,
				worldKey,
				position: anchor.position,
				rotation: anchor.rotation,
			});
		}
	}

	if (autoAnchor) {
		// Every unobserved parent (a tree root) that isn't already anchored → world origin.
		for (const edge of table.values()) {
			const pid = edge.parentId;
			if (
				pid &&
				pid !== worldKey &&
				!table.has(pid) &&
				!pending.has(pid)
			) {
				pending.set(pid, {
					key: pid,
					rawFrameId: frameRawName(pid),
					worldKey,
				});
			}
		}
	}

	return [...pending.values()];
}

/** Order-independent fingerprint of a pending anchor set (key + raw + world + pose). */
function anchorSignature(pending: PendingAnchor[]): string {
	const parts = pending.map(
		(p) =>
			`${p.key}|${p.rawFrameId}|${p.worldKey}|` +
			`${p.position?.x ?? 0},${p.position?.y ?? 0},${p.position?.z ?? 0}|` +
			`${p.rotation?.x ?? 0},${p.rotation?.y ?? 0},${p.rotation?.z ?? 0},${p.rotation?.w ?? 1}`,
	);
	parts.sort();
	return parts.join(";");
}

/**
 * Per-consumer cache for {@link buildAnchoredTable}. Holds the last anchor-edge set (reused
 * across bumps while the anchor set is unchanged) and the last effective table (returned by
 * reference when the exact inputs recur). Create one via {@link createAnchorEdgeCache} and keep
 * it in a `useRef` — it is a mutable scratch, never a reactive value.
 */
export interface AnchorEdgeCache {
	current: {
		signature: string;
		edges: Array<[string, TransformEdge]>;
		table: TransformTable;
		result: TransformTable;
	} | null;
}

/** Create an empty {@link AnchorEdgeCache}. */
export function createAnchorEdgeCache(): AnchorEdgeCache {
	return { current: null };
}

/**
 * Build an effective transform table = the core table plus synthetic anchor edges that place
 * each source's root into the scene world. Never overwrites a real (observed) edge.
 *
 * - **Manual** anchors place a specific `${source}::${rootFrame}` at a given pose.
 * - **autoAnchor** places *every* unobserved source root at the world origin (identity), so all
 *   trees share a common origin with no manual configuration.
 *
 * Copy-on-write: when anchoring adds nothing (no anchors configured, every target already
 * observed, or nothing left to anchor) the input table is returned by reference. When anchor
 * edges *are* added the base table is merged into a fresh `Map` (unavoidable — consumers read a
 * single `TransformTable`).
 *
 * Pass a {@link AnchorEdgeCache} to cap the per-bump cost of that merge on a high-rate TF
 * stream: while the anchor *set* is unchanged the (stable) anchor edge objects are reused
 * instead of re-derived, and an identical `(table, anchors)` call returns the previous effective
 * table by reference — so an unchanged anchor set never re-allocates when nothing actually moved.
 * Without a cache the function is pure and allocates the merge each time it adds an edge.
 */
export function buildAnchoredTable(
	table: TransformTable,
	anchors: SceneAnchor[] | undefined,
	worldFrame: string,
	autoAnchor = false,
	cache?: AnchorEdgeCache,
): TransformTable {
	const hasManual = Boolean(anchors && anchors.length > 0);
	if (!hasManual && !autoAnchor) return table;

	const worldKey = sceneWorldKey(worldFrame);
	const pending = derivePendingAnchors(
		table,
		anchors,
		worldKey,
		autoAnchor,
		hasManual,
	);
	if (pending.length === 0) return table;

	const buildEdges = (): Array<[string, TransformEdge]> =>
		pending.map((p) => [
			p.key,
			makeAnchorEdge(
				p.key,
				p.rawFrameId,
				p.worldKey,
				p.position,
				p.rotation,
			),
		]);

	if (!cache) {
		const effective: TransformTable = new Map(table);
		for (const [key, edge] of buildEdges()) effective.set(key, edge);
		return effective;
	}

	const signature = anchorSignature(pending);
	const prev = cache.current;
	// Exact inputs recur (re-render with no TF bump) → no reallocation at all.
	if (prev && prev.signature === signature && prev.table === table) {
		return prev.result;
	}
	// Same anchor set, new base table → reuse the stable edge objects, only merge.
	const edges =
		prev && prev.signature === signature ? prev.edges : buildEdges();

	const result: TransformTable = new Map(table);
	for (const [key, edge] of edges) result.set(key, edge);
	cache.current = { signature, edges, table, result };
	return result;
}

type SceneTransformValue = { table: TransformTable };

const SceneTransformContext = createContext<SceneTransformValue | null>(null);

/** Provider for a scene's effective (anchored) transform table. */
export const SceneTransformProvider = SceneTransformContext.Provider;

/**
 * Read the scene's effective transform table when inside a {@link SceneTransformProvider},
 * else a live snapshot of the global core table. Drop-in for renderers that resolve chains.
 */
export function useSceneTransforms(): SceneTransformValue {
	const ctx = useContext(SceneTransformContext);
	const fallback = useTransformTable();
	return ctx ?? { table: fallback };
}

/**
 * Compute the scene's effective table from the configured anchors. With no manual anchors and
 * `autoAnchor` off it returns the unmodified core table snapshot (a no-op).
 */
export function useSceneTransformTable(
	anchors: SceneAnchor[] | undefined,
	worldFrame: string,
	autoAnchor = false,
): TransformTable {
	const coreTable = useTransformTable();
	const cacheRef = useRef<AnchorEdgeCache>(createAnchorEdgeCache());
	return useMemo(() => {
		const hasManual = Boolean(anchors && anchors.length > 0);
		if (!hasManual && !autoAnchor) return coreTable;
		return buildAnchoredTable(
			coreTable,
			anchors,
			worldFrame,
			autoAnchor,
			cacheRef.current,
		);
	}, [coreTable, anchors, worldFrame, autoAnchor]);
}

interface SceneAnchoredTransformProviderProps {
	anchors: SceneAnchor[] | undefined;
	worldFrame: string;
	autoAnchor?: boolean;
	children: React.ReactNode;
}

/**
 * Subscribes to the core transform table, overlays the scene's anchors, and provides the
 * effective table to descendant layer renderers via {@link SceneTransformProvider}.
 *
 * This component is the scene's TF subscription boundary: mount it around the layer renderers
 * (inside the Canvas) so a TF bump re-renders only this subtree — never the scene shell, its
 * Canvas configuration, or the DOM control panel.
 */
export function SceneAnchoredTransformProvider({
	anchors,
	worldFrame,
	autoAnchor = false,
	children,
}: SceneAnchoredTransformProviderProps) {
	const table = useSceneTransformTable(anchors, worldFrame, autoAnchor);
	const value = useMemo(() => ({ table }), [table]);
	return (
		<SceneTransformProvider value={value}>
			{children}
		</SceneTransformProvider>
	);
}
