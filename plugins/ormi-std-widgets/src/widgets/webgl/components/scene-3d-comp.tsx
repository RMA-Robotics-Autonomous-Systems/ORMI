import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
	Grid,
	OrbitControls,
	PerspectiveCamera,
	GizmoHelper,
	GizmoViewport,
} from "@react-three/drei";
import {
	Scene3DProps,
	PointCloudLayerConfig,
	PathLayerConfig,
	MapGridLayerConfig,
} from "../types/scene-3d-types";
import { MapGridRenderer } from "./map-grid-renderer";
import { TransformTreeRenderer } from "./transform-tree-renderer";
import { PointCloudSourceRenderer } from "./point-cloud-source-renderer";
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { useTransformSource } from "@workspace/ormi-core/transforms";
import { PathLineRenderer } from "./path-line-renderer";

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

	// Get the topics configured for this layer
	const topics = config.topics ?? [];

	return (
		<>
			{topics.map((entry) => {
				if (!entry.topic) return null;
				const sourceId = getSourceId(entry.topic);
				const source = getSource(entry.topic);
				if (!source || !sourceId) return null;

				return (
					<PointCloudSourceRenderer
						key={sourceId}
						sourceId={sourceId}
						source={source}
						transformsTrees={transformsTrees}
						config={config}
						targetFrame={targetFrame}
						frameTimeRef={sharedFrameTimeRef}
					/>
				);
			})}
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

	// Check if any point cloud layer has rolling buffer with decay
	const enableContinuousRender = pointCloudLayers.some(
		(layer) => layer.rollingBuffer && (layer.decayTime ?? 0) > 0,
	);

	const axesHelper = useMemo(() => new THREE.AxesHelper(5), []);

	return (
		<div style={{ width: "100%", height: "100%" }}>
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

				<OrbitControls makeDefault />
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
					<TransformTreeRenderer
						config={transformTree}
						targetFrame={targetFrame}
					/>
				)}
			</Canvas>
		</div>
	);
};
