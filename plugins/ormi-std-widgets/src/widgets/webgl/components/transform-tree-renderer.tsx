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

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
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
	/** Called when a node is clicked to trigger camera follow. */
	onNodeClick?: (nodeId: string, worldPos: THREE.Vector3) => void;
	/** Currently tracked node id for follow mode. */
	trackedNodeId?: string | null;
	/** Called when tracked node world position changes. */
	onTrackedNodePositionChange?: (
		nodeId: string,
		worldPos: THREE.Vector3,
	) => void;
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

const multiplyMatrix3x3ByVector3 = (
	matrix: [
		number,
		number,
		number,
		number,
		number,
		number,
		number,
		number,
		number,
	],
	vector: [number, number, number],
): [number, number, number] => {
	const [x, y, z] = vector;
	return [
		matrix[0] * x + matrix[1] * y + matrix[2] * z,
		matrix[3] * x + matrix[4] * y + matrix[5] * z,
		matrix[6] * x + matrix[7] * y + matrix[8] * z,
	];
};

const parseOklch = (
	value: string,
): { l: number; c: number; h: number } | null => {
	const match = value
		.trim()
		.match(
			/^oklch\(\s*([+-]?\d*\.?\d+%?)\s+([+-]?\d*\.?\d+%?)\s+([+-]?\d*\.?\d+)(deg|rad|turn|grad)?(?:\s*\/\s*[+-]?\d*\.?\d+%?)?\s*\)$/i,
		);
	if (!match) return null;

	const [, lRaw, cRaw, hRaw, hUnit] = match;
	if (!lRaw || !cRaw || !hRaw) return null;

	const parseComponent = (component: string) => {
		const isPercent = component.endsWith("%");
		const numeric = Number.parseFloat(component);
		if (!Number.isFinite(numeric)) return NaN;
		return isPercent ? numeric / 100 : numeric;
	};

	const l = parseComponent(lRaw);
	const c = parseComponent(cRaw);
	const hNumeric = Number.parseFloat(hRaw);
	if (
		!Number.isFinite(l) ||
		!Number.isFinite(c) ||
		!Number.isFinite(hNumeric)
	) {
		return null;
	}

	let h = hNumeric;
	if (hUnit === "turn") h = hNumeric * 360;
	if (hUnit === "rad") h = (hNumeric * 180) / Math.PI;
	if (hUnit === "grad") h = hNumeric * 0.9;

	return {
		l: l > 1 ? l / 100 : l,
		c,
		h,
	};
};

const oklchToRgbString = (value: string): string | null => {
	const parsed = parseOklch(value);
	if (!parsed) return null;

	const hRad = (parsed.h * Math.PI) / 180;
	const oklab: [number, number, number] = [
		parsed.l,
		Number.isNaN(parsed.h) ? 0 : parsed.c * Math.cos(hRad),
		Number.isNaN(parsed.h) ? 0 : parsed.c * Math.sin(hRad),
	];

	const lmsPrime = multiplyMatrix3x3ByVector3(
		[
			1, 0.3963377773761749, 0.2158037573099136, 1, -0.1055613458156586,
			-0.0638541728258133, 1, -0.0894841775298119, -1.2914855480194092,
		],
		oklab,
	);

	const lms: [number, number, number] = [
		lmsPrime[0] ** 3,
		lmsPrime[1] ** 3,
		lmsPrime[2] ** 3,
	];

	const xyz = multiplyMatrix3x3ByVector3(
		[
			1.2268798758459243, -0.5578149944602171, 0.2813910456659647,
			-0.0405757452148008, 1.112286803280317, -0.0717110580655164,
			-0.0763729366746601, -0.4214933324022432, 1.5869240198367816,
		],
		lms,
	);

	const linearRgb = multiplyMatrix3x3ByVector3(
		[
			3.2409699419045226, -1.537383177570094, -0.4986107602930034,
			-0.9692436362808796, 1.8759675015077202, 0.04155505740717559,
			0.05563007969699366, -0.20397695888897652, 1.0569715142428786,
		],
		xyz,
	);

	const toGammaSrgb = (channel: number): number => {
		if (Math.abs(channel) <= 0.0031308) {
			return 12.92 * channel;
		}
		const sign = channel < 0 ? -1 : 1;
		return sign * (1.055 * Math.abs(channel) ** (1 / 2.4) - 0.055);
	};

	const clamp01 = (valueToClamp: number) =>
		Math.max(0, Math.min(1, valueToClamp));

	const [rLinear, gLinear, bLinear] = linearRgb;
	const r = Math.round(clamp01(toGammaSrgb(rLinear)) * 255);
	const g = Math.round(clamp01(toGammaSrgb(gLinear)) * 255);
	const b = Math.round(clamp01(toGammaSrgb(bLinear)) * 255);

	return `rgb(${r}, ${g}, ${b})`;
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
	worldQuaternion: THREE.Quaternion;
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
	const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(
		worldMatrix,
	);

	const parentPos =
		depth === 0
			? null
			: new THREE.Vector3().setFromMatrixPosition(parentMatrix);

	nodes.push({
		id: tree.id,
		worldPos,
		worldQuaternion,
		parentPos,
		depth,
	});

	// Recurse into children
	tree.children.forEach((child) => {
		collectFrameNodes(child, worldMatrix, depth + 1, nodes);
	});

	return nodes;
};

const treeContainsFrame = (tree: TransformTree, frameId: string): boolean => {
	if (tree.id === frameId) return true;

	for (const [, child] of tree.children) {
		if (treeContainsFrame(child, frameId)) {
			return true;
		}
	}

	return false;
};

interface FrameLabelProps {
	nodeId: string;
	position: [number, number, number];
	fontSize: number;
	color: THREE.Color;
	isHovered: boolean;
	sphereRadius: number;
}

const FrameLabel: React.FC<FrameLabelProps> = ({
	nodeId,
	position,
	fontSize,
	color,
	isHovered,
	sphereRadius,
}) => {
	const textRef = useRef<THREE.Object3D | null>(null);

	useEffect(() => {
		const textObject = textRef.current as unknown as {
			material?: THREE.Material | THREE.Material[];
			renderOrder: number;
		};
		if (!textObject) return;

		textObject.renderOrder = isHovered ? 1000 : 0;

		const materials = textObject.material
			? Array.isArray(textObject.material)
				? textObject.material
				: [textObject.material]
			: [];

		materials.forEach((material) => {
			material.depthTest = !isHovered;
			material.depthWrite = !isHovered;
			material.needsUpdate = true;
		});
	}, [isHovered]);

	return (
		<Billboard
			position={position}
			follow
			renderOrder={isHovered ? 1000 : 0}
		>
			<Text
				ref={textRef}
				fontSize={fontSize}
				color={color}
				anchorX="center"
				anchorY="bottom"
				outlineWidth={sphereRadius * 0.01}
				outlineColor="black"
				renderOrder={isHovered ? 1000 : 0}
				depthOffset={isHovered ? -2 : 0}
			>
				{nodeId}
			</Text>
		</Billboard>
	);
};

interface FrameAxesProps {
	position: [number, number, number];
	quaternion: [number, number, number, number];
	size: number;
}

const FrameAxes: React.FC<FrameAxesProps> = ({
	position,
	quaternion,
	size,
}) => {
	const axesHelper = useMemo(() => {
		const helper = new THREE.AxesHelper(size);
		helper.raycast = () => null;

		helper.traverse((obj) => {
			const mesh = obj as THREE.LineSegments;
			const material = mesh.material;
			if (!material) return;
			if (Array.isArray(material)) {
				material.forEach((m) => {
					m.depthTest = false;
					m.depthWrite = false;
					m.transparent = true;
					m.opacity = 0.9;
				});
			} else {
				material.depthTest = false;
				material.depthWrite = false;
				material.transparent = true;
				material.opacity = 0.9;
			}
		});

		return helper;
	}, [size]);

	useEffect(() => {
		return () => {
			axesHelper.traverse((obj) => {
				const mesh = obj as THREE.LineSegments;
				if (mesh.geometry) mesh.geometry.dispose();
				const material = mesh.material;
				if (!material) return;
				if (Array.isArray(material)) {
					material.forEach((m) => m.dispose());
				} else {
					material.dispose();
				}
			});
		};
	}, [axesHelper]);

	return (
		<primitive
			object={axesHelper}
			position={position}
			quaternion={quaternion}
			renderOrder={20}
		/>
	);
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TransformTreeRenderer: React.FC<TransformTreeRendererProps> = ({
	config = {},
	targetFrame = "",
	onNodeClick,
	trackedNodeId = null,
	onTrackedNodePositionChange,
}) => {
	const { transformsTrees } = useTransformSource();
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
	const [hoverColor, setHoverColor] = useState<string>("#ffcc00");

	const {
		enabled = true,
		sphereRadius = 0.05,
		cylinderRadius = 0.02,
		colorScheme = "depth",
		uniformColor = "#00ff88",
		showLabels = true,
	} = config;
	const frameAxesSize = sphereRadius * 2.2;

	// Collect all frame nodes from all transform trees
	const frameNodes = useMemo<FrameNode[]>(() => {
		if (!enabled || transformsTrees.size === 0) return [];

		const allNodes: FrameNode[] = [];

		transformsTrees.forEach((tree, treeId) => {
			// If targetFrame is specified, only show that tree
			if (
				targetFrame &&
				targetFrame !== "" &&
				treeId !== targetFrame &&
				tree.id !== targetFrame &&
				!treeContainsFrame(tree, targetFrame)
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

	const trackedNode = useMemo(() => {
		if (!trackedNodeId) return null;
		return frameNodes.find((node) => node.id === trackedNodeId) ?? null;
	}, [frameNodes, trackedNodeId]);

	useEffect(() => {
		if (!trackedNode || !onTrackedNodePositionChange) return;
		onTrackedNodePositionChange(
			trackedNode.id,
			trackedNode.worldPos.clone(),
		);
	}, [trackedNode, onTrackedNodePositionChange]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const updateHoverColor = () => {
			const primaryToken = getComputedStyle(
				document.documentElement,
			).getPropertyValue("--primary");
			const normalizedPrimary = primaryToken.trim();
			if (normalizedPrimary) {
				const resolvedPrimaryColor =
					oklchToRgbString(normalizedPrimary);
				if (resolvedPrimaryColor) {
					setHoverColor(resolvedPrimaryColor);
					return;
				}
			}
			setHoverColor("#ffcc00");
		};

		updateHoverColor();

		const observer = new MutationObserver(() => {
			updateHoverColor();
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style", "data-theme"],
		});

		return () => observer.disconnect();
	}, []);

	if (!enabled || frameNodes.length === 0) {
		return null;
	}

	return (
		<group>
			{frameNodes.map((node, index) => {
				const isHovered = hoveredNodeId === node.id;
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

				if (isHovered) {
					color = new THREE.Color(hoverColor);
				}

				return (
					<React.Fragment key={node.id}>
						<FrameAxes
							position={[
								node.worldPos.x,
								node.worldPos.y,
								node.worldPos.z,
							]}
							quaternion={[
								node.worldQuaternion.x,
								node.worldQuaternion.y,
								node.worldQuaternion.z,
								node.worldQuaternion.w,
							]}
							size={frameAxesSize}
						/>

						{/* Sphere at frame origin */}
						<mesh
							geometry={sphereGeometry}
							position={node.worldPos}
							scale={isHovered ? [1.1, 1.1, 1.1] : [1, 1, 1]}
							onPointerOver={(e: ThreeEvent<PointerEvent>) => {
								e.stopPropagation();
								setHoveredNodeId(node.id);
							}}
							onPointerOut={(e: ThreeEvent<PointerEvent>) => {
								e.stopPropagation();
								setHoveredNodeId((prev) =>
									prev === node.id ? null : prev,
								);
							}}
							onClick={(e: ThreeEvent<MouseEvent>) => {
								e.stopPropagation();
								onNodeClick?.(node.id, node.worldPos.clone());
							}}
						>
							<meshStandardMaterial color={color} />
						</mesh>

						{/* Frame label */}
						{showLabels && (
							<FrameLabel
								nodeId={node.id}
								position={[
									node.worldPos.x,
									node.worldPos.y + sphereRadius * 2.5,
									node.worldPos.z,
								]}
								fontSize={
									sphereRadius * (isHovered ? 0.9 : 0.6)
								}
								color={color}
								isHovered={isHovered}
								sphereRadius={sphereRadius}
							/>
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
