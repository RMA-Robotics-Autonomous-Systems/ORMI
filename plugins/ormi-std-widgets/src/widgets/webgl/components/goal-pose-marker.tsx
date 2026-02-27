"use client";
/**
 * Goal pose arrow marker rendered inside the R3F Canvas.
 *
 * Displays a sphere at the goal position and an arrow pointing in the
 * heading direction (yaw around the Y axis, THREE.js convention).
 */

import React, { useMemo } from "react";
import * as THREE from "three";

/** Props for GoalPoseMarker. */
export interface GoalPoseMarkerProps {
	/** Goal position in THREE.js world coordinates. */
	position: { x: number; y: number; z: number };
	/**
	 * Heading angle in radians, measured as a right-handed rotation around the
	 * +Y axis.  At yaw = 0 the arrow points along +X.
	 */
	yaw: number;
	/** CSS / hex colour string for the marker. @default "#ff4400" */
	color?: string;
	/** Overall scale multiplier in scene units. @default 0.5 */
	size?: number;
	/** Material opacity (0–1). @default 0.9 */
	opacity?: number;
}

/**
 * Arrow marker rendered in the R3F scene.
 * Sphere + shaft cylinder + cone tip, all pointing along +X when yaw = 0.
 */
export const GoalPoseMarker: React.FC<GoalPoseMarkerProps> = ({
	position,
	yaw,
	color = "#ff4400",
	size = 0.5,
	opacity = 0.9,
}) => {
	const threeColor = useMemo(() => new THREE.Color(color), [color]);

	const sphereRadius = size * 0.28;
	const shaftRadius = size * 0.1;
	const shaftLength = size * 1.4;
	const coneRadius = size * 0.24;
	const coneHeight = size * 0.48;

	// Shaft centre is halfway along its length from the origin (+X direction)
	const shaftCentreX = shaftLength / 2;
	// Cone tip starts where shaft ends
	const coneCentreX = shaftLength + coneHeight / 2;

	return (
		<group
			position={[position.x, position.y + sphereRadius, position.z]}
			rotation={[0, yaw, 0]}
		>
			{/* Base sphere */}
			<mesh>
				<sphereGeometry args={[sphereRadius, 16, 16]} />
				<meshStandardMaterial
					color={threeColor}
					transparent
					opacity={opacity}
				/>
			</mesh>

			{/* Arrow shaft — cylinder along +X (default cylinder axis is +Y, rotate 90° around Z) */}
			<mesh
				position={[shaftCentreX, 0, 0]}
				rotation={[0, 0, -Math.PI / 2]}
			>
				<cylinderGeometry
					args={[shaftRadius, shaftRadius, shaftLength, 8]}
				/>
				<meshStandardMaterial
					color={threeColor}
					transparent
					opacity={opacity}
				/>
			</mesh>

			{/* Arrow cone tip — cone along +X (default cone axis is +Y, rotate 90° so tip points in +X) */}
			<mesh
				position={[coneCentreX, 0, 0]}
				rotation={[0, 0, -Math.PI / 2]}
			>
				<coneGeometry args={[coneRadius, coneHeight, 8]} />
				<meshStandardMaterial
					color={threeColor}
					transparent
					opacity={opacity}
				/>
			</mesh>
		</group>
	);
};
