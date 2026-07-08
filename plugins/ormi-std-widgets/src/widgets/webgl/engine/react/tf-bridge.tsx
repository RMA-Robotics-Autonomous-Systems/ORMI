"use client";
/**
 * Feeds the effective (anchored) transform table into the imperative
 * {@link SceneEngine}.
 *
 * This is the scene's TF subscription boundary for the engine path: it reads the
 * rate-capped transform table via `useSyncExternalStore` and overlays the scene's
 * anchors, then pushes the result to {@link SceneEngine.applyTransforms} so every
 * layer re-resolves its chain (matrices/uniforms only — no GPU re-upload). Only
 * this component re-renders on a TF bump; the scene shell stays un-subscribed.
 *
 * The table is read through {@link useThrottledTransformTable}, which coalesces a
 * high-rate (e.g. 20 Hz `ws://`) TF stream to ~13 Hz *to the latest* — the
 * re-resolve rate is capped, but data layers still see the freshest transform.
 *
 * It must render inside `SceneEngineProvider`.
 */

import { useEffect, useMemo, useRef } from "react";
import {
	buildAnchoredTable,
	createAnchorEdgeCache,
	type AnchorEdgeCache,
} from "../../components/scene-transform-context";
import type { SceneAnchor } from "../../types/scene-3d-types";
import { useSceneEngine } from "./scene-engine-context";
import { useThrottledTransformTable } from "./throttled-transforms";

interface TFBridgeProps {
	anchors: SceneAnchor[] | undefined;
	worldFrame: string;
	autoAnchor: boolean;
	/** Target frame the data layers resolve into. */
	dataTargetFrame: string;
}

/**
 * Subscribe to the core transform table, overlay the scene anchors, and apply
 * the effective table to the engine whenever it (or the data target frame)
 * changes.
 */
export function TFBridge({
	anchors,
	worldFrame,
	autoAnchor,
	dataTargetFrame,
}: TFBridgeProps) {
	const engine = useSceneEngine();

	// Rate-capped, identity-stable snapshot: a real dependency for the memo below,
	// so the React Compiler keeps the anchored table fresh on every published bump.
	const table = useThrottledTransformTable();

	// Per-instance anchor-edge cache: reuses the stable anchor edges across bumps
	// so a steady anchor set doesn't re-derive/re-allocate them each re-resolve.
	const cacheRef = useRef<AnchorEdgeCache>(createAnchorEdgeCache());

	const effectiveTable = useMemo(
		() =>
			buildAnchoredTable(
				table,
				anchors,
				worldFrame,
				autoAnchor,
				cacheRef.current,
			),
		[table, anchors, worldFrame, autoAnchor],
	);

	useEffect(() => {
		engine.applyTransforms(effectiveTable, dataTargetFrame);
	}, [engine, effectiveTable, dataTargetFrame]);

	return null;
}
