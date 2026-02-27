"use client";
/**
 * Unified goal-pose / initial-pose interaction overlay for the R3F Canvas.
 *
 * Manages two mutually-exclusive pose modes (goalPose, initialPose) with a
 * single invisible ground-plane for raycasting and independent persistent
 * markers for each mode.
 *
 * Mode transitions:
 *   - Press G (goalPose shortcut)     → enter goal-pose mode
 *                                       (blocked while initialPose is active)
 *   - Press P (initialPose shortcut)  → enter initial-pose mode
 *                                       (blocked while goalPose is active)
 *   - Press the active shortcut again → return to idle
 *   - After publishing an initial pose → automatically switch to goal-pose
 *     mode (if goalPoseConfig is enabled + has a topic, otherwise go to idle)
 *
 * Workflow per mode:
 *   1. Press the shortcut key to enter that mode.
 *   2. Click anywhere on the ground plane to set the position.
 *   3. Drag to set the heading direction.
 *   4. Release to publish. Goal-pose stays active for another placement;
 *      initial-pose auto-switches to goal-pose.
 *
 * Publishing uses pluginsManager directly (advertise once on mount,
 * publish on release, unadvertise on unmount) so no additional
 * provider wrapper is required in the widget definition.
 */

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import * as THREE from "three";
import { ThreeEvent, useThree } from "@react-three/fiber";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { DigitalInput } from "@workspace/ui/combined/triggers";

import { PosePublisherConfig } from "../types/scene-3d-types";
import { GoalPoseMarker } from "./goal-pose-marker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Active pose mode. */
export type PoseMode = "idle" | "goalPose" | "initialPose";

/** Intermediate drag state while the user is placing a pose. */
interface DragState {
	clickPos: THREE.Vector3;
	yaw: number;
}

/** Confirmed pose for a persistent marker. */
interface ConfirmedPose {
	pos: THREE.Vector3;
	yaw: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Props for GoalPoseOverlay. */
export interface GoalPoseOverlayProps {
	/** Unified pose publisher configuration. */
	config: PosePublisherConfig;
	/** Called whenever the active mode changes. */
	onModeChange?: (mode: PoseMode) => void;
}

/**
 * Unified pose overlay placed inside the R3F Canvas.
 *
 * An invisible ground-plane mesh handles `onPointerDown / Move / Up`.
 * The component manages orbit-control availability and keyboard toggling for
 * both goal-pose (G) and initial-pose (P) modes with mutual exclusion.
 */
export const GoalPoseOverlay: React.FC<GoalPoseOverlayProps> = ({
	config,
	onModeChange,
}) => {
	const pm = usePluginsManager();
	const { controls, gl } = useThree();

	const goalShortcut: DigitalInput = config.goalShortcut ?? {
		type: "keyboard",
		key: "g",
	};
	const initialShortcut: DigitalInput = config.initialShortcut ?? {
		type: "keyboard",
		key: "p",
	};

	const goalTopic = config.goalTopic;
	const initialTopic = config.initialTopic;

	// Active mode — only one can be active at a time
	const [mode, setMode] = useState<PoseMode>("idle");

	// Drag state while the user holds the mouse
	const [drag, setDrag] = useState<DragState | null>(null);

	// Persistent marker for last confirmed goal pose only
	// (initial pose marker is intentionally not shown — it clutters the view)
	const [confirmedGoal, setConfirmedGoal] = useState<ConfirmedPose | null>(
		null,
	);

	const isActive = mode !== "idle";

	// Derived: active topic for current mode
	const activeTopic =
		mode === "goalPose"
			? goalTopic
			: mode === "initialPose"
				? initialTopic
				: undefined;

	// -----------------------------------------------------------------------
	// Advertise on mount, unadvertise on unmount — one ref per topic
	// -----------------------------------------------------------------------
	const advertisedGoalRef = useRef(false);
	const advertisedInitialRef = useRef(false);

	useEffect(() => {
		if (!goalTopic || advertisedGoalRef.current) return;
		advertisedGoalRef.current = true;
		pm.applyFilterAsync(
			`${goalTopic.source.id}-advertise`,
			goalTopic,
		).catch(() => {});
		return () => {
			if (goalTopic) {
				pm.doAction(`${goalTopic.source.id}-unadvertise`, goalTopic);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [goalTopic?.source?.id, goalTopic?.topic]);

	useEffect(() => {
		if (!initialTopic || advertisedInitialRef.current) return;
		advertisedInitialRef.current = true;
		pm.applyFilterAsync(
			`${initialTopic.source.id}-advertise`,
			initialTopic,
		).catch(() => {});
		return () => {
			if (initialTopic) {
				pm.doAction(
					`${initialTopic.source.id}-unadvertise`,
					initialTopic,
				);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialTopic?.source?.id, initialTopic?.topic]);

	// -----------------------------------------------------------------------
	// Notify parent whenever mode changes
	// -----------------------------------------------------------------------
	useEffect(() => {
		onModeChange?.(mode);
	}, [mode, onModeChange]);

	// -----------------------------------------------------------------------
	// Keyboard shortcuts — mutual exclusion between modes
	// -----------------------------------------------------------------------
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ignore shortcuts when typing in an input
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				(e.target as HTMLElement).isContentEditable
			) {
				return;
			}

			const key = e.key.toLowerCase();

			// G: toggle goal-pose mode — blocked when initial-pose is active
			if (
				config.enabled &&
				goalTopic &&
				goalShortcut.type === "keyboard" &&
				goalShortcut.key &&
				key === goalShortcut.key.toLowerCase()
			) {
				if (mode === "initialPose") return; // must disable P first
				setMode((prev) => (prev === "goalPose" ? "idle" : "goalPose"));
				setDrag(null);
				return;
			}

			// P: toggle initial-pose mode — blocked when goal-pose is active
			if (
				config.enabled &&
				initialTopic &&
				initialShortcut.type === "keyboard" &&
				initialShortcut.key &&
				key === initialShortcut.key.toLowerCase()
			) {
				if (mode === "goalPose") return; // must disable G first
				setMode((prev) =>
					prev === "initialPose" ? "idle" : "initialPose",
				);
				setDrag(null);
				return;
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		config.enabled,
		goalTopic,
		goalShortcut.type,
		goalShortcut.key,
		initialTopic,
		initialShortcut.type,
		initialShortcut.key,
		mode,
	]);

	// -----------------------------------------------------------------------
	// Enable / disable OrbitControls and update cursor
	// -----------------------------------------------------------------------
	useEffect(() => {
		if (controls) {
			(controls as THREE.EventDispatcher & { enabled: boolean }).enabled =
				!isActive;
		}
		gl.domElement.style.cursor = isActive ? "crosshair" : "";
		return () => {
			gl.domElement.style.cursor = "";
		};
	}, [isActive, controls, gl.domElement]);

	// -----------------------------------------------------------------------
	// Plane material (memoised to avoid per-frame allocations)
	// -----------------------------------------------------------------------
	const planeMaterial = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				transparent: true,
				opacity: 0,
				side: THREE.DoubleSide,
				depthWrite: false,
			}),
		[],
	);

	// -----------------------------------------------------------------------
	// Pointer event handlers
	// -----------------------------------------------------------------------
	const handlePointerDown = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			if (!isActive) return;
			e.stopPropagation();
			setDrag({ clickPos: e.point.clone(), yaw: 0 });
		},
		[isActive],
	);

	const handlePointerMove = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			if (!isActive || !drag) return;
			const dx = e.point.x - drag.clickPos.x;
			const dz = e.point.z - drag.clickPos.z;
			// Ry(yaw) rotates the marker's +X forward to (cos yaw, 0, -sin yaw).
			// To align with drag direction (dx, 0, dz): cos yaw = dx, -sin yaw = dz
			// → yaw = atan2(-dz, dx)
			const yaw = Math.atan2(-dz, dx);
			setDrag((prev) => (prev ? { ...prev, yaw } : prev));
		},
		[isActive, drag],
	);

	const handlePointerUp = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			if (!isActive || !drag || !activeTopic) return;
			e.stopPropagation();

			const { clickPos, yaw } = drag;

			// Build THREE quaternion from yaw (rotation around Y axis).
			// The arrow geometry points in +X, so Ry(yaw) makes it track the mouse.
			// convertQuaternion maps Ry(θ) → Rz(θ) in ROS, but the drag direction
			// in ROS corresponds to heading Rz(yaw − π/2), so we adjust the
			// published quaternion by −π/2 while keeping the marker at yaw.
			const quat = new THREE.Quaternion();
			quat.setFromAxisAngle(
				new THREE.Vector3(0, 1, 0),
				yaw - Math.PI / 2,
			);

			const poseData = {
				position: { x: clickPos.x, y: clickPos.y, z: clickPos.z },
				orientation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
				timestamp: Date.now() / 1000,
				convention: "THREE" as const,
				frameId: config.frameId ?? "map",
			};

			const webType = mode === "initialPose" ? "InitialPose" : "Pose";

			pm.doAction(
				`${activeTopic.source.id}-${activeTopic.topic}-publish`,
				activeTopic,
				poseData,
				webType,
			);

			if (mode === "initialPose") {
				// Auto-switch to goal-pose mode after publishing initial pose
				if (config.enabled && goalTopic) {
					setMode("goalPose");
				} else {
					setMode("idle");
				}
			} else {
				setConfirmedGoal({ pos: clickPos.clone(), yaw });
				// Stay in goalPose mode so user can place another goal
			}

			setDrag(null);
		},
		[
			isActive,
			drag,
			activeTopic,
			mode,
			config.enabled,
			config.frameId,
			goalTopic,
			pm,
		],
	);

	// -----------------------------------------------------------------------
	// Render
	// -----------------------------------------------------------------------
	return (
		<>
			{/*
			 * Invisible horizontal plane (XZ) for raycasting — only mounted when
			 * a mode is active so it never interferes with orbit controls.
			 */}
			{isActive && (
				<mesh
					rotation={[-Math.PI / 2, 0, 0]}
					material={planeMaterial}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
				>
					<planeGeometry args={[10_000, 10_000]} />
				</mesh>
			)}

			{/* In-progress marker while the user is dragging */}
			{isActive && drag && (
				<GoalPoseMarker
					position={drag.clickPos}
					yaw={drag.yaw}
					color={config.markerColor ?? "#ff4400"}
					size={config.markerSize ?? 0.5}
					opacity={0.55}
				/>
			)}

			{/* Persistent marker at the last confirmed goal pose only */}
			{confirmedGoal && (
				<GoalPoseMarker
					position={confirmedGoal.pos}
					yaw={confirmedGoal.yaw}
					color={config.markerColor ?? "#ff4400"}
					size={config.markerSize ?? 0.5}
					opacity={0.9}
				/>
			)}
		</>
	);
};
