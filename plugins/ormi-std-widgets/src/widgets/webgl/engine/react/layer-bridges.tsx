"use client";
/**
 * React bridges that register imperative scene layers with the engine.
 *
 * A bridge owns no data or transform state: it adds its layer to the engine on
 * mount, removes it on unmount, and pushes human-rate config (destructured to
 * primitives, never the config object identity) and visibility down to the layer
 * imperatively. The engine's data/TF planes drive the layer's contents, so a
 * message or TF bump never re-renders a bridge.
 *
 * The component identity is module-level and stable (the widget host uses it
 * directly), so a bridge never remounts its layer except when its `topicKey`
 * changes — mirroring the old `key={getSourceId(topic)}` remount.
 */

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { createTopicKey } from "@workspace/utils";
import {
	makePointCloudLayer,
	type PointCloudLayer,
} from "../layers/point-cloud-layer";
import { makeMapGridLayer, type MapGridLayer } from "../layers/map-grid-layer";
import { makePathLayer, type PathLayer } from "../layers/path-layer";
import type {
	PointCloudLayerConfig,
	MapGridLayerConfig,
	PathLayerConfig,
	LayerTransformStatus,
} from "../../types/scene-3d-types";
import { useSceneEngine } from "./scene-engine-context";

interface PointCloudLayerBridgeProps {
	/** Stable layer id (matches the control-panel visibility key). */
	layerKey: string;
	config: PointCloudLayerConfig;
	/** Target frame the data layers resolve into (the scene's data target frame). */
	dataTargetFrame: string;
	/** Runtime visibility (button-holder control state). */
	visible: boolean;
	/** Deduped status sink for the control-panel badge. */
	onStatus: (status: LayerTransformStatus) => void;
}

/**
 * Register one point-cloud layer with the engine and keep its config / visibility
 * in sync. Remounts (re-creates the layer) only when the topic key changes.
 */
export function PointCloudLayerBridge({
	layerKey,
	config,
	dataTargetFrame,
	visible,
	onStatus,
}: PointCloudLayerBridgeProps) {
	const engine = useSceneEngine();
	const topic = config.topic;
	const topicKey = topic ? createTopicKey(topic) : null;

	// Mount/unmount the layer. Re-created when the topic key changes, mirroring
	// the renderer's `key={getSourceId(topic)}` remount on topic change.
	useEffect(() => {
		if (topicKey === null) return;
		engine.addLayer(makePointCloudLayer(layerKey, topicKey));
		return () => engine.removeLayer(layerKey);
	}, [engine, layerKey, topicKey]);

	// Human-rate config: keyed on primitives, never the config object identity.
	const pointSize = config.pointSize;
	const decayTime = config.decayTime;
	const rollingBuffer = config.rollingBuffer;
	const theme = config.theme;
	const colorMode = config.colorMode;
	const customColor = config.customColor;
	const useTransparency = config.useTransparency;
	const maxPoints = config.maxPoints;
	const datasourceId = topic?.datasource_id;

	useEffect(() => {
		if (topicKey === null) return;
		const layer = engine.getLayer(layerKey) as PointCloudLayer | undefined;
		if (!layer) return;
		layer.setConfig({
			pointSize: pointSize ?? 0.05,
			decayTime: decayTime ?? 0,
			rollingBuffer: rollingBuffer ?? false,
			theme: theme ?? "Default",
			colorMode: colorMode ?? "source",
			customColor: customColor ?? "#ffffff",
			useTransparency: useTransparency ?? false,
			maxPoints,
			targetFrame: dataTargetFrame,
			datasourceId,
			onStatus,
		});
		engine.refreshTicker();
	}, [
		engine,
		layerKey,
		topicKey,
		pointSize,
		decayTime,
		rollingBuffer,
		theme,
		colorMode,
		customColor,
		useTransparency,
		maxPoints,
		dataTargetFrame,
		datasourceId,
		onStatus,
	]);

	// Visibility toggle keeps accumulation: setVisible never disposes the layer.
	useEffect(() => {
		if (topicKey === null) return;
		const layer = engine.getLayer(layerKey);
		layer?.setVisible(visible);
	}, [engine, layerKey, topicKey, visible]);

	return null;
}

interface MapGridLayerBridgeProps {
	/** Stable layer id (matches the control-panel visibility key). */
	layerKey: string;
	config: MapGridLayerConfig;
	/** Target frame the data layers resolve into (the scene's data target frame). */
	dataTargetFrame: string;
	/** Stacking index, applied as a small Y offset so layers don't z-fight. */
	layerIndex: number;
	/** Runtime visibility (button-holder control state). */
	visible: boolean;
	/** Deduped status sink for the control-panel badge. */
	onStatus: (status: LayerTransformStatus) => void;
}

/**
 * Register one map-grid layer with the engine and keep its config / visibility in
 * sync. Re-creates the layer only when the topic key changes.
 */
export function MapGridLayerBridge({
	layerKey,
	config,
	dataTargetFrame,
	layerIndex,
	visible,
	onStatus,
}: MapGridLayerBridgeProps) {
	const engine = useSceneEngine();
	const topic = config.topic;
	const topicKey = topic ? createTopicKey(topic) : null;

	useEffect(() => {
		if (topicKey === null) return;
		engine.addLayer(makeMapGridLayer(layerKey, topicKey));
		return () => engine.removeLayer(layerKey);
	}, [engine, layerKey, topicKey]);

	// Human-rate config: keyed on primitives, never the config object identity.
	const colorMode = config.colorMode;
	const opacity = config.opacity;
	const showUnknown = config.showUnknown;
	const datasourceId = topic?.datasource_id;

	useEffect(() => {
		if (topicKey === null) return;
		const layer = engine.getLayer(layerKey) as MapGridLayer | undefined;
		if (!layer) return;
		layer.setConfig({
			colorMode: colorMode ?? "costmap",
			opacity: opacity ?? 0.85,
			showUnknown: showUnknown ?? true,
			layerIndex,
			targetFrame: dataTargetFrame,
			datasourceId,
			onStatus,
		});
		engine.refreshTicker();
	}, [
		engine,
		layerKey,
		topicKey,
		colorMode,
		opacity,
		showUnknown,
		layerIndex,
		dataTargetFrame,
		datasourceId,
		onStatus,
	]);

	useEffect(() => {
		if (topicKey === null) return;
		const layer = engine.getLayer(layerKey);
		layer?.setVisible(visible);
	}, [engine, layerKey, topicKey, visible]);

	return null;
}

interface PathLayerBridgeProps {
	/** Stable layer id (matches the control-panel visibility key). */
	layerKey: string;
	config: PathLayerConfig;
	/** Target frame the data layers resolve into (the scene's data target frame). */
	dataTargetFrame: string;
	/** Line opacity, supplied by the scene shell (not part of the saved config). */
	lineOpacity: number;
	/** Runtime visibility (button-holder control state). */
	visible: boolean;
	/** Deduped status sink for the control-panel badge. */
	onStatus: (status: LayerTransformStatus) => void;
}

/**
 * Register one path layer with the engine and keep its config / visibility in
 * sync. Re-creates the layer only when the topic key changes. Pushes the canvas
 * pixel size onto the line material's `resolution` uniform on resize — the one
 * viewport coupling a layer needs.
 */
export function PathLayerBridge({
	layerKey,
	config,
	dataTargetFrame,
	lineOpacity,
	visible,
	onStatus,
}: PathLayerBridgeProps) {
	const engine = useSceneEngine();
	const size = useThree((state) => state.size);
	const topic = config.topic;
	const topicKey = topic ? createTopicKey(topic) : null;

	useEffect(() => {
		if (topicKey === null) return;
		engine.addLayer(makePathLayer(layerKey, topicKey));
		return () => engine.removeLayer(layerKey);
	}, [engine, layerKey, topicKey]);

	// Human-rate config: keyed on primitives, never the config object identity.
	const lineColor = config.lineColor;
	const lineWidth = config.lineWidth;
	const datasourceId = topic?.datasource_id;

	useEffect(() => {
		if (topicKey === null) return;
		const layer = engine.getLayer(layerKey) as PathLayer | undefined;
		if (!layer) return;
		layer.setConfig({
			lineColor: lineColor ?? "#3b82f6",
			lineWidth: lineWidth ?? 0.02,
			lineOpacity,
			targetFrame: dataTargetFrame,
			datasourceId,
			onStatus,
		});
		engine.refreshTicker();
	}, [
		engine,
		layerKey,
		topicKey,
		lineColor,
		lineWidth,
		lineOpacity,
		dataTargetFrame,
		datasourceId,
		onStatus,
	]);

	// LineMaterial sizes world-space widths against the canvas pixel resolution;
	// keep it in sync with the viewport.
	useEffect(() => {
		if (topicKey === null) return;
		const layer = engine.getLayer(layerKey) as PathLayer | undefined;
		layer?.setViewportSize(size.width, size.height);
	}, [engine, layerKey, topicKey, size.width, size.height]);

	useEffect(() => {
		if (topicKey === null) return;
		const layer = engine.getLayer(layerKey);
		layer?.setVisible(visible);
	}, [engine, layerKey, topicKey, visible]);

	return null;
}
