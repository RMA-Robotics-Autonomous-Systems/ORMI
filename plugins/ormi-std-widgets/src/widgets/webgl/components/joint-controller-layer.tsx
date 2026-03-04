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

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import * as THREE from "three";
import { PivotControls, Text } from "@react-three/drei";
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

interface JointStateMessage {
	name: string[];
	position: number[];
}

const readArrayLikeValues = (value: unknown): unknown[] => {
	if (Array.isArray(value)) return value;
	if (!value || typeof value !== "object") return [];

	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([key]) => /^\d+$/.test(key))
		.sort((a, b) => Number(a[0]) - Number(b[0]));

	if (entries.length > 0) return entries.map(([, val]) => val);
	return Object.values(value as Record<string, unknown>);
};

const toStringArray = (value: unknown): string[] =>
	readArrayLikeValues(value).map((entry) => String(entry));

const toNumberArray = (value: unknown): number[] =>
	readArrayLikeValues(value).map((entry) => {
		const n = Number(entry);
		return Number.isFinite(n) ? n : 0;
	});

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
 * Extract the joint rotation axis in THREE world space from the TF local Y axis.
 *
 * We align gizmos to TF's local Y (as used for local-frame joint interactions).
 * `worldMatrix` is already in THREE convention, so the local Y basis column
 * directly gives the axis in world space.
 */
const getJointAxis = (data: FrameData): THREE.Vector3 => {
	const yAxis = new THREE.Vector3();
	data.worldMatrix.extractBasis(
		new THREE.Vector3(),
		yAxis,
		new THREE.Vector3(),
	);
	if (
		!Number.isFinite(yAxis.x) ||
		!Number.isFinite(yAxis.y) ||
		!Number.isFinite(yAxis.z)
	) {
		return new THREE.Vector3(0, 1, 0);
	}
	if (yAxis.lengthSq() < 1e-12) {
		return new THREE.Vector3(0, 1, 0);
	}
	return yAxis.normalize();
};

/**
 * Resolve the best TF frame for a given joint name.
 * Strategy (in order):
 *  1. Exact frame name match
 *  2. Replace `_joint` suffix with `_link`
 *  3. Any frame whose name starts with the joint's prefix (before `_joint`)
 */
const normalizeFrameName = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/^\/+/, "")
		.split("/")
		.filter(Boolean)
		.pop() ?? "";

const normalizeJointName = (value: string): string =>
	normalizeFrameName(value)
		.replace(/_joint$/, "")
		.replace(/_motor$/, "")
		.replace(/_actuator$/, "");

const tokenize = (value: string): string[] =>
	value
		.split(/[_\-\s]+/g)
		.map((token) => token.trim())
		.filter(Boolean);

const computeNameScore = (jointName: string, frameName: string): number => {
	const jn = normalizeJointName(jointName);
	const fn = normalizeFrameName(frameName);

	if (!jn || !fn) return 0;
	if (jn === fn) return 100;
	if (`${jn}_link` === fn || `${jn}_frame` === fn) return 95;
	if (fn.startsWith(jn) || jn.startsWith(fn)) return 80;

	const jointTokens = tokenize(jn);
	const frameTokens = tokenize(fn);
	if (jointTokens.length === 0 || frameTokens.length === 0) return 0;

	const overlap = jointTokens.filter((t) => frameTokens.includes(t)).length;
	const union = new Set([...jointTokens, ...frameTokens]).size;
	const ratio = union > 0 ? overlap / union : 0;

	if (ratio <= 0) return 0;
	return Math.round(ratio * 60);
};

const resolveJointFrame = (
	frameData: Map<string, FrameData>,
	jointName: string,
	manualMap: Map<string, string>,
): string | null => {
	const normalizedJoint = normalizeJointName(jointName);
	if (!normalizedJoint) return null;

	const manualFrame = manualMap.get(normalizedJoint);
	if (manualFrame) {
		if (frameData.has(manualFrame)) {
			return manualFrame;
		}

		const normalizedManualFrame = normalizeFrameName(manualFrame);
		const normalizedMatch = [...frameData.keys()].find(
			(frameId) => normalizeFrameName(frameId) === normalizedManualFrame,
		);
		if (normalizedMatch) {
			return normalizedMatch;
		}
	}

	if (frameData.has(jointName)) return jointName;

	let bestMatch: string | null = null;
	let bestScore = 0;

	for (const frameId of frameData.keys()) {
		const score = computeNameScore(jointName, frameId);
		if (score > bestScore) {
			bestScore = score;
			bestMatch = frameId;
		}
	}

	return bestScore >= 40 ? bestMatch : null;
};

const extractJointStateMessage = (value: unknown): JointStateMessage | null => {
	if (!value || typeof value !== "object") return null;

	const candidates: unknown[] = [
		value,
		(value as { data?: unknown }).data,
		(value as { message?: unknown }).message,
		(value as { payload?: unknown }).payload,
		(value as { rosData?: unknown }).rosData,
	].filter(Boolean);

	for (const candidate of candidates) {
		if (!candidate || typeof candidate !== "object") continue;
		const data = candidate as Record<string, unknown>;
		const names = data.name ?? data.joint_names;
		const positions = data.position ?? data.positions;

		const parsedNames = toStringArray(names);
		const parsedPositions = toNumberArray(positions);

		if (parsedNames.length > 0 && parsedPositions.length > 0) {
			return {
				name: parsedNames,
				position: parsedPositions,
			};
		}
	}

	return null;
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
	const dragMatrixRef = useRef(new THREE.Matrix4());
	const dragStartAngleRef = useRef<number | null>(null);
	const dragCurrentAngleRef = useRef<number | null>(null);
	const axisHelper = useMemo(() => {
		const helper = new THREE.AxesHelper(0.12);
		helper.raycast = () => null;
		helper.traverse((obj) => {
			const line = obj as THREE.LineSegments;
			const material = line.material;
			if (!material) return;
			if (Array.isArray(material)) {
				material.forEach((m) => {
					m.depthTest = false;
					m.depthWrite = false;
					m.transparent = true;
					m.opacity = 0.95;
				});
			} else {
				material.depthTest = false;
				material.depthWrite = false;
				material.transparent = true;
				material.opacity = 0.95;
			}
		});
		return helper;
	}, []);

	useEffect(() => {
		return () => {
			axisHelper.traverse((obj) => {
				const line = obj as THREE.LineSegments;
				if (line.geometry) line.geometry.dispose();
				const material = line.material;
				if (!material) return;
				if (Array.isArray(material)) {
					material.forEach((m) => m.dispose());
				} else {
					material.dispose();
				}
			});
		};
	}, [axisHelper]);

	const pos: [number, number, number] = [worldPos.x, worldPos.y, worldPos.z];
	const safeJointAxis = useMemo(() => {
		if (
			!Number.isFinite(jointAxis.x) ||
			!Number.isFinite(jointAxis.y) ||
			!Number.isFinite(jointAxis.z) ||
			jointAxis.lengthSq() < 1e-12
		) {
			return WORLD_UP;
		}
		return jointAxis;
	}, [jointAxis]);

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
		() =>
			new THREE.Quaternion().setFromUnitVectors(WORLD_UP, safeJointAxis),
		[safeJointAxis],
	);

	// Inverse quaternion used to keep the Text label world-upright
	// even though the parent group is rotated.
	const gizmoOrientInv = useMemo(
		() => gizmoOrient.clone().invert(),
		[gizmoOrient],
	);

	const getLocalYAngle = useCallback((matrix: THREE.Matrix4): number => {
		const euler = new THREE.Euler().setFromRotationMatrix(matrix, "YXZ");
		return Number.isFinite(euler.y) ? euler.y : 0;
	}, []);

	const handleDragStartInternal = useCallback(() => {
		dragStartAngleRef.current = null;
		dragCurrentAngleRef.current = null;
		onDragStart();
	}, [onDragStart]);

	const handleDrag = useCallback(
		(local: THREE.Matrix4) => {
			dragMatrixRef.current.copy(local);
			const y = getLocalYAngle(local);
			if (dragStartAngleRef.current === null) {
				dragStartAngleRef.current = y;
			}
			dragCurrentAngleRef.current = y;
		},
		[getLocalYAngle],
	);

	const handleDragEnd = useCallback(() => {
		const start = dragStartAngleRef.current;
		const end =
			dragCurrentAngleRef.current ??
			getLocalYAngle(dragMatrixRef.current);
		const delta = start === null ? 0 : end - start;
		dragMatrixRef.current.identity();
		dragStartAngleRef.current = null;
		dragCurrentAngleRef.current = null;
		onDragEnd(name, delta);
		// Remount so the gizmo resets to identity for the next interaction
		setDragKey((k) => k + 1);
	}, [getLocalYAngle, name, onDragEnd]);

	const angleDeg = (currentAngle * RAD_TO_DEG).toFixed(1);
	const currentAngleSafe = Number.isFinite(currentAngle) ? currentAngle : 0;

	return (
		<>
			{/* Oriented group: local Y = joint axis, XZ plane = rotation plane */}
			<group position={pos} quaternion={gizmoOrient}>
				<primitive object={axisHelper} renderOrder={30} />

				<PivotControls
					key={dragKey}
					anchor={[0, 0, 0]}
					scale={0.45}
					lineWidth={4}
					// Show rotation handle only.
					disableAxes
					disableSliders
					disableRotations={false}
					disableScaling
					// Show ONLY the Y rotation ring.
					// ROS Z (joint axis) was mapped to this group's local Y by
					// gizmoOrient, so Y is the one and only valid rotation.
					// activeAxes={[false, true, false]}
					depthTest={false}
					onDragStart={handleDragStartInternal}
					onDrag={handleDrag}
					onDragEnd={handleDragEnd}
				>
					{/* Rotate controlled object to current joint state so dragging starts from live pose */}
					<group rotation={[0, currentAngleSafe, 0]}>
						<mesh>
							<sphereGeometry args={[0.04, 8, 8]} />
							<meshStandardMaterial
								color="#ff6600"
								emissive="#ff3300"
								emissiveIntensity={0.7}
								depthTest={false}
								depthWrite={false}
							/>
						</mesh>
					</group>
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
						{name}
						{"\n"}
						{`${angleDeg}°`}
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
	const latestRawMsg = source?.data[source.data.length - 1];
	const latestMsg = useMemo(
		() => extractJointStateMessage(latestRawMsg),
		[latestRawMsg],
	);

	const manualJointFrameMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const mapping of config.jointFrameMappings ?? []) {
			const jointName = normalizeJointName(mapping.jointName ?? "");
			const frameId = (mapping.frameId ?? "").trim();
			if (!jointName || !frameId) continue;
			map.set(jointName, frameId);
		}
		return map;
	}, [config.jointFrameMappings]);

	// Derive joint order and angles directly from source — fallback to manual mappings
	const jointOrder = useMemo<string[]>(() => {
		if (latestMsg?.name && latestMsg.name.length > 0) {
			return latestMsg.name;
		}
		if ((config.jointFrameMappings ?? []).length > 0) {
			return (config.jointFrameMappings ?? [])
				.map((entry) => (entry.jointName ?? "").trim())
				.filter((name) => name.length > 0);
		}
		return [];
	}, [latestMsg, config.jointFrameMappings]);
	const jointAngles = useMemo<Map<string, number>>(() => {
		const map = new Map<string, number>();
		if (latestMsg?.name && latestMsg.position) {
			latestMsg.name.forEach((name, i) =>
				map.set(name, latestMsg.position[i] ?? 0),
			);
		}
		for (const name of jointOrder) {
			if (!map.has(name)) map.set(name, 0);
		}
		return map;
	}, [latestMsg, jointOrder]);
	const commandedAnglesRef = useRef<Map<string, number>>(new Map());

	useEffect(() => {
		const next = new Map(commandedAnglesRef.current);

		for (const jointName of jointOrder) {
			if (jointAngles.has(jointName)) {
				next.set(jointName, jointAngles.get(jointName) ?? 0);
			} else if (!next.has(jointName)) {
				next.set(jointName, 0);
			}
		}

		for (const existingName of [...next.keys()]) {
			if (!jointOrder.includes(existingName)) {
				next.delete(existingName);
			}
		}

		commandedAnglesRef.current = next;
	}, [jointOrder, jointAngles]);

	// ── Flat map of frameId → FrameData (world pos + parent matrix) ──────────
	const frameData = useMemo(() => {
		const result = new Map<string, FrameData>();
		transformsTrees.forEach((tree) =>
			collectFrameData(tree, new THREE.Matrix4(), result),
		);
		return result;
	}, [transformsTrees]);

	// ── For each known joint, resolve its TF world position and rotation axis ─
	const jointResolvedData = useMemo(() => {
		const result = new Map<
			string,
			{ position: THREE.Vector3; axis: THREE.Vector3 }
		>();
		for (const name of jointOrder) {
			const frameId = resolveJointFrame(
				frameData,
				name,
				manualJointFrameMap,
			);
			if (!frameId || !frameData.has(frameId)) {
				continue;
			}

			const resolvedPos = frameData.get(frameId)!.worldPos.clone();
			if (
				!Number.isFinite(resolvedPos.x) ||
				!Number.isFinite(resolvedPos.y) ||
				!Number.isFinite(resolvedPos.z)
			) {
				continue;
			}

			result.set(name, {
				position: resolvedPos,
				axis: getJointAxis(frameData.get(frameId)!),
			});
		}
		return result;
	}, [jointOrder, frameData, manualJointFrameMap]);

	// ── Publish a JointTrajectory command via the publisher system ──────────
	const publishCommand = useCallback(
		(changedJointName: string, changedJointAngle: number) => {
			if (!commandTopic || jointOrder.length === 0) return;

			const publisher = publishers.get(commandTopic.topic);
			if (!publisher) return;

			const updatedAngles = new Map(commandedAnglesRef.current);

			if (latestMsg?.name && latestMsg.position) {
				latestMsg.name.forEach((name, index) => {
					updatedAngles.set(name, latestMsg.position[index] ?? 0);
				});
			}

			updatedAngles.set(changedJointName, changedJointAngle);
			commandedAnglesRef.current = updatedAngles;

			const publishJointNames = [...jointOrder];
			const positions = Array.from(
				publishJointNames,
				(name) => updatedAngles.get(name) ?? 0,
			);
			const duration = Number(config.duration ?? 1);
			const sec = Math.max(0, Math.floor(duration));
			const nanosec = Math.max(
				0,
				Math.min(999_999_999, Math.round((duration - sec) * 1e9)),
			);

			publisher.publish(
				{
					joint_names: publishJointNames,
					points: [
						{
							positions,
							velocities: [],
							accelerations: [],
							effort: [],
							time_from_start: {
								sec,
								nanosec,
							},
						},
					],
				},
				"JointTrajectory",
			);
		},
		[commandTopic, jointOrder, config.duration, publishers, latestMsg],
	);

	// ── OrbitControls: disable while dragging ──────────────────────────────
	const disableOrbit = useCallback(() => {
		if (controlsRef.current) controlsRef.current.enabled = false;
	}, [controlsRef]);

	const enableOrbit = useCallback(() => {
		const controls = controlsRef.current;
		if (controls) controls.enabled = true;
	}, [controlsRef]);

	useEffect(() => {
		const controls = controlsRef.current;
		return () => {
			if (controls) controls.enabled = true;
		};
	}, [controlsRef]);

	// ── Per-joint drag-end handler ─────────────────────────────────────────
	const handleDragEnd = useCallback(
		(name: string, delta: number) => {
			enableOrbit();
			const baseAngle =
				jointAngles.get(name) ??
				commandedAnglesRef.current.get(name) ??
				0;
			const nextAngle = baseAngle + delta;
			publishCommand(name, nextAngle);
		},
		[enableOrbit, publishCommand, jointAngles],
	);

	return (
		<>
			{jointOrder.map((name) => {
				const resolved = jointResolvedData.get(name);
				if (!resolved) return null;
				return (
					<JointGizmo
						key={name}
						name={name}
						worldPos={resolved.position}
						jointAxis={resolved.axis}
						currentAngle={jointAngles.get(name) ?? 0}
						onDragStart={disableOrbit}
						onDragEnd={handleDragEnd}
					/>
				);
			})}
		</>
	);
};
