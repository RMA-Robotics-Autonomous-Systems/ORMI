/**
 * Transform Tree Renderer
 *
 * Visualizes the coordinate frame hierarchy as a 3D tree using spheres for
 * frames and cylinders for parent-child connections.
 *
 * Each frame is represented as:
 * - A sphere at the frame origin
 * - A cylinder connecting to its parent frame
 * - Color-coded based on depth or custom logic
 *
 * This helps users understand the spatial relationships between coordinate
 * frames in the robot/scene.
 */

import React, { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { useTransformSource } from "@workspace/ormi-core/transforms";
import {
	TransformTree,
	CoordinateConvention,
} from "@workspace/ormi-core/types";
import {
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface TransformTreeRendererConfig {
	/** Show the transform tree visualization. @default true */
	enabled?: boolean;
	/** Radius of the sphere at each frame. @default 0.05 */
	sphereRadius?: number;
	/** Radius of the cylinder connecting frames. @default 0.02 */
	cylinderRadius?: number;
	/** Color scheme for frames. @default "depth" */
	colorScheme?: "depth" | "uniform" | "rainbow";
	/** Base color when using uniform scheme. @default "#00ff88" */
	uniformColor?: string;
	/** Show frame labels. @default true */
	showLabels?: boolean;
}

interface TransformTreeRendererProps {
	config?: TransformTreeRendererConfig;
	/** Only visualize frames within this tree (empty = show all). */
	targetFrame?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get color based on depth in the tree.
 * Depth 0 (root) is bright, deeper levels fade to darker colors.
 */
const getDepthColor = (depth: number): THREE.Color => {
	const hue = (depth * 60) % 360; // Rotate through hues
	const saturation = 0.8;
	const lightness = Math.max(0.3, 0.9 - depth * 0.1); // Get darker as we go deeper
	return new THREE.Color().setHSL(hue / 360, saturation, lightness);
};

/**
 * Get color based on index in a rainbow pattern.
 */
const getRainbowColor = (index: number, total: number): THREE.Color => {
	const hue = (index / Math.max(1, total)) * 0.8; // 0 to 0.8 to avoid red wrapping
	return new THREE.Color().setHSL(hue, 0.8, 0.6);
};

/**
 * Convert a TransformTree node's transform into a THREE.js transformation matrix.
 */
const getWorldMatrix = (
	node: TransformTree,
	parentMatrix: THREE.Matrix4 = new THREE.Matrix4(),
): THREE.Matrix4 => {
	const convention: CoordinateConvention =
		(node.transform.convention as CoordinateConvention) ?? "THREE";

	const pos = convertPosition(
		{
			x: node.transform.position.x,
			y: node.transform.position.y,
			z: node.transform.position.z,
		},
		convention,
		"THREE",
	);

	const rot = convertQuaternion(node.transform.rotation, convention, "THREE");

	const localMatrix = new THREE.Matrix4().compose(
		new THREE.Vector3(pos.x, pos.y, pos.z),
		new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w),
		new THREE.Vector3(1, 1, 1),
	);

	return new THREE.Matrix4().multiplyMatrices(parentMatrix, localMatrix);
};

/**
 * Recursively collect all frame nodes with their world positions and depths.
 */
interface FrameNode {
	id: string;
	worldPos: THREE.Vector3;
	parentPos: THREE.Vector3 | null;
	depth: number;
}

const collectFrameNodes = (
	tree: TransformTree,
	parentMatrix: THREE.Matrix4 = new THREE.Matrix4(),
	depth: number = 0,
	nodes: FrameNode[] = [],
): FrameNode[] => {
	const worldMatrix = getWorldMatrix(tree, parentMatrix);
	const worldPos = new THREE.Vector3();
	worldPos.setFromMatrixPosition(worldMatrix);

	const parentPos =
		depth === 0
			? null
			: new THREE.Vector3().setFromMatrixPosition(parentMatrix);

	nodes.push({
		id: tree.id,
		worldPos,
		parentPos,
		depth,
	});

	// Recurse into children
	tree.children.forEach((child) => {
		collectFrameNodes(child, worldMatrix, depth + 1, nodes);
	});

	return nodes;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TransformTreeRenderer: React.FC<TransformTreeRendererProps> = ({
	config = {},
	targetFrame = "",
}) => {
	const { transformsTrees } = useTransformSource();

	const {
		enabled = true,
		sphereRadius = 0.05,
		cylinderRadius = 0.02,
		colorScheme = "depth",
		uniformColor = "#00ff88",
		showLabels = true,
	} = config;

	// Collect all frame nodes from all transform trees
	const frameNodes = useMemo(() => {
		if (!enabled || transformsTrees.size === 0) return [];

		const allNodes: FrameNode[] = [];

		transformsTrees.forEach((tree, treeId) => {
			// If targetFrame is specified, only show that tree
			if (
				targetFrame &&
				targetFrame !== "" &&
				treeId !== targetFrame &&
				tree.id !== targetFrame
			) {
				return;
			}
			collectFrameNodes(tree, new THREE.Matrix4(), 0, allNodes);
		});

		return allNodes;
	}, [transformsTrees, enabled, targetFrame]);

	// Geometry primitives (reused for all instances)
	const sphereGeometry = useMemo(
		() => new THREE.SphereGeometry(sphereRadius, 16, 16),
		[sphereRadius],
	);
	const cylinderGeometry = useMemo(
		() => new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, 1, 8),
		[cylinderRadius],
	);

	if (!enabled || frameNodes.length === 0) {
		return null;
	}

	return (
		<group>
			{frameNodes.map((node, index) => {
				// Determine color
				let color: THREE.Color;
				if (colorScheme === "uniform") {
					color = new THREE.Color(uniformColor);
				} else if (colorScheme === "rainbow") {
					color = getRainbowColor(index, frameNodes.length);
				} else {
					// depth
					color = getDepthColor(node.depth);
				}

				return (
					<React.Fragment key={node.id}>
						{/* Sphere at frame origin */}
						<mesh
							geometry={sphereGeometry}
							position={node.worldPos}
						>
							<meshStandardMaterial color={color} />
						</mesh>

						{/* Frame label */}
						{showLabels && (
							<Text
								position={[
									node.worldPos.x,
									node.worldPos.y + sphereRadius * 2.5,
									node.worldPos.z,
								]}
								fontSize={sphereRadius * 0.6}
								color={color}
								anchorX="center"
								anchorY="bottom"
								outlineWidth={sphereRadius * 0.01}
								outlineColor="black"
							>
								{node.id}
							</Text>
						)}

						{/* Cylinder connecting to parent (if not root) */}
						{node.parentPos && (
							<CylinderBetweenPoints
								start={node.parentPos}
								end={node.worldPos}
								geometry={cylinderGeometry}
								color={color}
							/>
						)}
					</React.Fragment>
				);
			})}
		</group>
	);
};

// ---------------------------------------------------------------------------
// Helper Component: Cylinder Between Two Points
// ---------------------------------------------------------------------------

interface CylinderBetweenPointsProps {
	start: THREE.Vector3;
	end: THREE.Vector3;
	geometry: THREE.CylinderGeometry;
	color: THREE.Color;
}

const CylinderBetweenPoints: React.FC<CylinderBetweenPointsProps> = ({
	start,
	end,
	geometry,
	color,
}) => {
	const { position, quaternion, length } = useMemo(() => {
		const direction = new THREE.Vector3().subVectors(end, start);
		const length = direction.length();
		const position = new THREE.Vector3()
			.addVectors(start, end)
			.multiplyScalar(0.5);

		// Cylinder geometry is aligned along Y axis by default
		const quaternion = new THREE.Quaternion().setFromUnitVectors(
			new THREE.Vector3(0, 1, 0),
			direction.clone().normalize(),
		);

		return { position, quaternion, length };
	}, [start, end]);

	return (
		<mesh
			geometry={geometry}
			position={position}
			quaternion={quaternion}
			scale={[1, length, 1]}
		>
			<meshStandardMaterial color={color} opacity={0.6} transparent />
		</mesh>
	);
};
