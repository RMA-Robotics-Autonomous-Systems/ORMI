import React, {
	useRef,
	useMemo,
	useState,
	useCallback,
	useEffect,
} from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
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
	PointCloudLayerConfig,
	PathLayerConfig,
	MapGridLayerConfig,
	PosePublisherConfig,
	LayerTransformStatus,
} from "../types/scene-3d-types";
import { GoalPoseOverlay, PoseMode } from "./goal-pose-overlay";
import { MapGridRenderer } from "./map-grid-renderer";
import { TransformTreeFollowLayer } from "./transform-tree-follow-layer";
import { PointCloudSourceRenderer } from "./point-cloud-source-renderer";
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { PathLineRenderer } from "./path-line-renderer";
import { Scene3DControlPanel, SceneLayerEntry } from "./scene-3d-controls";
import {
	SceneTransformProvider,
	useSceneTransforms,
	useSceneTransformTable,
} from "./scene-transform-context";

// ============================================================================
// Point Cloud Layer Renderer (uses data source context)
// ============================================================================
interface PointCloudLayerRendererProps extends Record<string, unknown> {
	config: PointCloudLayerConfig;
	targetFrame: string;
	onTransformStatus?: (status: LayerTransformStatus) => void;
}

const PointCloudLayerRenderer = ({
	config,
	targetFrame,
	onTransformStatus,
}: PointCloudLayerRendererProps) => {
	const { getSource, getSourceId } = useLocalDataSource();
	const { table } = useSceneTransforms();
	const sharedFrameTimeRef = useRef<number>(0);

	useFrame(() => {
		sharedFrameTimeRef.current = Date.now();
	});

	// Get the topic configured for this layer
	const topic = config.topic;

	return (
		<>
			{topic ? (
				<PointCloudSourceRenderer
					key={getSourceId(topic)}
					sourceId={getSourceId(topic)}
					source={getSource(topic)}
					table={table}
					datasourceId={topic.datasource_id}
					config={config}
					targetFrame={targetFrame}
					frameTimeRef={sharedFrameTimeRef}
					onTransformStatus={onTransformStatus}
				/>
			) : null}
		</>
	);
};

// ============================================================================
// Path Layer Renderer (uses data source context)
// ============================================================================
interface PathLayerRendererProps extends Record<string, unknown> {
	config: PathLayerConfig;
	targetFrame: string;
	onTransformStatus?: (status: LayerTransformStatus) => void;
}

const PathLayerRenderer = ({
	config,
	targetFrame,
	onTransformStatus,
}: PathLayerRendererProps) => {
	const { getSource } = useLocalDataSource();
	const source = config.topic ? getSource(config.topic) : undefined;

	return (
		<PathLineRenderer
			source={source}
			datasourceId={config.topic?.datasource_id}
			targetFrame={targetFrame}
			lineWidth={config.lineWidth ?? 0.02}
			lineOpacity={0.7}
			lineColor={config.lineColor ?? "#3b82f6"}
			onTransformStatus={onTransformStatus}
		/>
	);
};

// ============================================================================
// Map Grid Layer Renderer
// ============================================================================
interface MapGridLayerRendererProps extends Record<string, unknown> {
	config: MapGridLayerConfig;
	targetFrame: string;
	layerIndex: number;
	onTransformStatus?: (status: LayerTransformStatus) => void;
}

const MapGridLayerRenderer = ({
	config,
	targetFrame,
	layerIndex,
	onTransformStatus,
}: MapGridLayerRendererProps) => {
	const { getSource } = useLocalDataSource();
	const source = config.topic ? getSource(config.topic) : undefined;

	return (
		<MapGridRenderer
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			source={source as any}
			datasourceId={config.topic?.datasource_id}
			targetFrame={targetFrame}
			config={config}
			layerIndex={layerIndex}
			onTransformStatus={onTransformStatus}
		/>
	);
};

// ============================================================================
// Main Scene 3D Component
// ============================================================================
export const Scene3DComp: React.FC<Scene3DProps> = (props) => {
	const targetFrame = props.targetFrame ?? "";
	const worldFrame = props.worldFrame ?? "world";
	const anchors = props.anchors;
	const autoAnchor = props.autoAnchor ?? true;
	// Effective (anchored) table provided to the data layers. With autoAnchor each source root
	// sits at the world origin; manual anchors override per source.
	const effectiveTable = useSceneTransformTable(
		anchors,
		worldFrame,
		autoAnchor,
	);
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

	// Check if any point cloud layer has rolling buffer with decay
	const enableContinuousRender = pointCloudLayers.some(
		(layer) => layer.rollingBuffer && (layer.decayTime ?? 0) > 0,
	);

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
			<Canvas frameloop={enableContinuousRender ? "always" : "demand"}>
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

				<SceneTransformProvider value={{ table: effectiveTable }}>
					{/* Render Point Cloud Layers */}
					{pointCloudLayers.map((layer, index) => {
						const key = `pc:${layer.id ?? index}`;
						if (!isVisible(key, layer.enabled !== false))
							return null;
						return (
							<PointCloudLayerRenderer
								key={key}
								config={layer}
								targetFrame={dataTargetFrame}
								onTransformStatus={(status) =>
									handleLayerStatus(key, status)
								}
							/>
						);
					})}

					{/* Render Path Layers */}
					{pathLayers.map((layer, index) => {
						const key = `path:${layer.id ?? index}`;
						if (!isVisible(key, layer.enabled !== false))
							return null;
						return (
							<PathLayerRenderer
								key={key}
								config={layer}
								targetFrame={dataTargetFrame}
								onTransformStatus={(status) =>
									handleLayerStatus(key, status)
								}
							/>
						);
					})}

					{/* Render Map Grid Layers */}
					{mapGridLayers.map((layer, index) => {
						const key = `mapgrid:${layer.id ?? index}`;
						if (!isVisible(key, layer.enabled !== false))
							return null;
						return (
							<MapGridLayerRenderer
								key={key}
								config={layer}
								targetFrame={dataTargetFrame}
								layerIndex={index}
								onTransformStatus={(status) =>
									handleLayerStatus(key, status)
								}
							/>
						);
					})}

					{/* Render Transform Tree */}
					{isVisible("scene:tf", transformTree.enabled === true) && (
						<TransformTreeFollowLayer
							controlsRef={controlsRef}
							config={transformTree}
							targetFrame={targetFrame}
						/>
					)}
				</SceneTransformProvider>

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
