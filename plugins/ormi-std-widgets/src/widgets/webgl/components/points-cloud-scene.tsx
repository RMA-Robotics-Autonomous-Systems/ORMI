import React, { useMemo } from "react";
import * as THREE from "three";
import { XCircle } from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { SceneBackground, SceneGizmo, ThemedGrid } from "./scene-chrome";
import { createTopicKey } from "@workspace/utils";
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { offlineCloudSeries } from "./points-cloud-health";
import {
	DEFAULT_POINT_CLOUD_THEME,
	PointsCloudProps,
} from "../types/points-cloud-drei-types";
import {
	FramePump,
	SceneEngineProvider,
} from "../engine/react/scene-engine-context";
import { DataBridge } from "../engine/react/data-bridge";
import { TFBridge } from "../engine/react/tf-bridge";
import { PointCloudLayerBridge } from "../engine/react/layer-bridges";
import type { LayerTransformStatus } from "../types/scene-3d-types";

// The standalone point-cloud widget has no runtime control panel, so layer
// status is consumed but unused. A single shared no-op keeps the bridge's config
// effect from re-firing on identity changes.
const NOOP_STATUS = (_status: LayerTransformStatus) => {};

/**
 * Standalone point-cloud viewer built on the shared imperative scene engine.
 *
 * Renders the same declarative R3F shell as the multi-layer 3D Scene widget —
 * camera, OrbitControls, grid, axes, gizmo — and delegates all point-cloud
 * rendering to {@link PointCloudLayerBridge} layers on the engine. One layer is
 * registered per configured topic; TF resolves into the widget's `targetFrame`
 * (auto-anchored to it when empty so a source root sits at the world origin).
 * No per-message or per-TF-bump React re-render reaches this shell.
 */
export const PointsCloudScene: React.FC<PointsCloudProps> = (props) => {
	const pointSize = props.pointSize ?? 0.05;
	const decayTime = props.decayTime ?? 0;
	const rollingBuffer = props.rollingBuffer ?? false;
	const theme = props.theme ?? DEFAULT_POINT_CLOUD_THEME;
	const useTransparency = props.useTransparency ?? false;
	const customColor = props.customColor ?? "#ffffff";
	const colorMode = props.colorMode ?? "source";
	const targetFrame = props.targetFrame ?? "";
	const maxPoints = props.maxPoints;
	const topics = props.topics;

	// Multi-topic: degrade per series (offline-gating rule). The cloud keeps
	// its last-known points; the overlay names which series are offline.
	const { getTopicHealth } = useLocalDataSource();
	const offline = offlineCloudSeries(
		topics,
		(topic) => getTopicHealth(topic) === "offline",
	);

	const axesHelper = useMemo(() => new THREE.AxesHelper(5), []);

	// The data layers resolve into the widget's target frame. With an empty target
	// each layer renders in its own root (identity), matching the legacy renderer;
	// auto-anchoring co-locates every source root at the world origin otherwise.
	const dataTargetFrame = targetFrame;

	return (
		<div className="relative" style={{ width: "100%", height: "100%" }}>
			<Canvas
				frameloop="demand"
				dpr={[1, 1.5]}
				gl={{ antialias: false, powerPreference: "high-performance" }}
			>
				<PerspectiveCamera makeDefault position={[0, 5, 10]} />
				<ambientLight intensity={1} />

				<primitive object={axesHelper} />
				<SceneBackground />
				<SceneGizmo />

				<OrbitControls makeDefault />
				<ThemedGrid />

				{/* The imperative scene engine owns the point-cloud layers. FramePump
				    drives its render plane on demanded frames; DataBridge feeds
				    buffered topic data and TFBridge feeds the anchored transform
				    table, both imperatively. One bridge per configured topic
				    registers/configures a layer without re-rendering on data or TF
				    bumps. */}
				<SceneEngineProvider>
					<FramePump />
					{(topics ?? []).map((entry, index) => {
						const key = entry.topic
							? createTopicKey(entry.topic)
							: `pc:${index}`;
						return (
							<PointCloudLayerBridge
								key={key}
								layerKey={key}
								config={{
									topic: entry.topic,
									pointSize,
									decayTime,
									rollingBuffer,
									theme,
									colorMode,
									customColor,
									useTransparency,
									maxPoints,
								}}
								dataTargetFrame={dataTargetFrame}
								visible={true}
								onStatus={NOOP_STATUS}
							/>
						);
					})}
					<TFBridge
						anchors={[]}
						worldFrame={targetFrame}
						autoAnchor={true}
						dataTargetFrame={dataTargetFrame}
					/>
					<DataBridge />
				</SceneEngineProvider>
			</Canvas>
			{offline.length > 0 && (
				<ul className="pointer-events-none absolute top-2 left-2 flex flex-col gap-1">
					{offline.map((name) => (
						<li
							key={name}
							className="border-destructive/40 bg-background/80 text-foreground flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs"
						>
							<XCircle className="text-destructive size-3.5 shrink-0" />
							{name} (offline)
						</li>
					))}
				</ul>
			)}
		</div>
	);
};
