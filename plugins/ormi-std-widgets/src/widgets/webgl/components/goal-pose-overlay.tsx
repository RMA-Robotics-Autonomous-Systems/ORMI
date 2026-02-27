"use client";
/**
 * Goal pose interaction overlay for the R3F Canvas.
 *
 * Renders an invisible ground plane that captures pointer events.
 * When goal-pose mode is active (toggled by a keyboard shortcut),
 * a click-drag-release gesture places a navigation goal:
 *
 *   1. Press the shortcut key (default "g") to enter goal-pose mode.
 *   2. Click anywhere on the ground plane to set the goal position.
 *   3. Drag to set the heading direction.
 *   4. Release to publish the goal and return to orbit mode.
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

import { GoalPoseConfig } from "../types/scene-3d-types";
import { GoalPoseMarker } from "./goal-pose-marker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Intermediate drag state while the user is placing a goal. */
interface DragState {
	clickPos: THREE.Vector3;
	yaw: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Props for GoalPoseOverlay. */
export interface GoalPoseOverlayProps {
	config: GoalPoseConfig;
	/** Called whenever goal-pose mode is toggled so the parent can render a DOM overlay. */
	onActiveChange?: (active: boolean) => void;
}

/**
 * Goal pose overlay placed inside the R3F Canvas.
 *
 * An invisible ground-plane mesh handles `onPointerDown / Move / Up`.
 * The component manages orbit-control availability and keyboard toggling.
 */
export const GoalPoseOverlay: React.FC<GoalPoseOverlayProps> = ({
	config,
	onActiveChange,
}) => {
	const pm = usePluginsManager();
	const { controls, gl } = useThree();

	const shortcutInput: DigitalInput = config.keyboardShortcut ?? {
		type: "keyboard",
		key: "g",
	};

	// Goal-pose mode is toggled by the keyboard shortcut
	const [isActive, setIsActive] = useState(false);

	// Drag state while the user holds the mouse
	const [drag, setDrag] = useState<DragState | null>(null);

	// Last successfully published goal — shown as a persistent marker
	const [confirmed, setConfirmed] = useState<{
		pos: THREE.Vector3;
		yaw: number;
	} | null>(null);

	// Track advertise promise so we only call it once
	const advertisedRef = useRef(false);

	// -----------------------------------------------------------------------
	// Advertise on mount, unadvertise on unmount
	// -----------------------------------------------------------------------
	useEffect(() => {
		if (!config.topic || advertisedRef.current) return;
		advertisedRef.current = true;

		pm.applyFilterAsync(
			`${config.topic.source.id}-advertise`,
			config.topic,
		).catch((err: unknown) => {
			console.warn("[GoalPoseOverlay] advertise failed:", err);
		});

		return () => {
			if (config.topic) {
				pm.doAction(
					`${config.topic.source.id}-unadvertise`,
					config.topic,
				);
			}
		};
		// Re-run only if topic identity changes (source id or topic string)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [config.topic?.source?.id, config.topic?.topic]);

	// -----------------------------------------------------------------------
	// Notify parent whenever active state changes
	// -----------------------------------------------------------------------
	useEffect(() => {
		onActiveChange?.(isActive);
	}, [isActive, onActiveChange]);

	// -----------------------------------------------------------------------
	// Keyboard shortcut — toggle goal-pose mode
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
			if (
				shortcutInput.type === "keyboard" &&
				shortcutInput.key &&
				e.key.toLowerCase() === shortcutInput.key.toLowerCase()
			) {
				setIsActive((prev) => !prev);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [shortcutInput.type, shortcutInput.key]);

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
	// Plane materials (memoised to avoid per-frame allocations)
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
			if (!isActive || !drag) return;
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

			// Publish canonical PoseStamped (THREE convention) with frameId
			// extension the converter reads to populate header.frame_id
			const poseData = {
				position: { x: clickPos.x, y: clickPos.y, z: clickPos.z },
				orientation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
				timestamp: Date.now() / 1000,
				convention: "THREE" as const,
				// frameId is read by the Pose toRos2 converter — not part of
				// the canonical PoseStamped type but safe as an extension prop
				frameId: config.frameId ?? "map",
			};

			if (config.topic) {
				pm.doAction(
					`${config.topic.source.id}-${config.topic.topic}-publish`,
					config.topic,
					poseData,
					"Pose",
				);
				setConfirmed({ pos: clickPos.clone(), yaw });
			}

			// Clear drag; stay in active mode so user can place another goal
			setDrag(null);
		},
		[isActive, drag, config.topic, config.frameId, pm],
	);

	// -----------------------------------------------------------------------
	// Render
	// -----------------------------------------------------------------------
	return (
		<>
			{/*
			 * Large invisible horizontal plane (XZ) for raycasting.
			 * Must stay visible=true so Three.js raycaster can hit it.
			 * Pointer handlers are no-ops when goal mode is inactive.
			 */}
			<mesh
				rotation={[-Math.PI / 2, 0, 0]}
				material={planeMaterial}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
			>
				<planeGeometry args={[10_000, 10_000]} />
			</mesh>

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

			{/* Persistent marker at the last confirmed goal */}
			{confirmed && (
				<GoalPoseMarker
					position={confirmed.pos}
					yaw={confirmed.yaw}
					color={config.markerColor ?? "#ff4400"}
					size={config.markerSize ?? 0.5}
					opacity={0.9}
				/>
			)}
		</>
	);
};
