/**
 * joint-controller-utils.ts
 *
 * Pure utility functions for the JointControllerLayer:
 *  - TF world-matrix arithmetic
 *  - Joint-axis extraction
 *  - Joint-name → TF-frame resolution
 *  - JointState message parsing
 *  - Transform-tree relation helpers
 */

import * as THREE from "three";
import {
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import {
	TransformTree,
	CoordinateConvention,
	JointState,
} from "@workspace/ormi-core/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FrameData {
	worldPos: THREE.Vector3;
	/**
	 * World-space matrix of THIS frame (already in THREE convention).
	 * The local Y column gives the joint rotation axis in world space.
	 * The datasource is responsible for orienting TF frames so that
	 * local Y = rotation axis (this is the default after ROS→THREE conversion
	 * for standard URDF `<axis xyz="0 0 1"/>` joints).
	 */
	worldMatrix: THREE.Matrix4;
}

/** Re-export for convenience inside this module. */
export type { JointState };

// ─────────────────────────────────────────────────────────────────────────────
// TF / world-matrix helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Compute the world matrix for a TF node given its parent's world matrix. */
export const getWorldMatrix = (
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

/** Recursively collect per-frame world position and world matrix. */
export const collectFrameData = (
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
 * Extract the joint rotation axis in THREE world space from the TF frame's local Y column.
 *
 * **Datasource contract**: the datasource must orient every joint TF frame so
 * that its local Y axis (after ROS→THREE conversion) equals the joint's
 * rotation axis in world space.  Standard URDF `<axis xyz="0 0 1"/>` joints
 * satisfy this automatically; non-standard axes require the datasource to
 * pre-rotate the frame accordingly.
 *
 * Falls back to world Y `(0,1,0)` only as a null-safety guard for
 * degenerate/uninitialised matrices — not as a default axis assumption.
 */
export const getJointAxis = (data: FrameData): THREE.Vector3 => {
	const yAxis = new THREE.Vector3();
	data.worldMatrix.extractBasis(
		new THREE.Vector3(),
		yAxis,
		new THREE.Vector3(),
	);
	if (
		!Number.isFinite(yAxis.x) ||
		!Number.isFinite(yAxis.y) ||
		!Number.isFinite(yAxis.z) ||
		yAxis.lengthSq() < 1e-12
	) {
		return new THREE.Vector3(0, 1, 0);
	}
	return yAxis.normalize();
};

// ─────────────────────────────────────────────────────────────────────────────
// Joint-name → TF-frame resolution
// ─────────────────────────────────────────────────────────────────────────────

export const normalizeFrameName = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/^\/+/, "")
		.split("/")
		.filter(Boolean)
		.pop() ?? "";

export const normalizeJointName = (value: string): string =>
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

/**
 * Resolve the best TF frame for a given joint name.
 * Strategy: manual map → exact match → scored fuzzy match (threshold 40).
 */
export const resolveJointFrame = (
	frameData: Map<string, FrameData>,
	jointName: string,
	manualMap: Map<string, string>,
): string | null => {
	const normalizedJoint = normalizeJointName(jointName);
	if (!normalizedJoint) return null;

	const manualFrame = manualMap.get(normalizedJoint);
	if (manualFrame) {
		if (frameData.has(manualFrame)) return manualFrame;
		const normalizedManual = normalizeFrameName(manualFrame);
		const match = [...frameData.keys()].find(
			(id) => normalizeFrameName(id) === normalizedManual,
		);
		if (match) return match;
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

// ─────────────────────────────────────────────────────────────────────────────
// JointState message parsing
// ─────────────────────────────────────────────────────────────────────────────

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

export const extractJointStateMessage = (value: unknown): JointState | null => {
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
			return { name: parsedNames, position: parsedPositions };
		}
	}
	return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Transform-tree relation helpers
// ─────────────────────────────────────────────────────────────────────────────

export const collectTreeRelations = (trees: Map<string, TransformTree>) => {
	const parentById = new Map<string, string | null>();
	const childrenById = new Map<string, string[]>();

	const visit = (node: TransformTree, parentId: string | null) => {
		parentById.set(node.id, parentId);
		const childIds: string[] = [];
		node.children.forEach((child, childId) => {
			childIds.push(childId);
			visit(child, node.id);
		});
		childrenById.set(node.id, childIds);
	};

	trees.forEach((tree) => visit(tree, null));
	return { parentById, childrenById };
};

export const collectSubtreeFrameIds = (
	rootId: string,
	childrenById: Map<string, string[]>,
): string[] => {
	const result: string[] = [];
	const stack = [rootId];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;
		result.push(current);
		const children = childrenById.get(current) ?? [];
		for (const childId of children) stack.push(childId);
	}
	return result;
};
