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

/**
 * Build an effective transform table = the core table plus synthetic anchor edges that place
 * each source's root into the scene world. Pure; never overwrites a real (observed) edge.
 *
 * - **Manual** anchors place a specific `${source}::${rootFrame}` at a given pose.
 * - **autoAnchor** places *every* unobserved source root at the world origin (identity), so all
 *   trees share a common origin with no manual configuration.
 *
 * Returns the input table unchanged when there are no manual anchors and `autoAnchor` is off.
 */
export function buildAnchoredTable(
	table: TransformTable,
	anchors: SceneAnchor[] | undefined,
	worldFrame: string,
	autoAnchor = false,
): TransformTable {
	const hasManual = Boolean(anchors && anchors.length > 0);
	if (!hasManual && !autoAnchor) return table;

	const worldKey = sceneWorldKey(worldFrame);
	const effective = new Map(table);

	if (hasManual) {
		for (const anchor of anchors!) {
			if (!anchor?.source || !anchor?.rootFrame) continue;
			const childKey = namespaceFrame(anchor.source, anchor.rootFrame);
			if (effective.has(childKey)) continue; // don't clobber an observed/anchored edge
			effective.set(
				childKey,
				makeAnchorEdge(
					childKey,
					anchor.rootFrame,
					worldKey,
					anchor.position,
					anchor.rotation,
				),
			);
		}
	}

	if (autoAnchor) {
		// Every unobserved parent (a tree root) that isn't already anchored → world origin.
		for (const edge of table.values()) {
			const pid = edge.parentId;
			if (pid && pid !== worldKey && !effective.has(pid)) {
				effective.set(
					pid,
					makeAnchorEdge(pid, frameRawName(pid), worldKey),
				);
			}
		}
	}

	return effective;
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
	return useMemo(() => {
		const hasManual = Boolean(anchors && anchors.length > 0);
		if (!hasManual && !autoAnchor) return coreTable;
		return buildAnchoredTable(coreTable, anchors, worldFrame, autoAnchor);
	}, [coreTable, anchors, worldFrame, autoAnchor]);
}
