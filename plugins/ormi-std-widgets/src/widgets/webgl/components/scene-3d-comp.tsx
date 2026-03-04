import React, { useRef, useMemo, useState, useCallback } from "react";
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
} from "../types/scene-3d-types";
import { GoalPoseOverlay, PoseMode } from "./goal-pose-overlay";
import { MapGridRenderer } from "./map-grid-renderer";
import { TransformTreeFollowLayer } from "./transform-tree-follow-layer";
import { PointCloudSourceRenderer } from "./point-cloud-source-renderer";
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { useTransformSource } from "@workspace/ormi-core/transforms";
import { PathLineRenderer } from "./path-line-renderer";
import { JointControllerLayer } from "./joint-controller-layer";

// ============================================================================
// Point Cloud Layer Renderer (uses data source context)
// ============================================================================
interface PointCloudLayerRendererProps extends Record<string, unknown> {
	config: PointCloudLayerConfig;
	targetFrame: string;
}

const PointCloudLayerRenderer = ({
	config,
	targetFrame,
}: PointCloudLayerRendererProps) => {
	const { getSource, getSourceId } = useLocalDataSource();
	const { transformsTrees } = useTransformSource();
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
					transformsTrees={transformsTrees}
					config={config}
					targetFrame={targetFrame}
					frameTimeRef={sharedFrameTimeRef}
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
}

const PathLayerRenderer = ({ config, targetFrame }: PathLayerRendererProps) => {
	const { getSource } = useLocalDataSource();
	const source = config.topic ? getSource(config.topic) : undefined;

	return (
		<PathLineRenderer
			source={source}
			targetFrame={targetFrame}
			lineWidth={config.lineWidth ?? 0.02}
			lineOpacity={0.7}
			lineColor={config.lineColor ?? "#3b82f6"}
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
}

const MapGridLayerRenderer = ({
	config,
	targetFrame,
	layerIndex,
}: MapGridLayerRendererProps) => {
	const { getSource } = useLocalDataSource();
	const source = config.topic ? getSource(config.topic) : undefined;

	return (
		<MapGridRenderer
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			source={source as any}
			targetFrame={targetFrame}
			config={config}
			layerIndex={layerIndex}
		/>
	);
};

// ============================================================================
// Main Scene 3D Component
// ============================================================================
export const Scene3DComp: React.FC<Scene3DProps> = (props) => {
	const targetFrame = props.targetFrame ?? "";
	const showGrid = props.showGrid ?? true;
	const showAxes = props.showAxes ?? true;
	const pointCloudLayers = props.pointCloudLayers ?? [];
	const pathLayers = props.pathLayers ?? [];
	const mapGridLayers = props.mapGridLayers ?? [];
	const transformTree = props.transformTree ?? { enabled: false };
	const posePublisherConfig = props.posePublisherConfig as
		| PosePublisherConfig
		| undefined;
	const jointController = props.jointController;

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

	return (
		<div style={{ width: "100%", height: "100%", position: "relative" }}>
			<Canvas frameloop={enableContinuousRender ? "always" : "demand"}>
				<PerspectiveCamera makeDefault position={[5, 5, 5]} />
				<ambientLight intensity={1} />

				{showAxes && <primitive object={axesHelper} />}

				<GizmoHelper alignment="bottom-right" margin={[80, 80]}>
					<GizmoViewport
						axisColors={["red", "green", "blue"]}
						labelColor="black"
					/>
				</GizmoHelper>

				<OrbitControls ref={controlsRef} makeDefault />
				{showGrid && (
					<Grid
						cellSize={1}
						infiniteGrid={true}
						sectionColor="lightblue"
					/>
				)}

				{/* Render Point Cloud Layers */}
				{pointCloudLayers
					.filter((layer) => layer.enabled !== false)
					.map((layer, index) => (
						<PointCloudLayerRenderer
							key={layer.id ?? `pc-${index}`}
							config={layer}
							targetFrame={targetFrame}
						/>
					))}

				{/* Render Path Layers */}
				{pathLayers
					.filter((layer) => layer.enabled !== false)
					.map((layer, index) => (
						<PathLayerRenderer
							key={layer.id ?? `path-${index}`}
							config={layer}
							targetFrame={targetFrame}
						/>
					))}

				{/* Render Map Grid Layers */}
				{mapGridLayers
					.filter((layer) => layer.enabled !== false)
					.map((layer, index) => (
						<MapGridLayerRenderer
							key={layer.id ?? `mapgrid-${index}`}
							config={layer}
							targetFrame={targetFrame}
							layerIndex={index}
						/>
					))}

				{/* Render Transform Tree */}
				{transformTree.enabled && (
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

				{/* Joint controller — PivotControls gizmos per revolute joint */}
				{jointController?.enabled ? (
					<JointControllerLayer
						config={jointController}
						controlsRef={controlsRef}
					/>
				) : null}
			</Canvas>

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
