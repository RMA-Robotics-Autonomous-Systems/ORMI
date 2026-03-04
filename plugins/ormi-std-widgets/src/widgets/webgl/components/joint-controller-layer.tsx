"use client";
/**
 * JointControllerLayer
 *
 * Renders one `PivotControls` gizmo per joint inside the R3F Canvas.
 *
 * Auto-discovery:
 *  - Joint names are discovered from the first `sensor_msgs/JointState`
 *    message received on `jointStateTopic`.
 *  - Each gizmo is placed at the world-space position of the matching TF
 *    frame, resolved by: exact match → `_joint`→`_link` substitution →
 *    first frame whose name starts with the joint prefix.
 *  - TF positions update live as the robot moves.
 *
 * Topic contracts:
 *  - jointStateTopic:  sensor_msgs/msg/JointState
 *    Incoming:  { name: string[], position: number[], ... }
 *  - commandTopic:     trajectory_msgs/msg/JointTrajectory
 *    Outgoing:  { joint_names: string[], points: [{ positions: number[], time_from_start: { sec, nanosec } }] }
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Line, PivotControls, Text } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
	useLocalDataSource,
	usePublisherDataSource,
} from "@workspace/ormi-core/datasources";
import {
	useTransformSource,
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import {
	TransformTree,
	CoordinateConvention,
} from "@workspace/ormi-core/types";
import { JointControllerConfig } from "../types/scene-3d-types";

// ─────────────────────────────────────────────────────────────────────────────
// TF helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Compute the world matrix for a TF node given its parent's world matrix. */
const getWorldMatrix = (
	node: TransformTree,
	parentMatrix: THREE.Matrix4 = new THREE.Matrix4(),
): THREE.Matrix4 => {
	const convention =
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
	const local = new THREE.Matrix4().compose(
		new THREE.Vector3(pos.x, pos.y, pos.z),
		new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w),
		new THREE.Vector3(1, 1, 1),
	);
	return new THREE.Matrix4().multiplyMatrices(parentMatrix, local);
};

/** Recursively collect per-frame data: world position + frame's own world matrix. */
interface FrameData {
	worldPos: THREE.Vector3;
	/**
	 * World-space matrix of THIS frame (already in THREE convention).
	 * Used to extract the joint rotation axis: ROS joints rotate around
	 * Z=[0,0,1] in the joint's OWN coordinate frame.  Because Rz(θ)*Z = Z,
	 * the Z column of the child frame's world matrix is invariant under the
	 * joint's own rotation — it always points along the joint axis in world
	 * space regardless of the current joint angle.
	 */
	worldMatrix: THREE.Matrix4;
}

const collectFrameData = (
	tree: TransformTree,
	parentMatrix: THREE.Matrix4 = new THREE.Matrix4(),
	result: Map<string, FrameData> = new Map(),
): Map<string, FrameData> => {
	const worldMatrix = getWorldMatrix(tree, parentMatrix);
	result.set(tree.id, {
		worldPos: new THREE.Vector3().setFromMatrixPosition(worldMatrix),
		worldMatrix: worldMatrix.clone(),
	});
	tree.children.forEach((child) =>
		collectFrameData(child, worldMatrix, result),
	);
	return result;
};

/**
 * Extract the joint rotation axis in THREE world space.
 *
 * ROS/URDF convention: joints rotate around Z=[0,0,1] in the joint's LOCAL
 * frame (the child link frame in TF).  Because Rz(θ)·[0,0,1] = [0,0,1],
 * the Z axis is invariant under the joint's own rotation.  Therefore the
 * Z column of the joint frame's world matrix always equals the joint axis
 * in world space, independent of the current joint angle.
 *
 * `worldMatrix` is already in THREE convention (converted by getWorldMatrix),
 * so its local Z column is the joint axis ready to use in the THREE scene.
 */
const getJointAxis = (data: FrameData): THREE.Vector3 => {
	const zAxis = new THREE.Vector3();
	data.worldMatrix.extractBasis(
		new THREE.Vector3(),
		new THREE.Vector3(),
		zAxis,
	);
	return zAxis.normalize();
};

/**
 * Resolve the best TF frame for a given joint name.
 * Strategy (in order):
 *  1. Exact frame name match
 *  2. Replace `_joint` suffix with `_link`
 *  3. Any frame whose name starts with the joint's prefix (before `_joint`)
 */
const resolveJointFrame = (
	frameData: Map<string, FrameData>,
	jointName: string,
): string | null => {
	if (frameData.has(jointName)) return jointName;
	const linkName = jointName.replace(/_joint$/, "_link");
	if (frameData.has(linkName)) return linkName;
	const prefix = jointName.replace(/_joint$/, "");
	if (prefix && prefix !== jointName) {
		const match = [...frameData.keys()].find((id) => id.startsWith(prefix));
		if (match) return match;
	}
	return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Arc preview helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PivotControls scale and matching arc radius.
 * The rotation ring drawn by PivotControls at scale S sits at radius S.
 * ARC_RADIUS is set slightly larger so the swept arc is clearly visible
 * outside the gizmo ring without being distracting.
 */
const PIVOT_SCALE = 0.3;
const ARC_RADIUS = PIVOT_SCALE * 1.35;

/**
 * Generate a polyline approximating an arc in the XZ plane (Y = 0).
 * The arc is swept from `fromAngle` to `toAngle` (radians) at `radius`.
 * The group containing this line should have its local Y aligned with the
 * joint axis so the XZ plane is the joint's rotation plane.
 */
const arcPoints = (
	fromAngle: number,
	toAngle: number,
	radius: number = ARC_RADIUS,
	segments = 64,
): [number, number, number][] => {
	const span = toAngle - fromAngle;
	const count = Math.max(
		2,
		Math.ceil((Math.abs(span) / (Math.PI * 2)) * segments),
	);
	return Array.from({ length: count + 1 }, (_, i) => {
		const a = fromAngle + span * (i / count);
		return [Math.cos(a) * radius, 0, Math.sin(a) * radius];
	});
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-joint PivotControls gizmo
// ─────────────────────────────────────────────────────────────────────────────

interface JointGizmoProps {
	name: string;
	worldPos: THREE.Vector3;
	/**
	 * Joint rotation axis in THREE world space.
	 * Derived from the parent TF frame's local Z column (ROS URDF default axis).
	 * The gizmo group is oriented so its local Y = this axis, making `euler.y`
	 * of the drag matrix equal to the joint angle delta.
	 */
	jointAxis: THREE.Vector3;
	currentAngle: number;
	onDragStart: () => void;
	/** Called with (jointName, rotationDelta) when the user releases the gizmo. */
	onDragEnd: (name: string, delta: number) => void;
}

const RAD_TO_DEG = 180 / Math.PI;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const JointGizmo: React.FC<JointGizmoProps> = ({
	name,
	worldPos,
	jointAxis,
	currentAngle,
	onDragStart,
	onDragEnd,
}) => {
	// Increment key to remount PivotControls after each drag → fresh identity state.
	// onDragEnd has no parameters in @react-three/drei v10, so we cache the
	// accumulated matrix via onDrag and read it in the onDragEnd callback.
	const [dragKey, setDragKey] = useState(0);
	// Live drag angle for preview — null when idle, non-null while dragging.
	const [dragAngle, setDragAngle] = useState<number | null>(null);
	const dragMatrixRef = useRef(new THREE.Matrix4());

	const pos: [number, number, number] = [worldPos.x, worldPos.y, worldPos.z];

	/**
	 * Orient the gizmo group so its local Y = joint axis in THREE world space.
	 *
	 * Why Y?
	 *  - ROS joints rotate around local Z in the parent frame.
	 *  - getWorldMatrix maps ROS→THREE, so that Z becomes the parent's
	 *    local Z column in THREE space (extracted by getJointAxis).
	 *  - We then align the gizmo group's Y with that axis.
	 *  - PivotControls is configured with activeAxes={[false,true,false]},
	 *    leaving only the Y rotation ring visible.
	 *  - The Y ring lies in the group's XZ plane, which is now exactly the
	 *    joint's rotation plane in world space.
	 *  - euler.y of the drag matrix = delta around the joint axis. ✓
	 */
	const gizmoOrient = useMemo(
		() => new THREE.Quaternion().setFromUnitVectors(WORLD_UP, jointAxis),
		[jointAxis],
	);

	// Inverse quaternion used to keep the Text label world-upright
	// even though the parent group is rotated.
	const gizmoOrientInv = useMemo(
		() => gizmoOrient.clone().invert(),
		[gizmoOrient],
	);

	const handleDrag = useCallback((local: THREE.Matrix4) => {
		dragMatrixRef.current.copy(local);
		// Extract the live rotation delta and expose it for the preview.
		const euler = new THREE.Euler().setFromRotationMatrix(local, "YXZ");
		setDragAngle(euler.y);
	}, []);

	const handleDragEnd = useCallback(() => {
		// The drag matrix is in the gizmo's LOCAL space (group frame).
		// Because the group's Y is aligned with the joint axis, euler.y
		// gives the exact rotation delta around the joint axis.
		const euler = new THREE.Euler().setFromRotationMatrix(
			dragMatrixRef.current,
			"YXZ",
		);
		const delta = euler.y;
		dragMatrixRef.current.identity();
		setDragAngle(null);
		onDragEnd(name, delta);
		// Remount so the gizmo resets to identity for the next interaction
		setDragKey((k) => k + 1);
	}, [name, onDragEnd]);

	const angleDeg = (currentAngle * RAD_TO_DEG).toFixed(1);
	const dragDeg =
		dragAngle !== null ? (dragAngle * RAD_TO_DEG).toFixed(1) : null;

	// Precompute arc geometry only while dragging (null → skip render)
	const sweptArc = useMemo(
		() =>
			dragAngle !== null && Math.abs(dragAngle) > 0.005
				? arcPoints(0, dragAngle)
				: null,
		[dragAngle],
	);
	const arcColor =
		dragAngle !== null && dragAngle >= 0 ? "#00e5ff" : "#ff9100";

	return (
		<>
			{/* Oriented group: local Y = joint axis, XZ plane = rotation plane */}
			<group position={pos} quaternion={gizmoOrient}>
				{/* Subtle idle ring showing the rotation plane */}
				<mesh>
					<ringGeometry
						args={[ARC_RADIUS - 0.005, ARC_RADIUS + 0.005, 64]}
					/>
					<meshBasicMaterial
						color="#ffffff"
						transparent
						opacity={dragAngle !== null ? 0.08 : 0.2}
						side={THREE.DoubleSide}
					/>
				</mesh>

				{/* Zero-reference spoke (always visible) */}
				<Line
					points={[
						[0, 0, 0],
						[ARC_RADIUS, 0, 0],
					]}
					color="#ffffff"
					lineWidth={1}
					transparent
					opacity={0.35}
				/>

				{/* ── Drag preview ──────────────────────────────────────── */}
				{dragAngle !== null && (
					<>
						{/* Filled swept arc */}
						{sweptArc && (
							<Line
								points={sweptArc}
								color={arcColor}
								lineWidth={3}
							/>
						)}
						{/* Radial spoke to current drag position */}
						<Line
							points={[
								[0, 0, 0],
								[
									Math.cos(dragAngle) * ARC_RADIUS,
									0,
									Math.sin(dragAngle) * ARC_RADIUS,
								],
							]}
							color={arcColor}
							lineWidth={2}
						/>
					</>
				)}

				<PivotControls
					key={dragKey}
					anchor={[0, 0, 0]}
					scale={PIVOT_SCALE}
					lineWidth={2}
					// Hide arrows, sliders and scaling handles entirely.
					disableAxes
					disableSliders
					disableScaling
					// Show ONLY the Y rotation ring.
					// ROS Z (joint axis) was mapped to this group's local Y by
					// gizmoOrient, so Y is the one and only valid rotation.
					activeAxes={[false, true, false]}
					onDragStart={onDragStart}
					onDrag={handleDrag}
					onDragEnd={handleDragEnd}
				>
					{/* Visual joint marker */}
					<mesh>
						<sphereGeometry args={[0.04, 8, 8]} />
						<meshStandardMaterial
							color="#ff6600"
							emissive="#ff3300"
							emissiveIntensity={0.4}
						/>
					</mesh>
				</PivotControls>

				{/* Label: counter-rotate to keep it world-upright */}
				<group quaternion={gizmoOrientInv}>
					<Text
						position={[0, 0.22, 0]}
						fontSize={0.07}
						color="white"
						anchorX="center"
						anchorY="bottom"
						outlineWidth={0.004}
						outlineColor="#000"
					>
						{dragDeg !== null
							? `${name}\n${angleDeg}° ${dragAngle! >= 0 ? "+" : ""}${dragDeg}°`
							: `${name}\n${angleDeg}°`}
					</Text>
				</group>
			</group>
		</>
	);
};

// ─────────────────────────────────────────────────────────────────────────────
// Main layer component
// ─────────────────────────────────────────────────────────────────────────────

interface JointControllerLayerProps {
	config: JointControllerConfig;
	controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

export const JointControllerLayer: React.FC<JointControllerLayerProps> = ({
	config,
	controlsRef,
}) => {
	const { getSource } = useLocalDataSource();
	const { publishers } = usePublisherDataSource();
	const { transformsTrees } = useTransformSource();

	const jointStateTopic = config.jointStateTopic;
	const commandTopic = config.commandTopic;

	// ── Read buffered data from the local datasource (managed by LocalDataSourcesProvider) ──
	const source = jointStateTopic ? getSource(jointStateTopic) : undefined;
	const latestMsg = source?.data[source.data.length - 1] as
		| { name: string[]; position: number[] }
		| undefined;

	// Derive joint order and angles directly from source — no state, no effects
	const jointOrder = useMemo<string[]>(
		() => latestMsg?.name ?? [],
		[latestMsg],
	);
	const jointAngles = useMemo<Map<string, number>>(() => {
		const map = new Map<string, number>();
		if (!latestMsg) return map;
		latestMsg.name.forEach((name, i) =>
			map.set(name, latestMsg.position[i] ?? 0),
		);
		return map;
	}, [latestMsg]);

	// ── Flat map of frameId → FrameData (world pos + parent matrix) ──────────
	const frameData = useMemo(() => {
		const result = new Map<string, FrameData>();
		transformsTrees.forEach((tree) =>
			collectFrameData(tree, new THREE.Matrix4(), result),
		);
		return result;
	}, [transformsTrees]);

	// ── For each known joint, resolve its TF world position and rotation axis ─
	const jointPositions = useMemo(() => {
		const result = new Map<string, THREE.Vector3>();
		for (const name of jointOrder) {
			const frameId = resolveJointFrame(frameData, name);
			result.set(
				name,
				frameId
					? frameData.get(frameId)!.worldPos.clone()
					: new THREE.Vector3(),
			);
		}
		return result;
	}, [jointOrder, frameData]);

	/**
	 * Per-joint rotation axis in THREE world space.
	 * Extracted from the resolved frame's parent world matrix Z column,
	 * which corresponds to ROS URDF default axis [0,0,1] in the parent frame.
	 * Falls back to world Y when no matching TF frame exists.
	 */
	const jointAxes = useMemo(() => {
		const result = new Map<string, THREE.Vector3>();
		for (const name of jointOrder) {
			const frameId = resolveJointFrame(frameData, name);
			const axis =
				frameId && frameData.has(frameId)
					? getJointAxis(frameData.get(frameId)!)
					: new THREE.Vector3(0, 1, 0);
			result.set(name, axis);
		}
		return result;
	}, [jointOrder, frameData]);

	// ── Publish a JointTrajectory command via the publisher system ──────────
	const publishCommand = useCallback(
		(angles: Map<string, number>) => {
			if (!commandTopic || jointOrder.length === 0) return;

			const publisher = publishers.get(commandTopic.topic);
			if (!publisher) return;

			const positions = jointOrder.map((name) => angles.get(name) ?? 0);

			publisher.publish(
				{
					joint_names: jointOrder,
					points: [
						{
							positions,
							time_from_start: {
								sec: config.duration ?? 1,
								nanosec: 0,
							},
						},
					],
				},
				"JointTrajectory",
			);
		},
		[commandTopic, jointOrder, config.duration, publishers],
	);

	// ── OrbitControls: disable while dragging ──────────────────────────────
	const disableOrbit = useCallback(() => {
		if (controlsRef.current) controlsRef.current.enabled = false;
	}, [controlsRef]);

	const enableOrbit = useCallback(() => {
		if (controlsRef.current) controlsRef.current.enabled = true;
	}, [controlsRef]);

	// ── Per-joint drag-end handler ─────────────────────────────────────────
	const handleDragEnd = useCallback(
		(name: string, delta: number) => {
			enableOrbit();
			// Compute updated angles from live source + drag delta, then publish
			const updated = new Map<string, number>(jointAngles);
			updated.set(name, (jointAngles.get(name) ?? 0) + delta);
			publishCommand(updated);
		},
		[enableOrbit, jointAngles, publishCommand],
	);

	return (
		<>
			{jointOrder.map((name) => {
				const pos = jointPositions.get(name) ?? new THREE.Vector3();
				const axis = jointAxes.get(name) ?? new THREE.Vector3(0, 1, 0);
				return (
					<JointGizmo
						key={name}
						name={name}
						worldPos={pos}
						jointAxis={axis}
						currentAngle={jointAngles.get(name) ?? 0}
						onDragStart={disableOrbit}
						onDragEnd={handleDragEnd}
					/>
				);
			})}
		</>
	);
};
