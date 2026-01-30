import React, { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
	Grid,
	OrbitControls,
	PerspectiveCamera,
	GizmoHelper,
	GizmoViewport,
} from "@react-three/drei";
import { PathViewerProps } from "../path-viewer";
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { Path, PoseStamped, CoordinateConvention } from "@workspace/ormi-core/types";
import {
	findTransformChain,
	useTransformSource,
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";

interface PathRendererProps {
	showPoses: boolean;
	poseScale: number;
	lineColor: string;
	targetFrame?: string;
}

const PathRenderer: React.FC<PathRendererProps> = ({
	showPoses,
	poseScale,
	lineColor,
	targetFrame,
}) => {
	const { sources } = useLocalDataSource();
	const lineRef = useRef<THREE.Line>(null);
	const posesGroupRef = useRef<THREE.Group>(null);
	const { transformsTrees } = useTransformSource();

	// Create geometry and material once using useMemo
	const geometry = useMemo(() => new THREE.BufferGeometry(), []);
	const material = useMemo(() => new THREE.LineBasicMaterial({ color: lineColor }), [lineColor]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			geometry.dispose();
			material.dispose();
			// Clear arrow helpers
			if (posesGroupRef.current) {
				posesGroupRef.current.children.forEach((child) => {
					if (child instanceof THREE.ArrowHelper) {
						child.dispose();
					}
				});
				posesGroupRef.current.clear();
			}
		};
	}, [geometry, material]);
	useFrame(() => {
		if (!sources || sources.size === 0) return;

		const sourceKeys = Array.from(sources.keys());
		const source = sources.get(sourceKeys[0]!);

		if (!source || !source.data || source.data.length === 0) {
			// Clear visualization
			if (lineRef.current) {
				const geometry = lineRef.current.geometry;
				geometry.setFromPoints([]);
			}
			if (posesGroupRef.current) {
				posesGroupRef.current.clear();
			}
			return;
		}

		const pathData = source.data[source.data.length - 1] as Path;

		if (!pathData || !pathData.poses || pathData.poses.length === 0) {
			return;
		}

		const sourceConvention: CoordinateConvention =
			pathData.convention || "ROS";
		const points: THREE.Vector3[] = [];
		const transformedPoses: PoseStamped[] = [];

		// Transform poses if targetFrame is specified
		for (const pose of pathData.poses) {
			let finalPose = pose;

			// Apply transform if targetFrame is specified and transforms available
			if (targetFrame && targetFrame.trim() !== "" && transformsTrees.size > 0) {
				const transformChain = findTransformChain(
					transformsTrees,
					"", // source frame - empty since pose doesn't have frame property
					targetFrame,
				);

				if (transformChain && transformChain.length > 0) {
					// Apply transform chain to position and orientation
					let position = pose.position;
					let orientation = pose.orientation;

					for (const tf of transformChain) {
						// Transform position
						const tfPos = tf.position;
						const tfRot = tf.rotation;

						// Rotate position by transform orientation
						const quat = new THREE.Quaternion(
							tfRot.x,
							tfRot.y,
							tfRot.z,
							tfRot.w,
						);
						const posVec = new THREE.Vector3(position.x, position.y, position.z);
						posVec.applyQuaternion(quat);

						// Add translation
						position = {
							x: posVec.x + tfPos.x,
							y: posVec.y + tfPos.y,
							z: posVec.z + tfPos.z,
						};

						// Combine orientations
						const poseQuat = new THREE.Quaternion(
							orientation.x,
							orientation.y,
							orientation.z,
							orientation.w,
						);
						poseQuat.multiply(quat);

						orientation = {
							x: poseQuat.x,
							y: poseQuat.y,
							z: poseQuat.z,
							w: poseQuat.w,
						};
					}

					finalPose = {
						...pose,
						position,
						orientation,
					};
				}
			}

			// Convert from source convention to ThreeJS
			const convertedPos = convertPosition(
				finalPose.position,
				sourceConvention,
				"THREE",
			);

			points.push(
				new THREE.Vector3(convertedPos.x, convertedPos.y, convertedPos.z),
			);
			transformedPoses.push(finalPose);
		}

		// Update line
		geometry.setFromPoints(points);
		geometry.computeBoundingSphere();

		// Update pose arrows if enabled
		if (showPoses && posesGroupRef.current) {
			// Dispose existing arrow helpers before clearing
			posesGroupRef.current.children.forEach((child) => {
				if (child instanceof THREE.ArrowHelper) {
					child.dispose();
				}
			});
			posesGroupRef.current.clear();

			for (const pose of transformedPoses) {
				const convertedPos = convertPosition(
					pose.position,
					sourceConvention,
					"THREE",
				);
				const convertedRot = convertQuaternion(
					pose.orientation,
					sourceConvention,
					"THREE",
				);

				// Create arrow helper to show orientation
				const dir = new THREE.Vector3(1, 0, 0); // Forward direction
				const quaternion = new THREE.Quaternion(
					convertedRot.x,
					convertedRot.y,
					convertedRot.z,
					convertedRot.w,
				);
				dir.applyQuaternion(quaternion);

				const origin = new THREE.Vector3(
					convertedPos.x,
					convertedPos.y,
					convertedPos.z,
				);
				const length = poseScale;
				const hex = 0xff0000;

				const arrowHelper = new THREE.ArrowHelper(
					dir,
					origin,
					length,
					hex,
					length * 0.3,
					length * 0.2,
				);
				posesGroupRef.current.add(arrowHelper);
			}
		}
	});

	return (
		<>
			<line ref={lineRef} geometry={geometry} material={material} />
			{showPoses && <group ref={posesGroupRef} />}
		</>
	);
};

export const PathViewerComp: React.FC<PathViewerProps> = (props) => {
	const showPoses = props.showPoses ?? true;
	const poseScale = props.poseScale ?? 0.1;
	const lineColor = props.lineColor ?? "#3b82f6";
	const targetFrame = props.targetFrame ?? "";

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

				<PathRenderer
					showPoses={showPoses}
					poseScale={poseScale}
					lineColor={lineColor}
					targetFrame={targetFrame}
				/>
			</Canvas>
		</div>
	);
};
