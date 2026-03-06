"use client";
/**
 * JointControllerLayer
 *
 * Renders one rotation gizmo per joint inside the R3F Canvas.
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
import { useThree, ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
	useLocalDataSource,
	usePublisherDataSource,
} from "@workspace/ormi-core/datasources";
import { useTransformSource } from "@workspace/ormi-core/transforms";
import { JointControllerConfig } from "../types/scene-3d-types";
import {
	FrameData,
	collectFrameData,
	collectSubtreeFrameIds,
	collectTreeRelations,
	extractJointStateMessage,
	getJointAxis,
	normalizeJointName,
	resolveJointFrame,
} from "../utils/joint-controller-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Per-joint rotation gizmo (ray-plane drag)
// ─────────────────────────────────────────────────────────────────────────────

interface JointGizmoProps {
	name: string;
	worldPos: THREE.Vector3;
	/**
	 * Joint rotation axis in THREE world space.
	 * The gizmo is oriented so its local Y = this axis.
	 * Provided by the datasource via TF frame orientation
	 * (see `getJointAxis` datasource contract).
	 */
	jointAxis: THREE.Vector3;
	currentAngle: number;
	/** Called with the joint name when the user starts dragging. */
	onDragStart: (name: string) => void;
	onDragPreview: (name: string, delta: number) => void;
	/** Called with (jointName, rotationDelta) when the user releases the gizmo. */
	onDragEnd: (name: string, delta: number) => void;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const HINGE_HANDLE_DISTANCE = 0.14;
/** Tube radius of the always-visible rotation-ring torus. */
const HINGE_RING_TUBE_RADIUS = 0.007;

const JointGizmo: React.FC<JointGizmoProps> = ({
	name,
	worldPos,
	jointAxis,
	currentAngle,
	onDragStart,
	onDragPreview,
	onDragEnd,
}) => {
	const { camera, gl } = useThree();
	const dragMatrix = useMemo(() => new THREE.Matrix4(), []);
	const latestDeltaRef = useRef(0);
	/** Angle accumulated during the current drag session (radians). */
	const accumDeltaRef = useRef(0);
	const isDraggingRef = useRef(false);
	/** Angle on the rotation plane at the previous pointer-move frame. */
	const prevPlaneAngleRef = useRef(0);
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
	 * getJointAxis extracts the Y column of the TF world matrix (the joint rotation
	 * axis after ROS→THREE conversion). We map WORLD_UP → that axis so the gizmo's
	 * local Y aligns with the joint axis.
	 *
	 * The drag handle is constrained to the gizmo's XZ plane (perpendicular to
	 * local Y), and getSignedDelta measures rotation around local Y using the
	 * right-hand cross-product sign convention, giving the joint angle delta. ✓
	 */
	const gizmoOrient = useMemo(
		() =>
			new THREE.Quaternion().setFromUnitVectors(WORLD_UP, safeJointAxis),
		[safeJointAxis],
	);

	/**
	 * Inverse quaternion: rotates world-space vectors into gizmo-local space.
	 * Used to read the angle of a world-space intersection point on the XZ plane.
	 */
	const gizmoOrientInv = useMemo(
		() => gizmoOrient.clone().invert(),
		[gizmoOrient],
	);

	/**
	 * The rotation plane for ray-intersection: normal = joint axis (world),
	 * passes through worldPos. Updated whenever axis or pivot moves.
	 */
	const rotationPlane = useMemo(() => new THREE.Plane(), []);
	useEffect(() => {
		rotationPlane.setFromNormalAndCoplanarPoint(safeJointAxis, worldPos);
	}, [rotationPlane, safeJointAxis, worldPos]);

	const currentAngleSafe = Number.isFinite(currentAngle) ? currentAngle : 0;

	/**
	 * Right-hand rotation by angle θ around local +Y maps +X to
	 * (cos θ, 0, −sin θ).  This matches getSignedDelta's atan2 convention so
	 * the computed delta correctly represents the change in joint angle.
	 */
	const getCurrentAngleDirection = useCallback((): THREE.Vector3 => {
		return new THREE.Vector3(
			Math.cos(currentAngleSafe),
			0,
			-Math.sin(currentAngleSafe),
		).normalize();
	}, [currentAngleSafe]);

	// Initialise dragMatrix to rest position whenever angle changes.
	useEffect(() => {
		dragMatrix.identity();
		dragMatrix.setPosition(
			getCurrentAngleDirection().multiplyScalar(HINGE_HANDLE_DISTANCE),
		);
	}, [dragMatrix, getCurrentAngleDirection]);

	// ── Stable callback refs so event listeners never capture stale closures ──
	const worldPosRef = useRef(worldPos);
	const currentAngleSafeRef = useRef(currentAngleSafe);
	const gizmoOrientInvRef = useRef(gizmoOrientInv);
	const rotationPlaneRef = useRef(rotationPlane);
	const onDragPreviewRef = useRef(onDragPreview);
	const onDragEndRef = useRef(onDragEnd);
	const getCurrentAngleDirectionRef = useRef(getCurrentAngleDirection);
	useEffect(() => {
		worldPosRef.current = worldPos;
	}, [worldPos]);
	useEffect(() => {
		currentAngleSafeRef.current = currentAngleSafe;
	}, [currentAngleSafe]);
	useEffect(() => {
		gizmoOrientInvRef.current = gizmoOrientInv;
	}, [gizmoOrientInv]);
	useEffect(() => {
		rotationPlaneRef.current = rotationPlane;
	}, [rotationPlane]);
	useEffect(() => {
		onDragPreviewRef.current = onDragPreview;
	}, [onDragPreview]);
	useEffect(() => {
		onDragEndRef.current = onDragEnd;
	}, [onDragEnd]);
	useEffect(() => {
		getCurrentAngleDirectionRef.current = getCurrentAngleDirection;
	}, [getCurrentAngleDirection]);

	/**
	 * Register pointermove and pointerup on the canvas element.
	 * This ensures drag events keep firing even when the pointer leaves the sphere,
	 * and removes any dependency on DragControls' internal state.
	 *
	 * Algorithm on each pointermove:
	 *   1. Build a ray from the camera through the current NDC mouse position.
	 *   2. Intersect with the joint's rotation plane
	 *      (normal = joint axis, passing through worldPos).
	 *   3. Convert the hit to gizmo-local space → atan2(-z, x) = angle on XZ plane.
	 *   4. Accumulate delta with [-π, π] wrapping (handles multi-revolution drags).
	 *   5. Write sphere position = (cos θ_total, 0, -sin θ_total) * radius into dragMatrix.
	 */
	useEffect(() => {
		const canvas = gl.domElement;
		const raycaster = new THREE.Raycaster();
		const hit = new THREE.Vector3();

		const onMove = (e: PointerEvent) => {
			if (!isDraggingRef.current) return;

			// Build NDC ray
			const rect = canvas.getBoundingClientRect();
			const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
			raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

			if (!raycaster.ray.intersectPlane(rotationPlaneRef.current, hit))
				return;

			// Angle of the hit point in gizmo-local XZ space
			const local = hit
				.clone()
				.sub(worldPosRef.current)
				.applyQuaternion(gizmoOrientInvRef.current);
			const angle = Math.atan2(-local.z, local.x);

			// Accumulate with [-π, π] wrapping to survive full-circle drags
			let delta = angle - prevPlaneAngleRef.current;
			if (delta > Math.PI) delta -= 2 * Math.PI;
			if (delta < -Math.PI) delta += 2 * Math.PI;
			accumDeltaRef.current += delta;
			latestDeltaRef.current = accumDeltaRef.current;
			prevPlaneAngleRef.current = angle;

			// Update sphere to the new absolute angle on the hinge circle
			const totalAngle =
				currentAngleSafeRef.current + accumDeltaRef.current;
			dragMatrix.identity();
			dragMatrix.setPosition(
				new THREE.Vector3(
					Math.cos(totalAngle),
					0,
					-Math.sin(totalAngle),
				).multiplyScalar(HINGE_HANDLE_DISTANCE),
			);

			onDragPreviewRef.current(name, accumDeltaRef.current);
		};

		const onUp = (e: PointerEvent) => {
			if (!isDraggingRef.current) return;
			isDraggingRef.current = false;
			canvas.releasePointerCapture(e.pointerId);

			const delta = latestDeltaRef.current;
			accumDeltaRef.current = 0;
			latestDeltaRef.current = 0;

			// Reset sphere to rest position at currentAngle
			dragMatrix.identity();
			dragMatrix.setPosition(
				getCurrentAngleDirectionRef
					.current()
					.multiplyScalar(HINGE_HANDLE_DISTANCE),
			);

			onDragPreviewRef.current(name, 0);
			onDragEndRef.current(name, delta);
		};

		canvas.addEventListener("pointermove", onMove);
		canvas.addEventListener("pointerup", onUp);
		return () => {
			canvas.removeEventListener("pointermove", onMove);
			canvas.removeEventListener("pointerup", onUp);
		};
	}, [camera, dragMatrix, gl.domElement, name]);

	/**
	 * pointerdown on the drag sphere:
	 *   - Capture the pointer so the canvas keeps receiving events during drag.
	 *   - Intersect the click ray with the rotation plane to get the start angle,
	 *     avoiding an initial jump on the first pointermove.
	 */
	const handlePointerDown = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			e.stopPropagation();
			gl.domElement.setPointerCapture(e.nativeEvent.pointerId);

			isDraggingRef.current = true;
			accumDeltaRef.current = 0;
			latestDeltaRef.current = 0;

			// Seed prevPlaneAngle from the actual click point so the first
			// pointermove delta is correct (not relative to angle-0).
			const hit = new THREE.Vector3();
			if (e.ray.intersectPlane(rotationPlane, hit)) {
				const local = hit
					.clone()
					.sub(worldPos)
					.applyQuaternion(gizmoOrientInv);
				prevPlaneAngleRef.current = Math.atan2(-local.z, local.x);
			} else {
				prevPlaneAngleRef.current = currentAngleSafe;
			}

			onDragStart(name);
		},
		[
			currentAngleSafe,
			gl.domElement,
			gizmoOrientInv,
			onDragStart,
			rotationPlane,
			worldPos,
			name,
		],
	);

	return (
		<>
			{/* Oriented group: local Y = joint axis, XZ plane = rotation plane */}
			<group position={pos} quaternion={gizmoOrient}>
				<primitive object={axisHelper} renderOrder={30} />

				{/* Rotation ring — always visible, shows the joint rotation plane.
				    torusGeometry lies in XY; rotate -π/2 around X to lay it in XZ.
				    Radius matches HINGE_HANDLE_DISTANCE so the drag sphere sits on the ring. */}
				<mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
					<torusGeometry
						args={[
							HINGE_HANDLE_DISTANCE,
							HINGE_RING_TUBE_RADIUS,
							8,
							64,
						]}
					/>
					<meshBasicMaterial
						color="#88ccff"
						transparent
						opacity={0.55}
						depthTest={false}
						depthWrite={false}
					/>
				</mesh>

				<mesh
					ref={(mesh) => {
						if (mesh) {
							mesh.matrixAutoUpdate = false;
							mesh.matrix = dragMatrix;
						}
					}}
					onPointerDown={handlePointerDown}
				>
					<sphereGeometry args={[0.03, 12, 12]} />
					<meshStandardMaterial
						color="#ff6600"
						emissive="#ff3300"
						emissiveIntensity={0.4}
					/>
				</mesh>

				{/* Live state marker on the current joint angle. */}
				<group rotation={[0, currentAngleSafe, 0]}>
					<mesh position={[HINGE_HANDLE_DISTANCE, 0, 0]}>
						<sphereGeometry args={[0.015, 8, 8]} />
						<meshStandardMaterial color="#ffffff" />
					</mesh>
				</group>
			</group>
		</>
	);
};

interface GhostPreviewProps {
	frameData: Map<string, FrameData>;
	parentById: Map<string, string | null>;
	frameIds: string[];
	pivot: THREE.Vector3;
	axis: THREE.Vector3;
	delta: number;
}

const GhostPreview: React.FC<GhostPreviewProps> = ({
	frameData,
	parentById,
	frameIds,
	pivot,
	axis,
	delta,
}) => {
	const { points, edges } = useMemo(() => {
		const safeAxis = axis.clone();
		if (
			!Number.isFinite(safeAxis.lengthSq()) ||
			safeAxis.lengthSq() < 1e-12
		) {
			safeAxis.set(0, 1, 0);
		}
		safeAxis.normalize();

		const rotation = new THREE.Quaternion().setFromAxisAngle(
			safeAxis,
			delta,
		);
		const transformed = new Map<string, THREE.Vector3>();
		for (const frameId of frameIds) {
			const original = frameData.get(frameId)?.worldPos;
			if (!original) continue;
			const moved = original
				.clone()
				.sub(pivot)
				.applyQuaternion(rotation)
				.add(pivot);
			transformed.set(frameId, moved);
		}

		const lines: Array<[THREE.Vector3, THREE.Vector3]> = [];
		for (const frameId of frameIds) {
			const childPos = transformed.get(frameId);
			if (!childPos) continue;
			const parentId = parentById.get(frameId);
			if (!parentId) continue;
			const parentPos = transformed.get(parentId);
			if (!parentPos) continue;
			lines.push([parentPos, childPos]);
		}

		return {
			points: transformed,
			edges: lines,
		};
	}, [axis, delta, frameData, frameIds, parentById, pivot]);

	return (
		<group>
			{edges.map(([from, to], index) => (
				<Line
					key={`ghost-edge-${index}`}
					points={[
						[from.x, from.y, from.z],
						[to.x, to.y, to.z],
					]}
					color="#8fd3ff"
					transparent
					opacity={0.35}
					depthWrite={false}
					depthTest={false}
				/>
			))}

			{[...points.entries()].map(([frameId, position]) => (
				<mesh
					key={`ghost-node-${frameId}`}
					position={[position.x, position.y, position.z]}
					renderOrder={6}
				>
					<sphereGeometry args={[0.02, 8, 8]} />
					<meshBasicMaterial
						color="#8fd3ff"
						transparent
						opacity={0.45}
						depthWrite={false}
						depthTest={false}
					/>
				</mesh>
			))}
		</group>
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
	const [ghostPreview, setGhostPreview] = useState<{
		frameId: string;
		pivot: THREE.Vector3;
		axis: THREE.Vector3;
		delta: number;
	} | null>(null);

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
	/**
	 * Snapshot of joint angles captured at drag-start.
	 * Used to seed positions for all non-dragged joints in trajectory mode,
	 * avoiding race conditions with live JointState updates mid-drag.
	 */
	const dragBaseAnglesRef = useRef<Map<string, number>>(new Map());

	// ── Refs for jog mode streaming ──────────────────────────────────────────
	/** Name of the joint currently being dragged (null when idle). */
	const activeDragJointRef = useRef<string | null>(null);
	/** Latest accumulated drag delta from handleDragPreview. */
	const previewDeltaRef = useRef<number>(0);
	/** Delta that was last published during jog streaming. */
	const lastJogPublishedDeltaRef = useRef<number>(0);
	/** Active jog interval handle. */
	const jogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

	const treeRelations = useMemo(
		() => collectTreeRelations(transformsTrees),
		[transformsTrees],
	);

	// ── For each known joint, resolve its TF world position and rotation axis ─
	const jointResolvedData = useMemo(() => {
		const result = new Map<
			string,
			{
				frameId: string;
				position: THREE.Vector3;
				axis: THREE.Vector3;
			}
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

			const axis = getJointAxis(frameData.get(frameId)!);
			result.set(name, {
				frameId,
				position: resolvedPos,
				axis,
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

			// Use the drag-base snapshot for positions of all other joints.
			// This avoids overwriting non-dragged joints with stale live data
			// that may have arrived mid-drag.
			const baseAngles = dragBaseAnglesRef.current;
			const positions = Array.from(jointOrder, (name) =>
				name === changedJointName
					? changedJointAngle
					: (baseAngles.get(name) ??
						commandedAnglesRef.current.get(name) ??
						0),
			);

			const duration = Number(config.duration ?? 1);
			const sec = Math.max(0, Math.floor(duration));
			const nanosec = Math.max(
				0,
				Math.min(999_999_999, Math.round((duration - sec) * 1e9)),
			);

			publisher.publish(
				{
					joint_names: [...jointOrder],
					points: [
						{
							positions,
							velocities: [],
							accelerations: [],
							effort: [],
							time_from_start: { sec, nanosec },
						},
					],
				},
				"JointTrajectory",
			);
		},
		[commandTopic, jointOrder, config.duration, publishers],
	);

	// ── OrbitControls: disable while dragging ──────────────────────────────
	/**
	 * Called by a JointGizmo when the user starts dragging.
	 * Disables orbit, snapshots current joint angles for race-free trajectory
	 * publishing, and starts the jog streaming interval in jog mode.
	 */
	const handleDragStart = useCallback(
		(name: string) => {
			if (controlsRef.current) controlsRef.current.enabled = false;

			// Snapshot angles at drag-start so publishCommand has a consistent
			// base for all joints, regardless of live JointState updates.
			dragBaseAnglesRef.current = new Map(jointAngles);
			activeDragJointRef.current = name;
			previewDeltaRef.current = 0;
			lastJogPublishedDeltaRef.current = 0;

			if (config.commandMode === "jog") {
				const freq = Math.max(1, config.jogFrequency ?? 30);
				const period = 1000 / freq;
				jogIntervalRef.current = setInterval(() => {
					const jointName = activeDragJointRef.current;
					if (!jointName || !commandTopic) return;
					const publisher = publishers.get(commandTopic.topic);
					if (!publisher) return;

					const current = previewDeltaRef.current;
					const last = lastJogPublishedDeltaRef.current;
					const displacement = current - last;
					if (Math.abs(displacement) < 1e-6) return;

					lastJogPublishedDeltaRef.current = current;
					publisher.publish(
						{
							joint_names: [jointName],
							velocities: [0],
							displacements: [displacement],
							duration: period / 1000,
						},
						"JointVelocity",
					);
				}, period);
			}
		},
		[
			controlsRef,
			jointAngles,
			config.commandMode,
			config.jogFrequency,
			commandTopic,
			publishers,
		],
	);

	const enableOrbit = useCallback(() => {
		const controls = controlsRef.current;
		if (controls) controls.enabled = true;
	}, [controlsRef]);

	useEffect(() => {
		const controls = controlsRef.current;
		return () => {
			if (controls) controls.enabled = true;
			if (jogIntervalRef.current) {
				clearInterval(jogIntervalRef.current);
				jogIntervalRef.current = null;
			}
		};
	}, [controlsRef]);

	// ── Per-joint drag-end handler ─────────────────────────────────────────
	const handleDragEnd = useCallback(
		(name: string, delta: number) => {
			enableOrbit();
			setGhostPreview(null);

			// Stop jog interval and clear drag state.
			if (jogIntervalRef.current) {
				clearInterval(jogIntervalRef.current);
				jogIntervalRef.current = null;
			}
			activeDragJointRef.current = null;

			if (config.commandMode === "jog") {
				// Send a zero-displacement stop command so the servo controller
				// does not keep moving after the pointer is released.
				if (commandTopic) {
					const publisher = publishers.get(commandTopic.topic);
					if (publisher) {
						publisher.publish(
							{
								joint_names: [name],
								velocities: [0],
								displacements: [0],
								duration: 0,
							},
							"JointVelocity",
						);
					}
				}
				return;
			}

			// Trajectory mode: publish the absolute target angle.
			const resolved = jointResolvedData.get(name);
			if (!resolved) return;
			const baseAngle = dragBaseAnglesRef.current.get(name) ?? 0;
			// Send the same absolute angle the ghost preview visualises:
			// drag-base angle + relative drag delta. No wrapping — ROS
			// joint angles are unbounded and the controller handles limits.
			publishCommand(name, baseAngle + delta);
		},
		[
			enableOrbit,
			publishCommand,
			jointResolvedData,
			config.commandMode,
			commandTopic,
			publishers,
		],
	);

	const handleDragPreview = useCallback(
		(name: string, delta: number) => {
			// Keep the jog interval up-to-date with the latest accumulated delta.
			previewDeltaRef.current = delta;

			const resolved = jointResolvedData.get(name);
			if (!resolved) {
				setGhostPreview(null);
				return;
			}
			setGhostPreview({
				frameId: resolved.frameId,
				pivot: resolved.position.clone(),
				axis: resolved.axis.clone(),
				delta,
			});
		},
		[jointResolvedData],
	);

	return (
		<>
			{ghostPreview &&
				(() => {
					const frameIds = collectSubtreeFrameIds(
						ghostPreview.frameId,
						treeRelations.childrenById,
					);
					if (frameIds.length === 0) return null;
					return (
						<GhostPreview
							frameData={frameData}
							parentById={treeRelations.parentById}
							frameIds={frameIds}
							pivot={ghostPreview.pivot}
							axis={ghostPreview.axis}
							delta={ghostPreview.delta}
						/>
					);
				})()}

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
						onDragStart={handleDragStart}
						onDragPreview={handleDragPreview}
						onDragEnd={handleDragEnd}
					/>
				);
			})}
		</>
	);
};
