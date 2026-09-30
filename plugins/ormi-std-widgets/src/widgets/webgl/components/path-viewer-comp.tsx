import React, { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { SceneBackground, SceneGizmo, ThemedGrid } from "./scene-chrome";
import { PathViewerProps } from "../path-viewer";
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { PathLineRenderer } from "./path-line-renderer";

export const PathViewerComp: React.FC<PathViewerProps> = (props) => {
	const lineColor = props.lineColor ?? "#3b82f6";
	const targetFrame = props.targetFrame ?? "";
	const { getSource } = useLocalDataSource();
	const source = props.topic ? getSource(props.topic) : undefined;

	// Create AxesHelper once
	const axesHelper = useMemo(() => new THREE.AxesHelper(2), []);

	return (
		<div style={{ width: "100%", height: "100%" }}>
			<Canvas frameloop="demand">
				<PerspectiveCamera makeDefault position={[5, 5, 5]} />
				<ambientLight />

				<primitive object={axesHelper} />

				<SceneBackground />
				<SceneGizmo />

				<OrbitControls makeDefault />
				<ThemedGrid />

				<PathLineRenderer
					source={source}
					targetFrame={targetFrame}
					lineWidth={props.lineWidth ?? 0.02}
					lineOpacity={0.7}
					lineColor={lineColor}
				/>
			</Canvas>
		</div>
	);
};
