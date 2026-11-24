/**
 * What the selection relates to in the OTHER panels: the assets a selected
 * node targets, and the nodes that target a selected asset.
 *
 * Cross-panel selection is a highlight, never a second selection: the map
 * outlines the assets of the nodes picked in the node editor, the node
 * editor outlines the nodes using the asset picked on the map or in the
 * Assets panel. Nothing moves a camera and nothing becomes deletable there;
 * Delete acts only on the panel the operator picked in.
 *
 * Pure, no React.
 */

import {
	type EditorSelection,
	type SelItem,
	scopeOf,
} from "../state/editor-selection-store";
import { assetUses } from "./mission-asset-tree";
import type { MissionGraph, MissionGraphNode } from "./mission-graph";

/** The feature a node targets: its asset, its action's target, its condition's key. */
export function nodeTarget(node: MissionGraphNode): string | null {
	if (node.kind === "asset" || node.kind === "action")
		return node.feature_id ?? null;
	if (node.kind === "condition") return node.condition?.key ?? null;
	return null;
}

/**
 * The items related to a selection, in one mission.
 *
 * - Selected nodes: the mission assets they target (`asset` items), and a
 *   target that is not one of the mission's assets as a `map-feature` of
 *   the mission's map.
 * - A selected asset or map feature: the nodes that target it.
 * - Links relate to nothing.
 *
 * @param selection - The selection.
 * @param missionId - The mission shown.
 * @param graph - Its graph, or null.
 * @param assetIds - Its assets' ids.
 * @param map - The mission's map, for targets that are not its assets.
 * @returns The related items, each once, never one already selected.
 */
export function relatedItems(
	selection: EditorSelection,
	missionId: string | null | undefined,
	graph: MissionGraph | null | undefined,
	assetIds: ReadonlySet<string>,
	map: string | null | undefined,
): SelItem[] {
	if (!missionId || !graph || selection.items.length === 0) return [];
	const out: SelItem[] = [];
	const seen = new Set<string>();
	const push = (item: SelItem) => {
		const key = `${item.kind}\u0000${item.id}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push(item);
	};
	const selected = new Set(
		selection.items.map((item) => `${item.kind}\u0000${item.id}`),
	);
	for (const item of selection.items) {
		if (item.kind === "node" && item.missionId === missionId) {
			const node = graph.nodes.find((n) => n.id === item.id);
			const target = node ? nodeTarget(node) : null;
			if (!target) continue;
			if (assetIds.has(target))
				push({ kind: "asset", missionId, id: target });
			else if (map) push({ kind: "map-feature", map, id: target });
		} else if (
			(item.kind === "asset" && item.missionId === missionId) ||
			(item.kind === "map-feature" && map && scopeOf(item) === map)
		) {
			for (const id of assetUses(graph, item.id))
				push({ kind: "node", missionId, id });
		}
	}
	return out.filter((item) => !selected.has(`${item.kind}\u0000${item.id}`));
}
