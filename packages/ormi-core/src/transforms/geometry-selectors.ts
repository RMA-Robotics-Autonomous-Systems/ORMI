/**
 * Geometry selectors over the transform table.
 *
 * Pure functions (no React, no THREE) that resolve world-space poses and per-frame
 * diagnostics from a {@link TransformTable}. World-matrix accumulation lives here — once,
 * in core — so every consumer agrees, instead of each renderer re-deriving it.
 *
 * Poses are returned as plain {@link Vector3}/{@link Quaternion} (core stays THREE-free);
 * consumers that need THREE objects construct them at the boundary.
 */

import {
	FrameDiagnostic,
	Quaternion,
	Transform,
	TransformEdge,
	TransformTable,
	Vector3,
	WorldFrame,
} from "../types";
import { applyTransform, multiplyQuaternions } from "./utils";
import { frameRawName } from "./frame-namespace";

/** Default staleness threshold in milliseconds. */
export const DEFAULT_STALE_MS = 1000;

const IDENTITY_POSITION: Vector3 = { x: 0, y: 0, z: 0 };
const IDENTITY_ROTATION: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

/** Monotonic millisecond clock matching `TransformEdge.receivedAt`. */
function monotonicNow(): number {
	return typeof performance !== "undefined" && performance.now
		? performance.now()
		: Date.now();
}

function isFiniteVec(v: Vector3): boolean {
	return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** Compose a parent world pose with a child's local transform → child world pose. */
function composePose(
	parentPosition: Vector3,
	parentRotation: Quaternion,
	local: Transform,
): { position: Vector3; rotation: Quaternion } {
	const position = applyTransform(
		{
			x: local.position.x,
			y: local.position.y,
			z: local.position.z,
		},
		{
			position: {
				x: parentPosition.x,
				y: parentPosition.y,
				z: parentPosition.z,
				w: 1,
			},
			rotation: parentRotation,
		},
	);
	const rotation = multiplyQuaternions(parentRotation, local.rotation);
	return { position, rotation };
}

/**
 * Resolve a single frame's world-space pose by walking up to its root and composing down.
 *
 * @param table - The transform table.
 * @param frameId - Frame id to resolve.
 * @returns The world pose, or `null` if the frame is unknown, cyclic, or degenerate (NaN).
 */
export function resolveWorldPose(
	table: TransformTable,
	frameId: string,
): { position: Vector3; rotation: Quaternion } | null {
	const start = table.get(frameId);
	if (!start) return null;

	// Walk up to the root, collecting edges (closest-first).
	const chain: TransformEdge[] = [];
	const visited = new Set<string>();
	let cursor: TransformEdge | undefined = start;
	while (cursor) {
		if (visited.has(cursor.frameId)) return null; // cycle guard
		visited.add(cursor.frameId);
		chain.push(cursor);
		cursor = table.get(cursor.parentId);
	}

	// Accumulate from the root down.
	let position: Vector3 = IDENTITY_POSITION;
	let rotation: Quaternion = IDENTITY_ROTATION;
	for (let i = chain.length - 1; i >= 0; i--) {
		const posed = composePose(position, rotation, chain[i]!.transform);
		position = posed.position;
		rotation = posed.rotation;
	}

	if (!isFiniteVec(position)) return null;
	return { position, rotation };
}

/** Options for {@link selectWorldFrames}. */
export interface SelectWorldFramesOptions {
	/**
	 * If set, restrict to the connected component (tree) containing this frame. The frame may
	 * be any node in the tree, or the tree's unobserved root name (e.g. `"map"`).
	 */
	targetFrame?: string;
	/** Monotonic "now" (ms) for staleness; defaults to the monotonic clock. */
	now?: number;
	/** Staleness threshold in ms. @default {@link DEFAULT_STALE_MS} */
	staleMs?: number;
}

/**
 * Resolve every frame in the table to world space, ready for rendering.
 *
 * Each tree's **unobserved root** (a frame only ever seen as a parent — e.g. a fixed `map`
 * published by nobody) is emitted as a real `WorldFrame` at the tree origin (identity pose),
 * flagged `inferred: true`, with its children parented to it. Without this the root frame is
 * invisible in 3D (the table only stores edges, one per *child*), even though it is the most
 * important frame in the tree. Geometry for real edges is accumulated from identity at that
 * root — identical to the previous renderer's per-node matrix accumulation, minus the
 * redundant convention conversion (edges are already THREE at the datasource boundary).
 *
 * @param table - The transform table.
 * @param options - Optional target-frame filter and staleness settings.
 * @returns Resolved world frames (virtual root first, then depth-first per tree).
 */
export function selectWorldFrames(
	table: TransformTable,
	options: SelectWorldFramesOptions = {},
): WorldFrame[] {
	const {
		targetFrame,
		now = monotonicNow(),
		staleMs = DEFAULT_STALE_MS,
	} = options;

	// children adjacency + root edges grouped by their unobserved parent (the virtual root)
	const childrenByParent = new Map<string, TransformEdge[]>();
	const rootEdgesByRoot = new Map<string, TransformEdge[]>();
	for (const edge of table.values()) {
		const siblings = childrenByParent.get(edge.parentId);
		if (siblings) siblings.push(edge);
		else childrenByParent.set(edge.parentId, [edge]);
		if (!table.has(edge.parentId)) {
			const group = rootEdgesByRoot.get(edge.parentId);
			if (group) group.push(edge);
			else rootEdgesByRoot.set(edge.parentId, [edge]);
		}
	}

	const hasTarget = Boolean(targetFrame && targetFrame !== "");

	const result: WorldFrame[] = [];

	const isStale = (edge: TransformEdge): boolean =>
		!edge.isStatic && now - edge.receivedAt > staleMs;

	// Collect a subtree's frame ids (for target-frame membership testing).
	const subtreeIds = (rootId: string): Set<string> => {
		const ids = new Set<string>();
		const stack = [rootId];
		while (stack.length) {
			const id = stack.pop()!;
			if (ids.has(id)) continue;
			ids.add(id);
			for (const child of childrenByParent.get(id) ?? []) {
				stack.push(child.frameId);
			}
		}
		return ids;
	};

	for (const [rootId, rootEdges] of rootEdgesByRoot) {
		if (hasTarget) {
			const ids = subtreeIds(rootId);
			// Match the target as an exact namespaced key or root name, or as a (legacy) bare
			// raw frame name anywhere in this tree.
			const contains =
				ids.has(targetFrame!) ||
				frameRawName(rootId) === targetFrame ||
				[...ids].some(
					(id) => table.get(id)?.rawFrameId === targetFrame,
				);
			if (!contains) continue;
		}

		// The virtual root itself, at the tree origin. Fresh objects per run — consumers may
		// hold/compare identities across runs.
		const rootPosition: Vector3 = { x: 0, y: 0, z: 0 };
		result.push({
			frameId: rootId,
			rawFrameId: frameRawName(rootId),
			worldPosition: rootPosition,
			worldRotation: { x: 0, y: 0, z: 0, w: 1 },
			parentWorldPosition: null,
			depth: 0,
			stale: false,
			inferred: true,
		});

		// DFS accumulate world poses from identity at the virtual root.
		const stack: Array<{
			edge: TransformEdge;
			parentPos: Vector3;
			parentRot: Quaternion;
			depth: number;
		}> = rootEdges.map((edge) => ({
			edge,
			parentPos: rootPosition,
			parentRot: IDENTITY_ROTATION,
			depth: 1,
		}));
		const seen = new Set<string>([rootId]);

		while (stack.length) {
			const { edge, parentPos, parentRot, depth } = stack.pop()!;
			if (seen.has(edge.frameId)) continue; // cycle guard
			seen.add(edge.frameId);

			const { position, rotation } = composePose(
				parentPos,
				parentRot,
				edge.transform,
			);

			// Skip degenerate (NaN) subtrees rather than poisoning the scene.
			if (!isFiniteVec(position)) continue;

			result.push({
				frameId: edge.frameId,
				rawFrameId: edge.rawFrameId,
				worldPosition: position,
				worldRotation: rotation,
				parentWorldPosition: parentPos,
				depth,
				stale: isStale(edge),
				inferred: false,
			});

			for (const child of childrenByParent.get(edge.frameId) ?? []) {
				stack.push({
					edge: child,
					parentPos: position,
					parentRot: rotation,
					depth: depth + 1,
				});
			}
		}
	}

	return result;
}

/**
 * Compute per-frame diagnostics (staleness, depth, source, inferred) for every edge.
 *
 * @param table - The transform table.
 * @param options - Optional staleness settings.
 * @returns One diagnostic per edge.
 */
export function selectFrameDiagnostics(
	table: TransformTable,
	options: { now?: number; staleMs?: number } = {},
): FrameDiagnostic[] {
	const { now = monotonicNow(), staleMs = DEFAULT_STALE_MS } = options;

	const depthOf = (edge: TransformEdge): number => {
		let depth = 0;
		let cursor: TransformEdge | undefined = table.get(edge.parentId);
		const guard = table.size + 1;
		while (cursor && depth < guard) {
			depth++;
			cursor = table.get(cursor.parentId);
		}
		return depth;
	};

	const out: FrameDiagnostic[] = [];
	for (const edge of table.values()) {
		out.push({
			frameId: edge.frameId,
			rawFrameId: edge.rawFrameId,
			parentId: edge.parentId,
			source: edge.source,
			depth: depthOf(edge),
			stale: !edge.isStatic && now - edge.receivedAt > staleMs,
			inferred: !table.has(edge.parentId),
			isStatic: edge.isStatic,
			stamp: edge.stamp,
			receivedAt: edge.receivedAt,
			ageMs: now - edge.receivedAt,
		});
	}
	return out;
}
