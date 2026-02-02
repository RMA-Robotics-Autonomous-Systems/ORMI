import React, { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
	Grid,
	OrbitControls,
	PerspectiveCamera,
	GizmoHelper,
	GizmoViewport,
} from "@react-three/drei";
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

				<GizmoHelper alignment="bottom-right" margin={[80, 80]}>
					<GizmoViewport
						axisColors={["red", "green", "blue"]}
						labelColor="black"
					/>
				</GizmoHelper>

				<OrbitControls makeDefault />
				<Grid infiniteGrid={true} sectionColor="lightblue" />

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
