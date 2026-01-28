/**
 * Coordinate System Conventions
 *
 * This module provides utilities for converting between different 3D coordinate systems
 * used across various robotics and visualization frameworks.
 *
 * Supported conventions:
 * - ROS (REP-103): X forward, Y left, Z up (right-handed)
 * - THREE: X right, Y up, Z towards viewer (right-handed)
 * - ENU: X east, Y north, Z up (right-handed)
 * - NED: X north, Y east, Z down (right-handed)
 * - NWU: X north, Y west, Z up (right-handed)
 */

import { Vector3, Quaternion, CoordinateConvention } from "../types";

// Re-export the type for convenience
export type { CoordinateConvention } from "../types";

/**
 * Detailed description of each coordinate convention
 */
export const COORDINATE_CONVENTION_INFO: Record<
	CoordinateConvention,
	{
		name: string;
		description: string;
		axes: { x: string; y: string; z: string };
		handedness: "right" | "left";
	}
> = {
	ROS: {
		name: "ROS (REP-103)",
		description: "Robot Operating System standard: X forward, Y left, Z up",
		axes: { x: "Forward", y: "Left", z: "Up" },
		handedness: "right",
	},
	THREE: {
		name: "Three.js",
		description: "Three.js/WebGL standard: X right, Y up, Z towards viewer",
		axes: { x: "Right", y: "Up", z: "Out (towards viewer)" },
		handedness: "right",
	},
	ENU: {
		name: "ENU (East-North-Up)",
		description: "Geographic/aviation standard: X east, Y north, Z up",
		axes: { x: "East", y: "North", z: "Up" },
		handedness: "right",
	},
	NED: {
		name: "NED (North-East-Down)",
		description: "Aviation/aerospace standard: X north, Y east, Z down",
		axes: { x: "North", y: "East", z: "Down" },
		handedness: "right",
	},
	NWU: {
		name: "NWU (North-West-Up)",
		description: "Alternative aviation convention: X north, Y west, Z up",
		axes: { x: "North", y: "West", z: "Up" },
		handedness: "right",
	},
	CUSTOM: {
		name: "Custom",
		description: "User-defined coordinate system",
		axes: { x: "Custom X", y: "Custom Y", z: "Custom Z" },
		handedness: "right",
	},
};

/**
 * Transformation matrix type (3x3 rotation/reflection matrix)
 * Applied as: [newX, newY, newZ] = matrix * [x, y, z]
 */
type TransformMatrix = [
	[number, number, number],
	[number, number, number],
	[number, number, number],
];

/**
 * Conversion matrices from each convention to a canonical form (we use ROS as canonical)
 * To convert from A to B: first convert A to canonical, then canonical to B
 */
const TO_CANONICAL: Record<CoordinateConvention, TransformMatrix> = {
	// ROS is our canonical form (identity)
	// ROS: X forward, Y left, Z up
	ROS: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],

	// THREE: X right, Y up, Z out (towards viewer)
	// THREE to ROS:
	//   ROS_X (forward) = -THREE_Z (into screen)
	//   ROS_Y (left) = -THREE_X (left)
	//   ROS_Z (up) = THREE_Y (up)
	THREE: [
		[0, 0, -1], // ROS_X = -THREE_Z
		[-1, 0, 0], // ROS_Y = -THREE_X
		[0, 1, 0], // ROS_Z = THREE_Y
	],

	// ENU: X east, Y north, Z up
	// ENU to ROS:
	//   ROS_X (forward) = ENU_Y (north) - assuming forward = north
	//   ROS_Y (left) = -ENU_X (west = -east)
	//   ROS_Z (up) = ENU_Z (up)
	ENU: [
		[0, 1, 0], // ROS_X = ENU_Y (north)
		[-1, 0, 0], // ROS_Y = -ENU_X (west)
		[0, 0, 1], // ROS_Z = ENU_Z (up)
	],

	// NED: X north, Y east, Z down
	// NED to ROS:
	//   ROS_X (forward) = NED_X (north)
	//   ROS_Y (left) = -NED_Y (west = -east)
	//   ROS_Z (up) = -NED_Z (up = -down)
	NED: [
		[1, 0, 0], // ROS_X = NED_X (north)
		[0, -1, 0], // ROS_Y = -NED_Y (west)
		[0, 0, -1], // ROS_Z = -NED_Z (up)
	],

	// NWU: X north, Y west, Z up
	// NWU to ROS:
	//   ROS_X (forward) = NWU_X (north)
	//   ROS_Y (left) = NWU_Y (west)
	//   ROS_Z (up) = NWU_Z (up)
	NWU: [
		[1, 0, 0], // ROS_X = NWU_X
		[0, 1, 0], // ROS_Y = NWU_Y
		[0, 0, 1], // ROS_Z = NWU_Z
	],

	// Custom - identity by default, should be configured per-use
	CUSTOM: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],
};

/**
 * Conversion matrices from canonical (ROS) to each convention
 * These are the inverse of TO_CANONICAL matrices
 */
const FROM_CANONICAL: Record<CoordinateConvention, TransformMatrix> = {
	// ROS is canonical (identity)
	ROS: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],

	// ROS to THREE:
	//   THREE_X (right) = -ROS_Y (right = -left)
	//   THREE_Y (up) = ROS_Z (up)
	//   THREE_Z (out) = -ROS_X (out = -forward)
	THREE: [
		[0, -1, 0], // THREE_X = -ROS_Y
		[0, 0, 1], // THREE_Y = ROS_Z
		[-1, 0, 0], // THREE_Z = -ROS_X
	],

	// ROS to ENU:
	//   ENU_X (east) = -ROS_Y (east = -left)
	//   ENU_Y (north) = ROS_X (north = forward)
	//   ENU_Z (up) = ROS_Z (up)
	ENU: [
		[0, -1, 0], // ENU_X = -ROS_Y
		[1, 0, 0], // ENU_Y = ROS_X
		[0, 0, 1], // ENU_Z = ROS_Z
	],

	// ROS to NED:
	//   NED_X (north) = ROS_X (forward)
	//   NED_Y (east) = -ROS_Y (east = -left)
	//   NED_Z (down) = -ROS_Z (down = -up)
	NED: [
		[1, 0, 0], // NED_X = ROS_X
		[0, -1, 0], // NED_Y = -ROS_Y
		[0, 0, -1], // NED_Z = -ROS_Z
	],

	// ROS to NWU:
	//   NWU_X (north) = ROS_X (forward)
	//   NWU_Y (west) = ROS_Y (left)
	//   NWU_Z (up) = ROS_Z (up)
	NWU: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],

	// Custom - identity by default
	CUSTOM: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],
};

/**
 * Apply a transformation matrix to a vector
 */
function applyMatrix(v: Vector3, m: TransformMatrix): Vector3 {
	return {
		x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
		y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
		z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
	};
}

/**
 * Multiply two transformation matrices
 */
function multiplyMatrices(
	a: TransformMatrix,
	b: TransformMatrix,
): TransformMatrix {
	return [
		[
			a[0][0] * b[0][0] + a[0][1] * b[1][0] + a[0][2] * b[2][0],
			a[0][0] * b[0][1] + a[0][1] * b[1][1] + a[0][2] * b[2][1],
			a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2] * b[2][2],
		],
		[
			a[1][0] * b[0][0] + a[1][1] * b[1][0] + a[1][2] * b[2][0],
			a[1][0] * b[0][1] + a[1][1] * b[1][1] + a[1][2] * b[2][1],
			a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2] * b[2][2],
		],
		[
			a[2][0] * b[0][0] + a[2][1] * b[1][0] + a[2][2] * b[2][0],
			a[2][0] * b[0][1] + a[2][1] * b[1][1] + a[2][2] * b[2][1],
			a[2][0] * b[0][2] + a[2][1] * b[1][2] + a[2][2] * b[2][2],
		],
	];
}

/**
 * Get combined transformation matrix from one convention to another
 */
function getConversionMatrix(
	from: CoordinateConvention,
	to: CoordinateConvention,
): TransformMatrix {
	if (from === to) {
		return [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		];
	}

	// Convert: from -> canonical -> to
	// Combined = FROM_CANONICAL[to] * TO_CANONICAL[from]
	return multiplyMatrices(FROM_CANONICAL[to], TO_CANONICAL[from]);
}

// Cache for conversion matrices
const conversionMatrixCache = new Map<string, TransformMatrix>();

/**
 * Get cached conversion matrix
 */
function getCachedConversionMatrix(
	from: CoordinateConvention,
	to: CoordinateConvention,
): TransformMatrix {
	const key = `${from}->${to}`;

	if (!conversionMatrixCache.has(key)) {
		conversionMatrixCache.set(key, getConversionMatrix(from, to));
	}

	return conversionMatrixCache.get(key)!;
}

/**
 * Convert a position vector from one coordinate convention to another
 *
 * @param position - The position to convert
 * @param from - Source coordinate convention
 * @param to - Target coordinate convention
 * @returns Converted position in target convention
 *
 * @example
 * // Convert ROS coordinates to Three.js
 * const threePos = convertPosition({ x: 1, y: 0, z: 0 }, 'ROS', 'THREE');
 * // Result: { x: 0, y: 0, z: -1 } (forward in ROS = into screen in Three.js)
 */
export function convertPosition(
	position: Vector3,
	from: CoordinateConvention,
	to: CoordinateConvention,
): Vector3 {
	if (from === to) {
		return { ...position };
	}

	const matrix = getCachedConversionMatrix(from, to);
	return applyMatrix(position, matrix);
}

/**
 * Convert multiple positions efficiently
 *
 * @param positions - Array of positions to convert
 * @param from - Source coordinate convention
 * @param to - Target coordinate convention
 * @returns Array of converted positions
 */
export function convertPositions(
	positions: Vector3[],
	from: CoordinateConvention,
	to: CoordinateConvention,
): Vector3[] {
	if (from === to) {
		return positions.map((p) => ({ ...p }));
	}

	const matrix = getCachedConversionMatrix(from, to);
	return positions.map((p) => applyMatrix(p, matrix));
}

/**
 * Convert a quaternion rotation from one coordinate convention to another
 *
 * This handles the fact that rotations need special treatment when
 * converting between coordinate systems with different axis orientations.
 *
 * @param quaternion - The quaternion to convert
 * @param from - Source coordinate convention
 * @param to - Target coordinate convention
 * @returns Converted quaternion
 */
export function convertQuaternion(
	quaternion: Quaternion,
	from: CoordinateConvention,
	to: CoordinateConvention,
): Quaternion {
	if (from === to) {
		return { ...quaternion };
	}

	const matrix = getCachedConversionMatrix(from, to);

	// Convert quaternion through rotation matrix transformation
	// q' = R * q * R^-1 (for orthogonal R, R^-1 = R^T)
	// For pure rotation/reflection matrices (no scaling), we can transform
	// the quaternion by transforming the axis of rotation

	// Extract axis-angle from quaternion
	const angle = 2 * Math.acos(Math.max(-1, Math.min(1, quaternion.w)));
	const sinHalfAngle = Math.sin(angle / 2);

	if (Math.abs(sinHalfAngle) < 1e-10) {
		// No rotation, return identity
		return { x: 0, y: 0, z: 0, w: 1 };
	}

	// Get rotation axis
	const axis: Vector3 = {
		x: quaternion.x / sinHalfAngle,
		y: quaternion.y / sinHalfAngle,
		z: quaternion.z / sinHalfAngle,
	};

	// Transform the axis
	const newAxis = applyMatrix(axis, matrix);

	// Handle potential sign flip from reflection matrices
	// Compute determinant to check if matrix includes reflection
	const det =
		matrix[0][0] *
			(matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) -
		matrix[0][1] *
			(matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
		matrix[0][2] *
			(matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]);

	// If determinant is negative, we have a reflection
	const effectiveAngle = det < 0 ? -angle : angle;

	// Reconstruct quaternion
	const newSinHalfAngle = Math.sin(effectiveAngle / 2);
	const newCosHalfAngle = Math.cos(effectiveAngle / 2);

	// Normalize the axis
	const axisLength = Math.sqrt(
		newAxis.x * newAxis.x + newAxis.y * newAxis.y + newAxis.z * newAxis.z,
	);

	if (axisLength < 1e-10) {
		return { x: 0, y: 0, z: 0, w: 1 };
	}

	return {
		x: (newAxis.x / axisLength) * newSinHalfAngle,
		y: (newAxis.y / axisLength) * newSinHalfAngle,
		z: (newAxis.z / axisLength) * newSinHalfAngle,
		w: newCosHalfAngle,
	};
}

/**
 * Quick conversion functions for common use cases
 */

/** Convert position from ROS to Three.js */
export function rosToThree(position: Vector3): Vector3 {
	return convertPosition(position, "ROS", "THREE");
}

/** Convert position from Three.js to ROS */
export function threeToRos(position: Vector3): Vector3 {
	return convertPosition(position, "THREE", "ROS");
}

/** Convert position from ENU to ROS */
export function enuToRos(position: Vector3): Vector3 {
	return convertPosition(position, "ENU", "ROS");
}

/** Convert position from ROS to ENU */
export function rosToEnu(position: Vector3): Vector3 {
	return convertPosition(position, "ROS", "ENU");
}

/** Convert position from NED to ROS */
export function nedToRos(position: Vector3): Vector3 {
	return convertPosition(position, "NED", "ROS");
}

/** Convert position from ROS to NED */
export function rosToNed(position: Vector3): Vector3 {
	return convertPosition(position, "ROS", "NED");
}

/** Convert position from ENU to Three.js */
export function enuToThree(position: Vector3): Vector3 {
	return convertPosition(position, "ENU", "THREE");
}

/** Convert position from NED to Three.js */
export function nedToThree(position: Vector3): Vector3 {
	return convertPosition(position, "NED", "THREE");
}

/**
 * Quaternion to Euler angles conversion with frame convention support
 *
 * @param quaternion - Input quaternion
 * @param convention - The coordinate convention the quaternion is expressed in
 * @returns Euler angles (roll, pitch, yaw) in radians
 */
export function quaternionToEuler(
	quaternion: Quaternion,
	convention: CoordinateConvention = "ROS",
): { roll: number; pitch: number; yaw: number } {
	const { x, y, z, w } = quaternion;

	// ZYX (yaw-pitch-roll) Euler angles extraction
	// Roll (x-axis rotation)
	const sinr_cosp = 2 * (w * x + y * z);
	const cosr_cosp = 1 - 2 * (x * x + y * y);
	const roll = Math.atan2(sinr_cosp, cosr_cosp);

	// Pitch (y-axis rotation)
	const sinp = 2 * (w * y - z * x);
	const pitch =
		Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

	// Yaw (z-axis rotation)
	const siny_cosp = 2 * (w * z + x * y);
	const cosy_cosp = 1 - 2 * (y * y + z * z);
	const yaw = Math.atan2(siny_cosp, cosy_cosp);

	return { roll, pitch, yaw };
}

/**
 * Euler angles to quaternion conversion
 *
 * @param roll - Roll angle in radians
 * @param pitch - Pitch angle in radians
 * @param yaw - Yaw angle in radians
 * @returns Quaternion
 */
export function eulerToQuaternion(
	roll: number,
	pitch: number,
	yaw: number,
): Quaternion {
	// ZYX convention (yaw-pitch-roll)
	const cy = Math.cos(yaw * 0.5);
	const sy = Math.sin(yaw * 0.5);
	const cp = Math.cos(pitch * 0.5);
	const sp = Math.sin(pitch * 0.5);
	const cr = Math.cos(roll * 0.5);
	const sr = Math.sin(roll * 0.5);

	return {
		w: cy * cp * cr + sy * sp * sr,
		x: cy * cp * sr - sy * sp * cr,
		y: cy * sp * cr + sy * cp * sr,
		z: sy * cp * cr - cy * sp * sr,
	};
}

/**
 * Extract heading (yaw) from quaternion with frame convention adjustment
 *
 * Converts to aviation-standard heading where 0° = North
 *
 * @param quaternion - Input quaternion orientation
 * @param sourceConvention - Coordinate convention of the quaternion
 * @param headingAxis - Which Euler angle to use as heading ('X', 'Y', 'Z')
 * @returns Heading in radians (0 = North, positive = clockwise)
 */
export function quaternionToHeading(
	quaternion: Quaternion,
	sourceConvention: CoordinateConvention,
	headingAxis: "X" | "Y" | "Z" = "Z",
): number {
	const { roll, pitch, yaw } = quaternionToEuler(quaternion);

	// Select the appropriate angle based on heading axis
	let heading = 0;
	switch (headingAxis) {
		case "X":
			heading = roll;
			break;
		case "Y":
			heading = pitch;
			break;
		case "Z":
			heading = yaw;
			break;
	}

	// Convert based on source convention to aviation standard (0° = North)
	switch (sourceConvention) {
		case "ENU":
			// ENU: 0° = East, need to rotate so 0° = North
			heading = -(heading - Math.PI / 2);
			break;
		case "NED":
			// NED: 0° = North (already correct)
			break;
		case "NWU":
			// NWU: 0° = North but West is positive (mirror)
			heading = -heading;
			break;
		case "ROS":
			// ROS: 0° = Forward, convert to 0° = North
			// Assuming forward = north
			break;
		case "THREE":
		case "CUSTOM":
			// May need custom handling
			break;
	}

	return heading;
}

/**
 * Create a coordinate converter function for a specific source->target conversion
 * Useful for performance-critical loops where you want to avoid repeated string lookups
 *
 * @param from - Source coordinate convention
 * @param to - Target coordinate convention
 * @returns A function that converts positions
 */
export function createPositionConverter(
	from: CoordinateConvention,
	to: CoordinateConvention,
): (position: Vector3) => Vector3 {
	if (from === to) {
		return (position: Vector3) => ({ ...position });
	}

	const matrix = getCachedConversionMatrix(from, to);
	return (position: Vector3) => applyMatrix(position, matrix);
}

/**
 * Check if a coordinate convention is valid
 */
export function isValidConvention(
	convention: string,
): convention is CoordinateConvention {
	return convention in COORDINATE_CONVENTION_INFO;
}

/**
 * Get all available coordinate conventions
 */
export function getAvailableConventions(): CoordinateConvention[] {
	return Object.keys(COORDINATE_CONVENTION_INFO) as CoordinateConvention[];
}
