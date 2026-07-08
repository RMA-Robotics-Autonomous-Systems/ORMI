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
 *
 * Rendering strategy: the whole tree is drawn with a small fixed number of
 * draw calls via `THREE.InstancedMesh` rather than one `<mesh>` (+ its own
 * material) per sphere/cylinder. Instance matrices and colors are written
 * imperatively in a layout effect whenever the data, hover state, or visual
 * config changes — never per animation frame. Because the scene runs
 * `frameloop="demand"`, every imperative write is followed by an explicit
 * `invalidate()` so the change actually repaints (React reconciliation no
 * longer drives the repaint for these meshes).
 *
 * Draw calls: up to 3 — solid spheres (one InstancedMesh), wireframe spheres
 * for inferred roots (a second InstancedMesh, since `wireframe` is a material
 * flag and cannot vary per instance on a shared material), and cylinders (one
 * InstancedMesh). Labels are the accepted residual cost: troika `<Text>`
 * cannot be instanced, so one `<FrameLabel>` is still rendered per node when
 * `showLabels` is on.
 */

import React, {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import { ThreeEvent, useThree } from "@react-three/fiber";
import { useThrottledWorldFrames } from "../engine/react/throttled-transforms";

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
	/** Staleness threshold in ms (forwarded to the world-frame selector). @default 1000 */
	staleThresholdMs?: number;
	/**
	 * Render inferred roots (frames whose parent was never observed) with a distinct
	 * (wireframe) marker. The node is always shown either way. @default true
	 */
	showInferredRoots?: boolean;
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
 * Write the depth-based color into `out`. Depth 0 (root) is bright; deeper
 * levels fade to darker colors. Writes in place to avoid per-call allocation.
 */
const writeDepthColor = (depth: number, out: THREE.Color): THREE.Color => {
	const hue = (depth * 60) % 360; // Rotate through hues
	const saturation = 0.8;
	const lightness = Math.max(0.3, 0.9 - depth * 0.1); // Get darker as we go deeper
	return out.setHSL(hue / 360, saturation, lightness);
};

/**
 * Write the rainbow color for `index` of `total` into `out` (in place).
 */
const writeRainbowColor = (
	index: number,
	total: number,
	out: THREE.Color,
): THREE.Color => {
	const hue = (index / Math.max(1, total)) * 0.8; // 0 to 0.8 to avoid red wrapping
	return out.setHSL(hue, 0.8, 0.6);
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
 * A frame resolved to world space, in THREE types, ready to render.
 *
 * World-space geometry is computed once in core (`selectWorldFrames` via `useWorldFrames`);
 * this is just the THREE-typed projection of that result.
 */
interface FrameNode {
	id: string;
	worldPos: THREE.Vector3;
	parentPos: THREE.Vector3 | null;
	depth: number;
	/** Parent was never observed — render with a distinct marker. */
	inferred: boolean;
	/** Index of this node within the full `frameNodes` array (for color + label). */
	index: number;
}

interface FrameLabelProps {
	nodeId: string;
	position: [number, number, number];
	fontSize: number;
	/** CSS color string (e.g. `#00ff88`) — cheaper than a per-node `THREE.Color`. */
	color: string;
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

// ---------------------------------------------------------------------------
// Instancing helpers
// ---------------------------------------------------------------------------

/** Smallest power of two >= n, with a floor so we never allocate a 0/1-slot mesh. */
const nextCapacity = (n: number): number => {
	const min = 16;
	if (n <= min) return min;
	return 2 ** Math.ceil(Math.log2(n));
};

// Reused scratch objects — the per-instance matrix/color composition runs over
// every node on each update, so it must not allocate. One instance of each is
// shared across the whole update pass (single-threaded, no reentrancy).
const SCRATCH_MATRIX = new THREE.Matrix4();
const SCRATCH_POSITION = new THREE.Vector3();
const SCRATCH_SCALE = new THREE.Vector3();
const SCRATCH_QUATERNION = new THREE.Quaternion();
const SCRATCH_DIRECTION = new THREE.Vector3();
const SCRATCH_COLOR = new THREE.Color();
/**
 * Dedicated scratch for the per-render label pass. Kept separate from
 * {@link SCRATCH_COLOR} (used by the instance-write helpers) so the two passes
 * never alias, and hoisted out of the label loop so no `THREE.Color` is allocated
 * per node per render — each label reads a fresh hex string off this one instance.
 */
const LABEL_COLOR_SCRATCH = new THREE.Color();
const CYLINDER_UP = new THREE.Vector3(0, 1, 0);
const IDENTITY_QUATERNION = new THREE.Quaternion();

/**
 * Compute the per-instance color for a node into `out` (in place). Mirrors the
 * original render-time color selection: hover wins, otherwise the active scheme.
 */
const computeNodeColor = (
	node: FrameNode,
	total: number,
	isHovered: boolean,
	hoverColor: string,
	colorScheme: "depth" | "uniform" | "rainbow",
	uniformColor: string,
	out: THREE.Color,
): THREE.Color => {
	if (isHovered) return out.set(hoverColor);
	if (colorScheme === "uniform") return out.set(uniformColor);
	if (colorScheme === "rainbow")
		return writeRainbowColor(node.index, total, out);
	return writeDepthColor(node.depth, out);
};

/** Shared scheme/hover inputs threaded through the imperative write helpers. */
interface ColorContext {
	total: number;
	hoveredNodeId: string | null;
	hoverColor: string;
	colorScheme: "depth" | "uniform" | "rainbow";
	uniformColor: string;
}

/**
 * Write one partition of frame spheres into `mesh` (position from `worldPos`,
 * 1.1 scale for the hovered node, per-instance color), set its live `count`,
 * and mark the instance buffers dirty. Reads `nodes` only — never mutates it.
 */
const writeSphereInstances = (
	mesh: THREE.InstancedMesh,
	nodes: readonly FrameNode[],
	ctx: ColorContext,
): void => {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]!;
		const isHovered = ctx.hoveredNodeId === node.id;
		const s = isHovered ? 1.1 : 1;
		SCRATCH_POSITION.copy(node.worldPos);
		SCRATCH_SCALE.set(s, s, s);
		SCRATCH_MATRIX.compose(
			SCRATCH_POSITION,
			IDENTITY_QUATERNION,
			SCRATCH_SCALE,
		);
		mesh.setMatrixAt(i, SCRATCH_MATRIX);

		computeNodeColor(
			node,
			ctx.total,
			isHovered,
			ctx.hoverColor,
			ctx.colorScheme,
			ctx.uniformColor,
			SCRATCH_COLOR,
		);
		mesh.setColorAt(i, SCRATCH_COLOR);
	}
	mesh.count = nodes.length;
	mesh.instanceMatrix.needsUpdate = true;
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
};

/**
 * Write the parent→child connection cylinders into `mesh`: position = segment
 * midpoint, orientation rotates (0,1,0) onto the direction, scale stretches the
 * unit-height cylinder to the segment length. Replaces the former
 * `CylinderBetweenPoints` component. Reads `nodes` only — never mutates it.
 */
const writeCylinderInstances = (
	mesh: THREE.InstancedMesh,
	nodes: readonly FrameNode[],
	ctx: ColorContext,
): void => {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]!;
		const start = node.parentPos!;
		const end = node.worldPos;

		SCRATCH_DIRECTION.subVectors(end, start);
		const length = SCRATCH_DIRECTION.length();
		SCRATCH_POSITION.addVectors(start, end).multiplyScalar(0.5);
		SCRATCH_DIRECTION.normalize();
		SCRATCH_QUATERNION.setFromUnitVectors(CYLINDER_UP, SCRATCH_DIRECTION);
		SCRATCH_SCALE.set(1, length, 1);
		SCRATCH_MATRIX.compose(
			SCRATCH_POSITION,
			SCRATCH_QUATERNION,
			SCRATCH_SCALE,
		);
		mesh.setMatrixAt(i, SCRATCH_MATRIX);

		const isHovered = ctx.hoveredNodeId === node.id;
		computeNodeColor(
			node,
			ctx.total,
			isHovered,
			ctx.hoverColor,
			ctx.colorScheme,
			ctx.uniformColor,
			SCRATCH_COLOR,
		);
		mesh.setColorAt(i, SCRATCH_COLOR);
	}
	mesh.count = nodes.length;
	mesh.instanceMatrix.needsUpdate = true;
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
	const [hoverColor, setHoverColor] = useState<string>("#ffcc00");
	const { invalidate } = useThree();

	const {
		enabled = true,
		sphereRadius = 0.05,
		cylinderRadius = 0.02,
		colorScheme = "depth",
		uniformColor = "#00ff88",
		showLabels = true,
		staleThresholdMs,
		showInferredRoots = true,
	} = config;

	// World-space geometry is resolved once in core; project it into THREE types
	// here. The table is rate-capped (see `useThrottledWorldFrames`) so the tree
	// reconciles at ~13 Hz instead of once per raw TF bump.
	const worldFrames = useThrottledWorldFrames(
		enabled ? targetFrame : "",
		staleThresholdMs,
	);

	// Vector3 pools reused across bumps: a TF update rewrites these in place rather
	// than allocating N fresh `THREE.Vector3` per node. Index-aligned with
	// `frameNodes`; consumers only read (instance writes copy, handlers clone), so
	// in-place reuse is safe. Grows monotonically; entries past the live count are
	// inert.
	const worldPosPoolRef = useRef<THREE.Vector3[]>([]);
	const parentPosPoolRef = useRef<THREE.Vector3[]>([]);

	const frameNodes = useMemo<FrameNode[]>(() => {
		if (!enabled) return [];
		const worldPool = worldPosPoolRef.current;
		const parentPool = parentPosPoolRef.current;
		return worldFrames.map((wf, index) => {
			let worldPos = worldPool[index];
			if (!worldPos) {
				worldPos = new THREE.Vector3();
				worldPool[index] = worldPos;
			}
			worldPos.set(
				wf.worldPosition.x,
				wf.worldPosition.y,
				wf.worldPosition.z,
			);

			let parentPos: THREE.Vector3 | null = null;
			if (wf.parentWorldPosition) {
				let pooled = parentPool[index];
				if (!pooled) {
					pooled = new THREE.Vector3();
					parentPool[index] = pooled;
				}
				pooled.set(
					wf.parentWorldPosition.x,
					wf.parentWorldPosition.y,
					wf.parentWorldPosition.z,
				);
				parentPos = pooled;
			}

			return {
				id: wf.rawFrameId,
				worldPos,
				parentPos,
				depth: wf.depth,
				inferred: wf.inferred,
				index,
			};
		});
	}, [worldFrames, enabled]);

	// Partition spheres into a solid set and a wireframe set (inferred roots).
	// `wireframe` is a material flag and cannot vary per instance on a shared
	// material, so inferred roots get their own InstancedMesh. When
	// `showInferredRoots` is off, every node is solid.
	const { solidNodes, wireframeNodes } = useMemo(() => {
		const solid: FrameNode[] = [];
		const wireframe: FrameNode[] = [];
		for (const node of frameNodes) {
			if (showInferredRoots && node.inferred) wireframe.push(node);
			else solid.push(node);
		}
		return { solidNodes: solid, wireframeNodes: wireframe };
	}, [frameNodes, showInferredRoots]);

	// Cylinders are only drawn for nodes that have an observed parent.
	const cylinderNodes = useMemo(
		() => frameNodes.filter((node) => node.parentPos !== null),
		[frameNodes],
	);

	// Geometry primitives (one each, shared by all instances of that kind).
	const sphereGeometry = useMemo(
		() => new THREE.SphereGeometry(sphereRadius, 16, 16),
		[sphereRadius],
	);
	const cylinderGeometry = useMemo(
		() => new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, 1, 8),
		[cylinderRadius],
	);

	// Materials. White base color — actual color comes from per-instance
	// `instanceColor`. One material per draw call.
	const solidMaterial = useMemo(
		() => new THREE.MeshStandardMaterial({ color: 0xffffff }),
		[],
	);
	const wireframeMaterial = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				color: 0xffffff,
				wireframe: true,
			}),
		[],
	);
	const cylinderMaterial = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				color: 0xffffff,
				opacity: 0.6,
				transparent: true,
			}),
		[],
	);

	// Dispose geometries/materials when they are replaced or the component unmounts.
	useEffect(() => () => sphereGeometry.dispose(), [sphereGeometry]);
	useEffect(() => () => cylinderGeometry.dispose(), [cylinderGeometry]);
	useEffect(() => () => solidMaterial.dispose(), [solidMaterial]);
	useEffect(() => () => wireframeMaterial.dispose(), [wireframeMaterial]);
	useEffect(() => () => cylinderMaterial.dispose(), [cylinderMaterial]);

	// InstancedMesh refs (created/recreated imperatively below as capacity grows).
	const solidMeshRef = useRef<THREE.InstancedMesh | null>(null);
	const wireframeMeshRef = useRef<THREE.InstancedMesh | null>(null);
	const cylinderMeshRef = useRef<THREE.InstancedMesh | null>(null);

	// Capacities are monotonic high-water marks: a mesh is recreated (new key →
	// fresh InstancedMesh of the larger size) only when the live count exceeds
	// the current capacity; otherwise the mesh is reused and only `.count` moves.
	// State is adjusted during render (React's supported "store info from
	// previous render" pattern) so growth re-renders immediately without an
	// effect — no setState-in-effect cascade.
	const [solidCapacity, setSolidCapacity] = useState(0);
	const [wireframeCapacity, setWireframeCapacity] = useState(0);
	const [cylinderCapacity, setCylinderCapacity] = useState(0);

	const neededSolid = nextCapacity(solidNodes.length);
	if (neededSolid > solidCapacity) setSolidCapacity(neededSolid);
	const neededWireframe = nextCapacity(wireframeNodes.length);
	if (neededWireframe > wireframeCapacity)
		setWireframeCapacity(neededWireframe);
	const neededCylinder = nextCapacity(cylinderNodes.length);
	if (neededCylinder > cylinderCapacity) setCylinderCapacity(neededCylinder);

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

	// Imperative instance update. Writes every sphere/cylinder matrix + color,
	// marks the instance buffers dirty, then explicitly `invalidate()`s — under
	// `frameloop="demand"` nothing else repaints these meshes on a data/hover
	// change. Deps cover everything that affects an instance's transform or color.
	useLayoutEffect(() => {
		const solidMesh = solidMeshRef.current;
		const wireframeMesh = wireframeMeshRef.current;
		const cylinderMesh = cylinderMeshRef.current;
		if (!solidMesh && !wireframeMesh && !cylinderMesh) return;

		const colorContext: ColorContext = {
			total: frameNodes.length,
			hoveredNodeId,
			hoverColor,
			colorScheme,
			uniformColor,
		};

		if (solidMesh)
			writeSphereInstances(solidMesh, solidNodes, colorContext);
		if (wireframeMesh)
			writeSphereInstances(wireframeMesh, wireframeNodes, colorContext);
		if (cylinderMesh)
			writeCylinderInstances(cylinderMesh, cylinderNodes, colorContext);

		invalidate();
	}, [
		frameNodes,
		solidNodes,
		wireframeNodes,
		cylinderNodes,
		hoveredNodeId,
		hoverColor,
		colorScheme,
		uniformColor,
		// Capacities are deps so the pass re-runs after a mesh is recreated.
		solidCapacity,
		wireframeCapacity,
		cylinderCapacity,
		invalidate,
	]);

	// Hover/click on a sphere InstancedMesh: r3f gives `e.instanceId`, the index
	// within that partition's ordered node array. The two sphere meshes hold
	// disjoint partitions, so each maps through its own array.
	const handleSpherePointerOver =
		(nodes: FrameNode[]) => (e: ThreeEvent<PointerEvent>) => {
			e.stopPropagation();
			const node =
				e.instanceId !== undefined ? nodes[e.instanceId] : undefined;
			if (node) setHoveredNodeId(node.id);
		};

	const handleSpherePointerOut =
		(nodes: FrameNode[]) => (e: ThreeEvent<PointerEvent>) => {
			e.stopPropagation();
			const node =
				e.instanceId !== undefined ? nodes[e.instanceId] : undefined;
			if (node)
				setHoveredNodeId((prev) => (prev === node.id ? null : prev));
		};

	const handleSphereClick =
		(nodes: FrameNode[]) => (e: ThreeEvent<MouseEvent>) => {
			e.stopPropagation();
			const node =
				e.instanceId !== undefined ? nodes[e.instanceId] : undefined;
			if (node) onNodeClick?.(node.id, node.worldPos.clone());
		};

	if (!enabled || frameNodes.length === 0) {
		return null;
	}

	return (
		<group>
			{/* Solid frame spheres — one draw call. `frustumCulled={false}`:
			    instance positions change every TF bump and the meshes are tiny,
			    so a recomputed bounding sphere would cost more than it saves. */}
			{solidCapacity > 0 && (
				<instancedMesh
					key={`solid-${solidCapacity}`}
					ref={solidMeshRef}
					args={[sphereGeometry, solidMaterial, solidCapacity]}
					frustumCulled={false}
					onPointerOver={handleSpherePointerOver(solidNodes)}
					onPointerOut={handleSpherePointerOut(solidNodes)}
					onClick={handleSphereClick(solidNodes)}
				/>
			)}

			{/* Inferred-root spheres rendered wireframe — separate draw call
			    because `wireframe` is a material flag, not a per-instance value. */}
			{wireframeCapacity > 0 && (
				<instancedMesh
					key={`wireframe-${wireframeCapacity}`}
					ref={wireframeMeshRef}
					args={[
						sphereGeometry,
						wireframeMaterial,
						wireframeCapacity,
					]}
					frustumCulled={false}
					onPointerOver={handleSpherePointerOver(wireframeNodes)}
					onPointerOut={handleSpherePointerOut(wireframeNodes)}
					onClick={handleSphereClick(wireframeNodes)}
				/>
			)}

			{/* Parent→child connection cylinders — one draw call. */}
			{cylinderCapacity > 0 && (
				<instancedMesh
					key={`cylinder-${cylinderCapacity}`}
					ref={cylinderMeshRef}
					args={[
						cylinderGeometry,
						cylinderMaterial,
						cylinderCapacity,
					]}
					frustumCulled={false}
				/>
			)}

			{/* Labels stay per-node: troika `<Text>` cannot be instanced. This is
			    the accepted residual cost of the instanced tree. */}
			{showLabels &&
				frameNodes.map((node) => {
					const isHovered = hoveredNodeId === node.id;
					const labelColor =
						"#" +
						computeNodeColor(
							node,
							frameNodes.length,
							isHovered,
							hoverColor,
							colorScheme,
							uniformColor,
							LABEL_COLOR_SCRATCH,
						).getHexString();
					return (
						<FrameLabel
							key={node.id}
							nodeId={node.id}
							position={[
								node.worldPos.x,
								node.worldPos.y + sphereRadius * 2.5,
								node.worldPos.z,
							]}
							fontSize={sphereRadius * (isHovered ? 0.9 : 0.6)}
							color={labelColor}
							isHovered={isHovered}
							sphereRadius={sphereRadius}
						/>
					);
				})}
		</group>
	);
};
