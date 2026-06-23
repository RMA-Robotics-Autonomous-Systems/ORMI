import React, {
	useRef,
	useMemo,
	useState,
	useCallback,
	useEffect,
} from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
	Grid,
	OrbitControls,
	PerspectiveCamera,
	GizmoHelper,
	GizmoViewport,
} from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
	Scene3DProps,
	PosePublisherConfig,
	LayerTransformStatus,
} from "../types/scene-3d-types";
import { GoalPoseOverlay, PoseMode } from "./goal-pose-overlay";
import { TransformTreeFollowLayer } from "./transform-tree-follow-layer";
import { Scene3DControlPanel, SceneLayerEntry } from "./scene-3d-controls";
import {
	FramePump,
	SceneEngineProvider,
} from "../engine/react/scene-engine-context";
import { DataBridge } from "../engine/react/data-bridge";
import { TFBridge } from "../engine/react/tf-bridge";
import {
	PointCloudLayerBridge,
	MapGridLayerBridge,
	PathLayerBridge,
} from "../engine/react/layer-bridges";

// Path layers render at a fixed 0.7 opacity in the scene (not a saved config field).
const PATH_LINE_OPACITY = 0.7;

// ============================================================================
// Main Scene 3D Component
// ============================================================================
export const Scene3DComp: React.FC<Scene3DProps> = (props) => {
	const targetFrame = props.targetFrame ?? "";
	const worldFrame = props.worldFrame ?? "world";
	const anchors = props.anchors;
	const autoAnchor = props.autoAnchor ?? true;
	// Zero-config target for the DATA layers: with autoAnchor on and no explicit targetFrame,
	// resolve layers into the shared anchored world. Without this, an empty targetFrame renders
	// every layer in its own root frame (identity chain) — a map in `map` and a path in `odom`
	// end up mutually misaligned until the user manually types the world frame. An explicit
	// targetFrame always wins. The TF-tree renderer keeps the raw targetFrame: it reads the core
	// table, where the scene-local world frame doesn't exist, and its roots already coincide
	// with the identity auto-anchors.
	const dataTargetFrame =
		targetFrame.trim() !== "" ? targetFrame : autoAnchor ? worldFrame : "";
	const showGrid = props.showGrid ?? true;
	const showAxes = props.showAxes ?? true;
	const pointCloudLayers = props.pointCloudLayers ?? [];
	const pathLayers = props.pathLayers ?? [];
	const mapGridLayers = props.mapGridLayers ?? [];
	const transformTree = props.transformTree ?? { enabled: false };
	const posePublisherConfig = props.posePublisherConfig as
		| PosePublisherConfig
		| undefined;

	const [poseMode, setPoseMode] = useState<PoseMode>("idle");
	const controlsRef = useRef<OrbitControlsImpl | null>(null);
	const handlePoseModeChange = useCallback(
		(m: PoseMode) => setPoseMode(m),
		[],
	);

	const goalShortcutLabel = (
		posePublisherConfig?.goalShortcut?.key ??
		(posePublisherConfig?.goalShortcut?.gamepadButtonIndex !== undefined
			? `Btn ${posePublisherConfig.goalShortcut.gamepadButtonIndex}`
			: "G")
	).toUpperCase();
	const initialShortcutLabel = (
		posePublisherConfig?.initialShortcut?.key ??
		(posePublisherConfig?.initialShortcut?.gamepadButtonIndex !== undefined
			? `Btn ${posePublisherConfig.initialShortcut.gamepadButtonIndex}`
			: "P")
	).toUpperCase();

	const axesHelper = useMemo(() => new THREE.AxesHelper(5), []);

	// ------------------------------------------------------------------
	// Runtime layer visibility (button-holder style controls).
	//
	// Toggling a layer is runtime-only state — it never writes back to the
	// saved widget config. Each entry's default comes from its config flag;
	// user overrides live in `overrides` and are reset whenever the configured
	// layer set / defaults change (i.e. the user edits the widget settings).
	// ------------------------------------------------------------------
	const visibilityConfig = useMemo(() => {
		const list: {
			key: string;
			label: string;
			kind: SceneLayerEntry["kind"];
			defaultVisible: boolean;
		}[] = [];

		pointCloudLayers.forEach((layer, index) => {
			list.push({
				key: `pc:${layer.id ?? index}`,
				label: layer.topic?.topic ?? `Point cloud ${index + 1}`,
				kind: "pointcloud",
				defaultVisible: layer.enabled !== false,
			});
		});
		pathLayers.forEach((layer, index) => {
			list.push({
				key: `path:${layer.id ?? index}`,
				label: layer.topic?.topic ?? `Path ${index + 1}`,
				kind: "path",
				defaultVisible: layer.enabled !== false,
			});
		});
		mapGridLayers.forEach((layer, index) => {
			list.push({
				key: `mapgrid:${layer.id ?? index}`,
				label: layer.topic?.topic ?? `Map grid ${index + 1}`,
				kind: "mapgrid",
				defaultVisible: layer.enabled !== false,
			});
		});
		if (props.transformTree !== undefined) {
			list.push({
				key: "scene:tf",
				label: "Transform tree",
				kind: "transformTree",
				defaultVisible: transformTree.enabled === true,
			});
		}
		list.push({
			key: "scene:grid",
			label: "Grid",
			kind: "grid",
			defaultVisible: showGrid,
		});
		list.push({
			key: "scene:axes",
			label: "Axes",
			kind: "axes",
			defaultVisible: showAxes,
		});

		return list;
	}, [
		pointCloudLayers,
		pathLayers,
		mapGridLayers,
		transformTree.enabled,
		props.transformTree,
		showGrid,
		showAxes,
	]);

	const [overrides, setOverrides] = useState<Record<string, boolean>>({});

	const configSignature = useMemo(
		() =>
			visibilityConfig
				.map((c) => `${c.key}=${c.defaultVisible}`)
				.join("|"),
		[visibilityConfig],
	);
	useEffect(() => {
		setOverrides({});
	}, [configSignature]);

	const isVisible = useCallback(
		(key: string, defaultVisible: boolean) =>
			overrides[key] ?? defaultVisible,
		[overrides],
	);
	const handleToggle = useCallback(
		(key: string, visible: boolean) =>
			setOverrides((prev) => ({ ...prev, [key]: visible })),
		[],
	);

	// Per-layer transform status, reported by each data renderer after it resolves its chain.
	// Runtime-only: shown as a badge in the control panel so a layer silently rendering in its
	// own root (fallback) or with no data yet is visible at a glance.
	const [layerStatuses, setLayerStatuses] = useState<
		Map<string, LayerTransformStatus>
	>(new Map());
	const handleLayerStatus = useCallback(
		(key: string, status: LayerTransformStatus) =>
			setLayerStatuses((prev) => {
				if (prev.get(key) === status) return prev;
				const next = new Map(prev);
				next.set(key, status);
				return next;
			}),
		[],
	);

	// Identity-stable per-key status sinks for the layer bridges. A stable
	// reference keeps the bridges' config effect from re-firing on every render
	// (the sink is a `setConfig` dependency). Cached by key for the component's
	// lifetime; `handleLayerStatus` already dedupes by key.
	const statusSinksRef = useRef<
		Map<string, (status: LayerTransformStatus) => void>
	>(new Map());
	const getStatusSink = useCallback(
		(key: string) => {
			let sink = statusSinksRef.current.get(key);
			if (!sink) {
				sink = (status: LayerTransformStatus) =>
					handleLayerStatus(key, status);
				statusSinksRef.current.set(key, sink);
			}
			return sink;
		},
		[handleLayerStatus],
	);

	const layerEntries: SceneLayerEntry[] = visibilityConfig
		.filter((c) => c.kind !== "grid" && c.kind !== "axes")
		.map((c) => ({
			key: c.key,
			label: c.label,
			kind: c.kind,
			visible: isVisible(c.key, c.defaultVisible),
			status: layerStatuses.get(c.key),
		}));
	const sceneEntries: SceneLayerEntry[] = visibilityConfig
		.filter((c) => c.kind === "grid" || c.kind === "axes")
		.map((c) => ({
			key: c.key,
			label: c.label,
			kind: c.kind,
			visible: isVisible(c.key, c.defaultVisible),
		}));

	return (
		<div style={{ width: "100%", height: "100%", position: "relative" }}>
			<Canvas
				frameloop="demand"
				dpr={[1, 1.5]}
				gl={{ antialias: false, powerPreference: "high-performance" }}
			>
				<PerspectiveCamera makeDefault position={[5, 5, 5]} />
				<ambientLight intensity={1} />

				{isVisible("scene:axes", showAxes) && (
					<primitive object={axesHelper} />
				)}

				<GizmoHelper alignment="bottom-right" margin={[80, 80]}>
					<GizmoViewport
						axisColors={["red", "green", "blue"]}
						labelColor="black"
					/>
				</GizmoHelper>

				<OrbitControls ref={controlsRef} makeDefault />
				{isVisible("scene:grid", showGrid) && (
					<Grid
						cellSize={1}
						infiniteGrid={true}
						sectionColor="lightblue"
					/>
				)}

				{/* The imperative scene engine owns the point-cloud layers. FramePump
				    drives its render plane on demanded frames; DataBridge feeds buffered
				    topic data and TFBridge feeds the anchored transform table, both
				    imperatively. The per-layer bridges register/configure layers without
				    re-rendering on data or TF bumps. With autoAnchor each source root sits
				    at the world origin; manual anchors override per source. */}
				<SceneEngineProvider>
					<FramePump />
					{/* Layer bridges render before the data/TF bridges so their
					    `addLayer` effects run first on mount: the engine then has the
					    layers registered before the first `applyTransforms` (which caches
					    the table) and the first `ingest` (which resolves on first data).
					    Hidden point-cloud layers stay registered with visible=false so
					    rolling buffers keep their accumulation and re-showing skips a full
					    rebuild. */}
					{pointCloudLayers.map((layer, index) => {
						const key = `pc:${layer.id ?? index}`;
						return (
							<PointCloudLayerBridge
								key={key}
								layerKey={key}
								config={layer}
								dataTargetFrame={dataTargetFrame}
								visible={isVisible(
									key,
									layer.enabled !== false,
								)}
								onStatus={getStatusSink(key)}
							/>
						);
					})}
					{pathLayers.map((layer, index) => {
						const key = `path:${layer.id ?? index}`;
						return (
							<PathLayerBridge
								key={key}
								layerKey={key}
								config={layer}
								dataTargetFrame={dataTargetFrame}
								lineOpacity={PATH_LINE_OPACITY}
								visible={isVisible(
									key,
									layer.enabled !== false,
								)}
								onStatus={getStatusSink(key)}
							/>
						);
					})}
					{mapGridLayers.map((layer, index) => {
						const key = `mapgrid:${layer.id ?? index}`;
						return (
							<MapGridLayerBridge
								key={key}
								layerKey={key}
								config={layer}
								dataTargetFrame={dataTargetFrame}
								layerIndex={index}
								visible={isVisible(
									key,
									layer.enabled !== false,
								)}
								onStatus={getStatusSink(key)}
							/>
						);
					})}
					<TFBridge
						anchors={anchors}
						worldFrame={worldFrame}
						autoAnchor={autoAnchor}
						dataTargetFrame={dataTargetFrame}
					/>
					<DataBridge />
				</SceneEngineProvider>

				{/* The TF-tree stays React: it reads core world frames directly via
				    `useWorldFrames` and does not consume the scene anchor overlay, so it
				    needs no transform provider. TF bumps re-render only its own subtree,
				    never the shell or the DOM control panel. */}
				{isVisible("scene:tf", transformTree.enabled === true) && (
					<TransformTreeFollowLayer
						controlsRef={controlsRef}
						config={transformTree}
						targetFrame={targetFrame}
					/>
				)}

				{/* Unified pose overlay — handles goal pose (G) and initial pose (P) */}
				{posePublisherConfig?.enabled && (
					<GoalPoseOverlay
						config={posePublisherConfig}
						onModeChange={handlePoseModeChange}
					/>
				)}
			</Canvas>

			{/* Runtime layer controls (top-right) */}
			<Scene3DControlPanel
				layers={layerEntries}
				scene={sceneEntries}
				onToggle={handleToggle}
			/>

			{/* DOM overlay hints */}
			{posePublisherConfig?.enabled && (
				<div
					style={{
						position: "absolute",
						bottom: "12px",
						left: "50%",
						transform: "translateX(-50%)",
						pointerEvents: "none",
						zIndex: 10,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "4px",
					}}
				>
					{/* Active mode banner */}
					{poseMode === "goalPose" && (
						<div
							style={{
								background: posePublisherConfig.markerColor
									? `${posePublisherConfig.markerColor}e6`
									: "rgba(255, 68, 0, 0.9)",
								color: "#fff",
								borderRadius: "8px",
								padding: "8px 16px",
								fontSize: "13px",
								fontWeight: 600,
								whiteSpace: "nowrap",
								boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
							}}
						>
							Goal pose — click to place, drag to set heading
						</div>
					)}
					{poseMode === "initialPose" && (
						<div
							style={{
								background: "rgba(0, 136, 255, 0.9)",
								color: "#fff",
								borderRadius: "8px",
								padding: "8px 16px",
								fontSize: "13px",
								fontWeight: 600,
								whiteSpace: "nowrap",
								boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
							}}
						>
							Initial pose — click to place, drag to set heading
						</div>
					)}
					{/* Idle hints — show available shortcuts */}
					{poseMode === "idle" && (
						<div
							style={{
								background: "rgba(0,0,0,0.5)",
								color: "#fff",
								borderRadius: "6px",
								padding: "4px 10px",
								fontSize: "11px",
								whiteSpace: "nowrap",
								display: "flex",
								gap: "10px",
								alignItems: "center",
							}}
						>
							{posePublisherConfig.goalTopic && (
								<span>
									<kbd
										style={{
											background: "rgba(255,255,255,0.2)",
											borderRadius: "3px",
											padding: "1px 5px",
											fontFamily: "monospace",
										}}
									>
										{goalShortcutLabel}
									</kbd>{" "}
									goal pose
								</span>
							)}
							{posePublisherConfig.goalTopic &&
								posePublisherConfig.initialTopic && (
									<span
										style={{
											opacity: 0.4,
											fontSize: "10px",
										}}
									>
										|
									</span>
								)}
							{posePublisherConfig.initialTopic && (
								<span>
									<kbd
										style={{
											background: "rgba(255,255,255,0.2)",
											borderRadius: "3px",
											padding: "1px 5px",
											fontFamily: "monospace",
										}}
									>
										{initialShortcutLabel}
									</kbd>{" "}
									initial pose
								</span>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
};
