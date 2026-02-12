import { Transform, TransformTree, Vector3, Quaternion } from "../types";

/**
 * Get a transform tree node by id within a tree.
 * @param tree - Root tree.
 * @param id - Frame id to search for.
 * @returns Matching node or null.
 */
export function getTransformTreeFromTreeId(
	tree: TransformTree,
	id: string,
): TransformTree | null {
	if (tree.id === id) {
		return tree;
	}

	let result: TransformTree | null = null;
	tree.children.forEach((child) => {
		if (!result) {
			const found = getTransformTreeFromTreeId(child, id);
			if (found) {
				result = found;
			}
		}
	});

	return result;
}

/**
 * Get a transform tree node by id across multiple tree roots.
 * @param treeMap - Map of root trees.
 * @param id - Frame id to search for.
 * @returns Matching node or null.
 */
export function getTransformTreeFromTreeIdInMaps(
	treeMap: Map<string, TransformTree>,
	id: string,
): TransformTree | null {
	let result: TransformTree | null = null;

	treeMap.forEach((tree, key) => {
		if (!result) {
			// Only continue searching if we haven't found a result yet
			const found = getTransformTreeFromTreeId(tree, id);
			if (found) {
				result = found;
			}
		}
	});

	return result;
}

/**
 * Find a transform chain between two frames.
 * @param treeMap - Map of transform trees.
 * @param sourceFrameId - Source frame id.
 * @param targetFrameId - Target frame id.
 * @returns Ordered transforms or null if no path exists.
 */
export function findTransformChain(
	treeMap: Map<string, TransformTree>,
	sourceFrameId: string,
	targetFrameId: string,
): Transform[] | null {
	// If source and target are the same, return identity transform
	if (sourceFrameId === targetFrameId) {
		return [];
	}

	// Find both nodes in the tree
	const sourceNode = getTransformTreeFromTreeIdInMaps(treeMap, sourceFrameId);
	const targetNode = getTransformTreeFromTreeIdInMaps(treeMap, targetFrameId);

	if (!sourceNode || !targetNode) {
		return null; // One or both frames not found
	}

	const sourceConvention =
		sourceNode.convention ?? sourceNode.transform.convention ?? "THREE";
	const targetConvention =
		targetNode.convention ?? targetNode.transform.convention ?? "THREE";
	if (sourceConvention !== targetConvention) {
		return null;
	}

	// Build path from source to root
	const sourceToRoot: TransformTree[] = [];
	let current: TransformTree | null = sourceNode;

	while (current) {
		sourceToRoot.push(current);
		if (current.parentId === "") {
			break; // Reached root
		}
		current = getTransformTreeFromTreeIdInMaps(treeMap, current.parentId);
	}

	// Build path from target to root
	const targetToRoot: TransformTree[] = [];
	current = targetNode;

	while (current) {
		targetToRoot.push(current);
		if (current.parentId === "") {
			break; // Reached root
		}
		current = getTransformTreeFromTreeIdInMaps(treeMap, current.parentId);
	}

	// Check if both frames are in the same tree (have the same root)
	const sourceRoot = sourceToRoot[sourceToRoot.length - 1];
	const targetRoot = targetToRoot[targetToRoot.length - 1];

	if (sourceRoot && targetRoot && sourceRoot.id !== targetRoot.id) {
		// Frames are in different trees - no transform chain possible
		return null;
	}

	// Find common ancestor
	let commonAncestorIndex = -1;
	for (let i = sourceToRoot.length - 1; i >= 0; i--) {
		const sourceNode = sourceToRoot[i];
		if (!sourceNode) continue;

		for (let j = targetToRoot.length - 1; j >= 0; j--) {
			const targetNode = targetToRoot[j];
			if (!targetNode) continue;

			if (sourceNode.id === targetNode.id) {
				commonAncestorIndex = i;
				break;
			}
		}
		if (commonAncestorIndex !== -1) break;
	}

	if (commonAncestorIndex === -1) {
		return null; // No common ancestor, disconnected trees
	}

	// Build transform chain: source -> common ancestor -> target
	const transforms: Transform[] = [];

	// In ROS TF, the transform stored at a node describes:
	// "The position and orientation of THIS frame (child) expressed in the PARENT frame"
	//
	// This means the stored transform IS the child-to-parent transform.
	// To transform a point from child to parent: P_parent = R * P_child + T
	//
	// So when going UP the tree (child -> parent), we use the transform DIRECTLY.
	// When going DOWN the tree (parent -> child), we need to INVERT it.

	// Transforms from source up to common ancestor (use directly - child to parent)
	for (let i = 0; i < commonAncestorIndex; i++) {
		const node = sourceToRoot[i];
		if (node) {
			// The node's transform is child-to-parent, which is what we need
			transforms.push(node.transform);
		}
	}

	// Transforms from common ancestor down to target (inverted - parent to child)
	const commonNode = sourceToRoot[commonAncestorIndex];
	if (!commonNode) {
		return null;
	}

	const commonId = commonNode.id;
	const targetAncestorIndex = targetToRoot.findIndex(
		(node) => node.id === commonId,
	);

	for (let i = targetAncestorIndex - 1; i >= 0; i--) {
		const node = targetToRoot[i];
		if (node) {
			// Going down the tree: need to invert (parent to child)
			transforms.push(invertTransform(node.transform));
		}
	}

	return transforms;
}

/**
 * Apply a single transform to a 3D point.
 * @param point - Input point.
 * @param transform - Transform to apply.
 * @returns Transformed point.
 */
export function applyTransform(point: Vector3, transform: Transform): Vector3 {
	// First apply rotation using quaternion
	const rotated = rotateVectorByQuaternion(point, transform.rotation);

	// Then apply translation
	return {
		x: rotated.x + transform.position.x,
		y: rotated.y + transform.position.y,
		z: rotated.z + transform.position.z,
	};
}

/**
 * Apply a chain of transforms to a 3D point.
 * @param point - Input point.
 * @param transforms - Ordered transforms.
 * @returns Transformed point.
 */
export function applyTransformChain(
	point: Vector3,
	transforms: Transform[],
): Vector3 {
	if (transforms.length > 1) {
		const baseConvention = transforms[0]?.convention ?? "THREE";
		const hasMismatch = transforms.some(
			(tf) => (tf.convention ?? "THREE") !== baseConvention,
		);
		if (hasMismatch) {
			return { ...point };
		}
	}

	let result = { ...point };

	for (const transform of transforms) {
		result = applyTransform(result, transform);
	}

	return result;
}

/**
 * Rotate a vector by a quaternion.
 * @param v - Vector to rotate.
 * @param q - Rotation quaternion.
 * @returns Rotated vector.
 */
export function rotateVectorByQuaternion(v: Vector3, q: Quaternion): Vector3 {
	// Convert to quaternion multiplication: q * v * q^-1
	const qx = q.x,
		qy = q.y,
		qz = q.z,
		qw = q.w;
	const vx = v.x,
		vy = v.y,
		vz = v.z;

	// q * v
	const ix = qw * vx + qy * vz - qz * vy;
	const iy = qw * vy + qz * vx - qx * vz;
	const iz = qw * vz + qx * vy - qy * vx;
	const iw = -qx * vx - qy * vy - qz * vz;

	// (q * v) * q^-1
	return {
		x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
		y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
		z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
	};
}

/**
 * Invert a transform.
 * @param transform - Transform to invert.
 * @returns Inverted transform.
 */
export function invertTransform(transform: Transform): Transform {
	// Invert quaternion (conjugate for unit quaternions)
	const invRotation: Quaternion = {
		x: -transform.rotation.x,
		y: -transform.rotation.y,
		z: -transform.rotation.z,
		w: transform.rotation.w,
	};

	// Rotate negative translation by inverted rotation
	const negTranslation = {
		x: -transform.position.x,
		y: -transform.position.y,
		z: -transform.position.z,
	};

	const invTranslation = rotateVectorByQuaternion(
		negTranslation,
		invRotation,
	);

	return {
		position: {
			x: invTranslation.x,
			y: invTranslation.y,
			z: invTranslation.z,
			w: 0,
		},
		rotation: invRotation,
		convention: transform.convention,
	};
}

/** GPS coordinates (latitude, longitude, optional altitude). */
export interface GPSCoords {
	latitude: number;
	longitude: number;
	altitude?: number;
}

/**
 * Convert local ENU coordinates to GPS coordinates.
 * @param localPoint - Point in local ENU frame (meters).
 * @param originGPS - GPS coordinates of the local frame origin.
 * @returns GPS coordinates.
 */
export function localToGPS(
	localPoint: Vector3,
	originGPS: GPSCoords,
): GPSCoords {
	// Earth's radius in meters
	const EARTH_RADIUS = 6371000;

	// Convert local meters to degrees
	// East/West: x direction
	const deltaLongitude =
		((localPoint.x / EARTH_RADIUS) * (180 / Math.PI)) /
		Math.cos((originGPS.latitude * Math.PI) / 180);

	// North/South: y direction
	const deltaLatitude = (localPoint.y / EARTH_RADIUS) * (180 / Math.PI);

	return {
		latitude: originGPS.latitude + deltaLatitude,
		longitude: originGPS.longitude + deltaLongitude,
		altitude: (originGPS.altitude || 0) + localPoint.z,
	};
}

/**
 * Convert GPS coordinates to local ENU coordinates.
 * @param gps - GPS coordinates to convert.
 * @param originGPS - GPS origin.
 * @returns Point in local ENU frame (meters).
 */
export function gpsToLocal(gps: GPSCoords, originGPS: GPSCoords): Vector3 {
	// Earth's radius in meters
	const EARTH_RADIUS = 6371000;

	const latDelta = gps.latitude - originGPS.latitude;
	const lonDelta = gps.longitude - originGPS.longitude;

	// Convert degrees to meters
	// North/South: y direction
	const y = latDelta * (Math.PI / 180) * EARTH_RADIUS;

	// East/West: x direction (account for latitude)
	const x =
		lonDelta *
		(Math.PI / 180) *
		EARTH_RADIUS *
		Math.cos((originGPS.latitude * Math.PI) / 180);

	// Up: z direction
	const z = (gps.altitude || 0) - (originGPS.altitude || 0);

	return { x, y, z };
}
