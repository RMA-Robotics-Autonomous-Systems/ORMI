/**
 * Pure layout helpers for the 2D transform-tree widget.
 *
 * No React, no DOM — deterministic `d3-hierarchy` layout over the flat transform edges. Kept
 * separate so the tricky parts (super-root construction, topology signature, tree filtering)
 * are unit-testable without rendering.
 */

import { stratify, tree, type HierarchyPointNode } from "d3";

/** Sentinel id for the invisible super-root that joins a multi-root forest into one tree. */
export const SUPER_ROOT = "__ormi_super_root__";

/** Minimal per-frame input the layout needs (mapped from a `TransformEdge`). */
export interface TfNodeInput {
	frameId: string;
	parentId: string;
	rawFrameId: string;
	source: string;
	isStatic: boolean;
	parentObserved: boolean;
	receivedAt: number;
	/** Translation magnitude (m) of the child-in-parent transform. */
	magnitude: number;
}

/** A node fed to `d3.stratify`. */
export interface StratifyNode {
	id: string;
	parentId: string | null;
	/** Present for real frames; absent for the super-root and inferred virtual roots. */
	data?: TfNodeInput;
	/** True for an inferred root (a parent that was never observed as a child). */
	isVirtual: boolean;
}

/** Magnitude of a translation vector. */
export function translationMagnitude(p: {
	x: number;
	y: number;
	z: number;
}): number {
	return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
}

/**
 * A signature that changes only when the *topology* changes (frames added/removed/re-parented),
 * not when pose values change — so a high-rate pose stream never triggers a relayout.
 */
export function topologySignature(
	inputs: TfNodeInput[],
	treeId?: string,
): string {
	return (
		inputs
			.map((n) => `${n.frameId}<-${n.parentId}`)
			.sort()
			.join("|") + `|tid:${treeId ?? ""}`
	);
}

/** Walk up to the unobserved root name at the top of a frame's chain. */
function rootGroupOf(
	frameId: string,
	parentByFrame: Map<string, string>,
): string {
	let cursor = frameId;
	const seen = new Set<string>();
	while (parentByFrame.has(cursor) && !seen.has(cursor)) {
		seen.add(cursor);
		cursor = parentByFrame.get(cursor)!;
	}
	return cursor; // the unobserved parent name (e.g. "map")
}

/**
 * Restrict inputs to the connected component (tree) identified by `treeId` — which may be a
 * frame id or the tree's unobserved root name. Returns all inputs unchanged if `treeId` is
 * empty or matches nothing (graceful fallback to "show everything").
 */
export function filterByTree(
	inputs: TfNodeInput[],
	treeId?: string,
): TfNodeInput[] {
	if (!treeId || treeId.trim() === "") return inputs;

	const parentByFrame = new Map(inputs.map((n) => [n.frameId, n.parentId]));
	const idSet = new Set(inputs.map((n) => n.frameId));
	const targetGroup = idSet.has(treeId)
		? rootGroupOf(treeId, parentByFrame)
		: treeId; // treeId given as an unobserved root name

	const filtered = inputs.filter(
		(n) => rootGroupOf(n.frameId, parentByFrame) === targetGroup,
	);
	return filtered.length > 0 ? filtered : inputs;
}

/**
 * Build the `d3.stratify` node list: every frame, plus an inferred virtual-root node for each
 * unobserved parent, plus one invisible super-root joining them. This makes a multi-root TF
 * forest a single valid hierarchy (d3.stratify throws on multiple roots / missing parents).
 */
export function buildStratifyNodes(inputs: TfNodeInput[]): StratifyNode[] {
	const idSet = new Set(inputs.map((n) => n.frameId));
	const nodes: StratifyNode[] = [];
	const virtualRoots = new Set<string>();

	for (const input of inputs) {
		nodes.push({
			id: input.frameId,
			parentId: input.parentId,
			data: input,
			isVirtual: false,
		});
		if (input.parentId && !idSet.has(input.parentId)) {
			virtualRoots.add(input.parentId);
		}
	}

	for (const vr of virtualRoots) {
		nodes.push({ id: vr, parentId: SUPER_ROOT, isVirtual: true });
	}

	nodes.push({ id: SUPER_ROOT, parentId: null, isVirtual: false });
	return nodes;
}

/** Result of a layout attempt. */
export interface TreeLayout {
	root: HierarchyPointNode<StratifyNode> | null;
	/** True if d3.stratify/tree succeeded. */
	ok: boolean;
	error?: string;
}

/** Vertical gap between sibling rows. */
export const NODE_ROW_GAP = 26;
/** Horizontal gap between depth levels. */
export const NODE_COL_GAP = 170;

/**
 * Compute a deterministic left-to-right tree layout. Returns `ok: false` (never throws) if the
 * input is somehow invalid (cycle, duplicate, missing parent) so the widget can degrade.
 */
export function computeTreeLayout(nodes: StratifyNode[]): TreeLayout {
	try {
		const root = stratify<StratifyNode>()
			.id((d) => d.id)
			.parentId((d) => d.parentId)(nodes);

		const layout = tree<StratifyNode>().nodeSize([
			NODE_ROW_GAP,
			NODE_COL_GAP,
		]);
		return { root: layout(root), ok: true };
	} catch (error) {
		return {
			root: null,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
