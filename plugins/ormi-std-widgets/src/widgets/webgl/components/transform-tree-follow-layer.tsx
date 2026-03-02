import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { TransformTreeRenderer } from "./transform-tree-renderer";
import { TransformTreeConfig } from "../types/scene-3d-types";

interface TransformTreeFollowLayerProps {
	controlsRef: React.RefObject<OrbitControlsImpl | null>;
	config: TransformTreeConfig;
	targetFrame?: string;
}

export const TransformTreeFollowLayer: React.FC<
	TransformTreeFollowLayerProps
> = ({ controlsRef, config, targetFrame = "" }) => {
	const FOLLOW_PAN_DURATION_SECONDS = 0.35;

	const [followNodeId, setFollowNodeId] = useState<string | null>(null);
	const trackedNodePosRef = useRef<THREE.Vector3 | null>(null);
	const lastFollowPosRef = useRef<THREE.Vector3 | null>(null);
	const isInteractingRef = useRef(false);
	const interactionStartTargetRef = useRef(new THREE.Vector3());
	const transitionRef = useRef<{
		active: boolean;
		progress: number;
		fromCamera: THREE.Vector3;
		toCamera: THREE.Vector3;
		fromTarget: THREE.Vector3;
		toTarget: THREE.Vector3;
	}>({
		active: false,
		progress: 0,
		fromCamera: new THREE.Vector3(),
		toCamera: new THREE.Vector3(),
		fromTarget: new THREE.Vector3(),
		toTarget: new THREE.Vector3(),
	});

	const stopFollow = useCallback(() => {
		setFollowNodeId(null);
		trackedNodePosRef.current = null;
		lastFollowPosRef.current = null;
		transitionRef.current.active = false;
	}, []);

	const handleNodeClick = useCallback(
		(nodeId: string, worldPos: THREE.Vector3) => {
			setFollowNodeId((currentFollowNodeId) => {
				if (currentFollowNodeId === nodeId) {
					trackedNodePosRef.current = null;
					lastFollowPosRef.current = null;
					transitionRef.current.active = false;
					return null;
				}

				const controls = controlsRef.current;
				if (controls) {
					const deltaToNode = worldPos.clone().sub(controls.target);
					const camera = controls.object as THREE.Camera;

					transitionRef.current.active = true;
					transitionRef.current.progress = 0;
					transitionRef.current.fromCamera.copy(camera.position);
					transitionRef.current.fromTarget.copy(controls.target);
					transitionRef.current.toCamera
						.copy(camera.position)
						.add(deltaToNode);
					transitionRef.current.toTarget
						.copy(controls.target)
						.add(deltaToNode);
				}

				trackedNodePosRef.current = worldPos.clone();
				lastFollowPosRef.current = worldPos.clone();
				return nodeId;
			});
		},
		[controlsRef],
	);

	const handleTrackedNodePositionChange = useCallback(
		(nodeId: string, worldPos: THREE.Vector3) => {
			if (followNodeId !== nodeId) return;
			trackedNodePosRef.current = worldPos.clone();
			if (!lastFollowPosRef.current) {
				lastFollowPosRef.current = worldPos.clone();
			}
		},
		[followNodeId],
	);

	useEffect(() => {
		const controls = controlsRef.current;
		if (!controls) return;

		const handleStart = () => {
			isInteractingRef.current = true;
			interactionStartTargetRef.current.copy(controls.target);
		};

		const handleChange = () => {
			if (!followNodeId || !isInteractingRef.current) return;
			if (
				controls.target.distanceToSquared(
					interactionStartTargetRef.current,
				) > 1e-8
			) {
				stopFollow();
			}
		};

		const handleEnd = () => {
			isInteractingRef.current = false;
			if (!followNodeId || !trackedNodePosRef.current) return;
			lastFollowPosRef.current = trackedNodePosRef.current.clone();
		};

		controls.addEventListener("start", handleStart);
		controls.addEventListener("change", handleChange);
		controls.addEventListener("end", handleEnd);

		return () => {
			controls.removeEventListener("start", handleStart);
			controls.removeEventListener("change", handleChange);
			controls.removeEventListener("end", handleEnd);
		};
	}, [controlsRef, followNodeId, stopFollow]);

	useFrame((_, deltaSeconds) => {
		if (!followNodeId || isInteractingRef.current) return;

		const controls = controlsRef.current;
		if (!controls) return;

		const transition = transitionRef.current;
		if (transition.active) {
			transition.progress +=
				deltaSeconds / Math.max(0.001, FOLLOW_PAN_DURATION_SECONDS);
			const t = Math.min(1, transition.progress);
			const easedT = 1 - Math.pow(1 - t, 3);

			const camera = controls.object as THREE.Camera;
			camera.position.lerpVectors(
				transition.fromCamera,
				transition.toCamera,
				easedT,
			);
			controls.target.lerpVectors(
				transition.fromTarget,
				transition.toTarget,
				easedT,
			);
			controls.update();

			if (t >= 1) {
				transition.active = false;
			}
			return;
		}

		const trackedNodePos = trackedNodePosRef.current;
		if (!trackedNodePos) return;

		if (!lastFollowPosRef.current) {
			lastFollowPosRef.current = trackedNodePos.clone();
			return;
		}

		const delta = trackedNodePos.clone().sub(lastFollowPosRef.current);
		if (delta.lengthSq() <= 1e-12) return;

		const camera = controls.object as THREE.Camera;
		camera.position.add(delta);
		controls.target.add(delta);
		controls.update();

		lastFollowPosRef.current.copy(trackedNodePos);
	});

	return (
		<TransformTreeRenderer
			config={config}
			targetFrame={targetFrame}
			onNodeClick={handleNodeClick}
			trackedNodeId={followNodeId}
			onTrackedNodePositionChange={handleTrackedNodePositionChange}
		/>
	);
};
