import {
	CoordinateConvention,
	Transform,
	TransformTable,
	Vector3,
	Quaternion,
} from "../types";
import { frameRawName } from "./frame-namespace";

/** Internal flattened node used for chain resolution. */
interface ChainNode {
	id: string;
	parentId: string;
	transform: Transform;
	convention?: CoordinateConvention;
	rawFrameId?: string;
}

const IDENTITY_TRANSFORM: Transform = {
	position: { x: 0, y: 0, z: 0, w: 1 },
	rotation: { x: 0, y: 0, z: 0, w: 1 },
	convention: "THREE",
};

/**
 * Build an id→node index over the table, augmented with identity virtual roots for any parent
 * that is referenced but never observed as a child (e.g. a fixed `map`), plus a raw-name index
 * for resolving legacy bare references.
 */
function buildChainIndex(table: TransformTable): {
	byId: Map<string, ChainNode>;
	byRaw: Map<string, ChainNode[]>;
} {
	const byId = new Map<string, ChainNode>();
	for (const edge of table.values()) {
		byId.set(edge.frameId, {
			id: edge.frameId,
			parentId: edge.parentId,
			transform: edge.transform,
			convention: edge.transform.convention,
			rawFrameId: edge.rawFrameId,
		});
	}

	const virtuals = new Map<string, ChainNode>();
	byId.forEach((node) => {
		const pid = node.parentId;
		if (pid && pid !== "" && !byId.has(pid) && !virtuals.has(pid)) {
			virtuals.set(pid, {
				id: pid,
				parentId: "",
				transform: IDENTITY_TRANSFORM,
				convention: node.convention ?? "THREE",
				rawFrameId: frameRawName(pid),
			});
		}
	});
	virtuals.forEach((node, id) => byId.set(id, node));

	const byRaw = new Map<string, ChainNode[]>();
	byId.forEach((node) => {
		const raw = node.rawFrameId ?? node.id;
		const list = byRaw.get(raw);
		if (list) list.push(node);
		else byRaw.set(raw, [node]);
	});

	return { byId, byRaw };
}

/**
 * Resolve a (possibly legacy bare) frame reference: prefer an exact key, else a uniquely
 * matching raw frame name. Ambiguous bare names resolve to null — qualify them by source.
 */
function resolveChainNode(
	index: { byId: Map<string, ChainNode>; byRaw: Map<string, ChainNode[]> },
	ref: string,
): ChainNode | null {
	const exact = index.byId.get(ref);
	if (exact) return exact;
	const raw = index.byRaw.get(ref);
	return raw && raw.length === 1 ? raw[0]! : null;
}

/**
 * Find a transform chain between two frames over the transform table.
 * @param table - The transform table.
 * @param sourceFrameId - Source frame id (exact namespaced key or legacy bare name).
 * @param targetFrameId - Target frame id (exact namespaced key or legacy bare name).
 * @returns Ordered transforms (source → target), `[]` for identical frames, or null if no path.
 */
export function findTransformChain(
	table: TransformTable,
	sourceFrameId: string,
	targetFrameId: string,
): Transform[] | null {
	if (sourceFrameId === targetFrameId) {
		return [];
	}

	const index = buildChainIndex(table);

	const sourceNode = resolveChainNode(index, sourceFrameId);
	const targetNode = resolveChainNode(index, targetFrameId);

	if (!sourceNode || !targetNode) {
		return null; // one or both frames not found / ambiguous
	}

	const sourceConvention = sourceNode.convention ?? "THREE";
	const targetConvention = targetNode.convention ?? "THREE";
	if (sourceConvention !== targetConvention) {
		return null;
	}

	// Path from source up to its root.
	const sourceToRoot: ChainNode[] = [];
	let current: ChainNode | null = sourceNode;
	while (current) {
		sourceToRoot.push(current);
		if (current.parentId === "") break;
		current = index.byId.get(current.parentId) ?? null;
	}

	// Path from target up to its root.
	const targetToRoot: ChainNode[] = [];
	current = targetNode;
	while (current) {
		targetToRoot.push(current);
		if (current.parentId === "") break;
		current = index.byId.get(current.parentId) ?? null;
	}

	// Different roots → disconnected.
	const sourceRoot = sourceToRoot[sourceToRoot.length - 1];
	const targetRoot = targetToRoot[targetToRoot.length - 1];
	if (sourceRoot && targetRoot && sourceRoot.id !== targetRoot.id) {
		return null;
	}

	// Common ancestor.
	let commonAncestorIndex = -1;
	for (let i = sourceToRoot.length - 1; i >= 0; i--) {
		const s = sourceToRoot[i];
		if (!s) continue;
		for (let j = targetToRoot.length - 1; j >= 0; j--) {
			const t = targetToRoot[j];
			if (t && s.id === t.id) {
				commonAncestorIndex = i;
				break;
			}
		}
		if (commonAncestorIndex !== -1) break;
	}
	if (commonAncestorIndex === -1) {
		return null; // no common ancestor, disconnected
	}

	const transforms: Transform[] = [];

	// Source → common ancestor: child-to-parent transforms, used directly.
	for (let i = 0; i < commonAncestorIndex; i++) {
		const node = sourceToRoot[i];
		if (node) transforms.push(node.transform);
	}

	// Common ancestor → target: inverted (parent-to-child).
	const commonNode = sourceToRoot[commonAncestorIndex];
	if (!commonNode) return null;
	const commonId = commonNode.id;
	const targetAncestorIndex = targetToRoot.findIndex(
		(n) => n.id === commonId,
	);
	for (let i = targetAncestorIndex - 1; i >= 0; i--) {
		const node = targetToRoot[i];
		if (node) transforms.push(invertTransform(node.transform));
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
 * Multiply two quaternions (`a * b`), matching `THREE.Quaternion.multiplyQuaternions`.
 * @param a - Left quaternion.
 * @param b - Right quaternion.
 * @returns The product `a * b`.
 */
export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
	return {
		x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
		y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
		z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
		w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
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
