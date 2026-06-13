"use client";
/**
 * Feeds the effective (anchored) transform table into the imperative
 * {@link SceneEngine}.
 *
 * This is the scene's TF subscription boundary for the engine path: it reads the
 * core transform table via `useSyncExternalStore` and overlays the scene's
 * anchors, then pushes the result to {@link SceneEngine.applyTransforms} so every
 * layer re-resolves its chain (matrices/uniforms only — no GPU re-upload). Only
 * this component re-renders on a TF bump; the scene shell stays un-subscribed.
 *
 * It must render inside `SceneEngineProvider`.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
	getTransformTableSnapshot,
	subscribeToTransforms,
} from "@workspace/ormi-core/transforms";
import { buildAnchoredTable } from "../../components/scene-transform-context";
import type { SceneAnchor } from "../../types/scene-3d-types";
import { useSceneEngine } from "./scene-engine-context";

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

	// Version-keyed immutable snapshot: a real dependency for the memo below, so
	// the React Compiler keeps the anchored table fresh on every TF bump.
	const table = useSyncExternalStore(
		subscribeToTransforms,
		getTransformTableSnapshot,
		getTransformTableSnapshot,
	);

	const effectiveTable = useMemo(
		() => buildAnchoredTable(table, anchors, worldFrame, autoAnchor),
		[table, anchors, worldFrame, autoAnchor],
	);

	useEffect(() => {
		engine.applyTransforms(effectiveTable, dataTargetFrame);
	}, [engine, effectiveTable, dataTargetFrame]);

	return null;
}
