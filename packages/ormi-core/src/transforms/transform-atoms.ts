"use client";
/**
 * Transform Atoms Store
 *
 * Event-driven transform system using Jotai atoms.
 * Datasources push transforms directly to atoms, widgets subscribe reactively.
 *
 * Architecture:
 * - transformTreesAtom: Main atom holding all transform trees from all datasources
 * - updateTransformTree: Function to update/merge transforms from a datasource
 * - removeTransformTree: Function to remove transforms when datasource disconnects
 */

import { atom, createStore } from "jotai";
import { CoordinateConvention, TransformTree } from "../types";

// Create a single shared store instance for transforms
// This ensures processTFMessage() and useTransformSource() use the same store
/** Shared Jotai store for transform state. */
export const transformStore = createStore();

// ============================================================================
// Core Atoms - These atoms hold state accessed by both setter functions and React hooks
// ============================================================================

/**
 * Main atom holding all transform trees from all datasources
 * Key is the root frame_id (e.g., "world", "map", "odom")
 *
 * IMPORTANT: This is a writable atom that can be updated imperatively
 * from outside React (e.g., from web workers or callbacks)
 */
/** Atom holding all transform trees from all datasources. */
export const transformTreesAtom = atom<Map<string, TransformTree>>(
	new Map<string, TransformTree>(),
);

/**
 * Atom to track which datasources have contributed transforms
 * Useful for debugging and cleanup
 */
/** Atom tracking datasource ids that contributed transforms. */
export const transformSourcesAtom = atom<Set<string>>(new Set<string>());

/**
 * Derived atom that returns the number of frames in the transform tree
 */
/** Atom computing total frame count across all trees. */
export const transformFrameCountAtom = atom((get) => {
	const trees = get(transformTreesAtom);
	let count = 0;

	const countFrames = (tree: TransformTree): number => {
		let c = 1; // Count this node
		for (const [, child] of tree.children) {
			c += countFrames(child);
		}
		return c;
	};

	for (const [, tree] of trees) {
		count += countFrames(tree);
	}

	return count;
});

// ============================================================================
// Store Access (for use outside React components)
// ============================================================================

/**
 * Get the current transform trees (for use outside React)
 */
/**
 * Get the current transform trees map (outside React).
 * @returns Transform tree map.
 */
export function getTransformTrees(): Map<string, TransformTree> {
	return transformStore.get(transformTreesAtom);
}

/**
 * Subscribe to transform tree changes (for use outside React)
 */
/**
 * Subscribe to transform tree updates (outside React).
 * @param callback - Change callback.
 * @returns Unsubscribe function.
 */
export function subscribeToTransforms(callback: () => void): () => void {
	return transformStore.sub(transformTreesAtom, callback);
}

// ============================================================================
// Transform Tree Helpers
// ============================================================================

/**
 * Find a transform tree node by ID in a map of trees
 */
function findTreeById(
	trees: Map<string, TransformTree>,
	id: string,
): TransformTree | null {
	// First check direct keys
	if (trees.has(id)) {
		return trees.get(id)!;
	}

	// Search recursively
	for (const [, tree] of trees) {
		const found = searchTreeRecursively(tree, id);
		if (found) return found;
	}

	return null;
}

/**
 * Recursively search for a node in a tree
 */
function searchTreeRecursively(
	tree: TransformTree,
	id: string,
): TransformTree | null {
	if (tree.id === id) return tree;

	for (const [, child] of tree.children) {
		const found = searchTreeRecursively(child, id);
		if (found) return found;
	}

	return null;
}

/**
 * Deep clone a transform tree (needed for immutable updates)
 */
function cloneTree(tree: TransformTree): TransformTree {
	const newChildren = new Map<string, TransformTree>();
	for (const [key, child] of tree.children) {
		newChildren.set(key, cloneTree(child));
	}

	return {
		...tree,
		transform: { ...tree.transform },
		children: newChildren,
	};
}

/**
 * Clone the entire trees map
 */
function cloneTrees(
	trees: Map<string, TransformTree>,
): Map<string, TransformTree> {
	const newTrees = new Map<string, TransformTree>();
	for (const [key, tree] of trees) {
		newTrees.set(key, cloneTree(tree));
	}
	return newTrees;
}

/**
 * Compare two transforms to see if they're effectively equal
 */
function transformsEqual(
	a: TransformTree["transform"],
	b: TransformTree["transform"],
): boolean {
	const EPSILON = 0.0001;
	return (
		Math.abs(a.position.x - b.position.x) < EPSILON &&
		Math.abs(a.position.y - b.position.y) < EPSILON &&
		Math.abs(a.position.z - b.position.z) < EPSILON &&
		Math.abs(a.rotation.x - b.rotation.x) < EPSILON &&
		Math.abs(a.rotation.y - b.rotation.y) < EPSILON &&
		Math.abs(a.rotation.z - b.rotation.z) < EPSILON &&
		Math.abs(a.rotation.w - b.rotation.w) < EPSILON
	);
}

// ============================================================================
// Transform Update Functions
// ============================================================================

/** Single transform entry in a TF message. */
export interface TFTransform {
	header: {
		frame_id: string;
		stamp?: { sec: number; nsec: number };
	};
	child_frame_id: string;
	transform: {
		translation: { x: number; y: number; z: number };
		rotation: { x: number; y: number; z: number; w: number };
		convention?: CoordinateConvention;
	};
}

/** TF message payload containing one or more transforms. */
export interface TFMessage {
	transforms: TFTransform[];
}

/**
 * Process a TF message and update the transform trees atom
 * This is the main entry point for datasources to push transforms
 *
 * @param datasourceId - Unique ID of the datasource (for tracking)
 * @param message - TF message containing transforms
 */
/** Process a TF message and update the transform trees. */
export function processTFMessage(
	datasourceId: string,
	message: TFMessage,
): void {
	if (!message?.transforms || !Array.isArray(message.transforms)) {
		return;
	}

	// Always track datasource, even if no changes are made
	const sources = transformStore.get(transformSourcesAtom);
	if (!sources.has(datasourceId)) {
		const newSources = new Set(sources);
		newSources.add(datasourceId);
		transformStore.set(transformSourcesAtom, newSources);
	}

	const currentTrees = transformStore.get(transformTreesAtom);
	const newTrees = cloneTrees(currentTrees);
	let hasChanges = false;

	for (const tf of message.transforms) {
		// Validate transform data to prevent crashes on malformed messages
		if (!tf?.child_frame_id || !tf?.header?.frame_id) {
			continue; // Skip malformed transform
		}
		if (!tf?.transform?.translation || !tf?.transform?.rotation) {
			continue; // Skip transform without translation/rotation data
		}

		const childId = tf.child_frame_id;
		const parentId = tf.header.frame_id;

		// Detect circular references: if child already has parentId as its child, skip
		const existingChild = findTreeById(newTrees, childId);
		if (existingChild) {
			const wouldCreateCycle = findTreeById(
				new Map([[childId, existingChild]]),
				parentId,
			);
			if (wouldCreateCycle) {
				// Skip this transform to avoid circular reference
				continue;
			}
		}

		const transformTree: TransformTree = {
			id: childId,
			parentId: parentId,
			transform: {
				position: {
					x: tf.transform.translation.x ?? 0,
					y: tf.transform.translation.y ?? 0,
					z: tf.transform.translation.z ?? 0,
					w: 1,
				},
				rotation: {
					x: tf.transform.rotation.x ?? 0,
					y: tf.transform.rotation.y ?? 0,
					z: tf.transform.rotation.z ?? 0,
					w: tf.transform.rotation.w ?? 1,
				},
				convention: tf.transform.convention ?? "THREE",
			},
			children: new Map(),
			convention: tf.transform.convention ?? "THREE",
		};

		const parentTree = findTreeById(newTrees, parentId);
		const existingTree = findTreeById(newTrees, childId);

		if (parentTree && !existingTree) {
			// Parent exists, child doesn't - add child to parent
			parentTree.children.set(childId, transformTree);
			hasChanges = true;
		} else if (!existingTree) {
			// Neither exists - create parent as root and add child
			const newRoot: TransformTree = {
				id: parentId,
				parentId: "",
				transform: {
					position: { x: 0, y: 0, z: 0, w: 1 },
					rotation: { x: 0, y: 0, z: 0, w: 1 },
					convention: tf.transform.convention ?? "THREE",
				},
				children: new Map([[childId, transformTree]]),
				convention: tf.transform.convention ?? "THREE",
			};
			newTrees.set(parentId, newRoot);
			hasChanges = true;
		} else {
			// Child exists - only update if transform changed
			if (
				!transformsEqual(
					existingTree.transform,
					transformTree.transform,
				)
			) {
				existingTree.transform = transformTree.transform;
				hasChanges = true;
			}

			// If existing tree has no parent, link it
			if (existingTree.parentId === "") {
				existingTree.parentId = parentId;

				// Check if parent exists
				const newParent = findTreeById(newTrees, parentId);
				if (newParent) {
					newParent.children.set(existingTree.id, existingTree);
					// Remove from root level if it was there
					if (newTrees.has(existingTree.id)) {
						newTrees.delete(existingTree.id);
					}
				} else {
					// Create new parent as root
					const newRoot: TransformTree = {
						id: parentId,
						parentId: "",
						transform: {
							position: { x: 0, y: 0, z: 0, w: 1 },
							rotation: { x: 0, y: 0, z: 0, w: 1 },
							convention: tf.transform.convention ?? "THREE",
						},
						children: new Map([[existingTree.id, existingTree]]),
						convention: tf.transform.convention ?? "THREE",
					};
					newTrees.set(parentId, newRoot);
					// Remove child from root level
					if (newTrees.has(existingTree.id)) {
						newTrees.delete(existingTree.id);
					}
				}
			}
		}
	}

	if (hasChanges) {
		transformStore.set(transformTreesAtom, newTrees);
	}
}

/**
 * Clear all transforms from a specific datasource
 * Call this when a datasource disconnects
 *
 * Note: Currently clears ALL transforms since we don't track per-datasource ownership.
 * For a more sophisticated implementation, we could tag each transform with its source.
 */
/**
 * Clear transforms when a datasource disconnects.
 * @param datasourceId - Datasource id.
 */
export function clearTransformsFromDatasource(datasourceId: string): void {
	const sources = transformStore.get(transformSourcesAtom);

	if (sources.has(datasourceId)) {
		const newSources = new Set(sources);
		newSources.delete(datasourceId);
		transformStore.set(transformSourcesAtom, newSources);

		// If no more sources, clear all transforms
		if (newSources.size === 0) {
			transformStore.set(transformTreesAtom, new Map());
		}
	}
}

/**
 * Completely clear all transforms
 */
/** Clear all transforms and sources. */
export function clearAllTransforms(): void {
	transformStore.set(transformTreesAtom, new Map());
	transformStore.set(transformSourcesAtom, new Set());
}
