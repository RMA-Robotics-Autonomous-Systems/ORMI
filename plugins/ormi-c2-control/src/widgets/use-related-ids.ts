"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
	type SelKind,
	type SelectionOwner,
	getEditorSelection,
	idsOfKey,
	subscribeEditorSelection,
} from "../state/editor-selection-store";
import type { MissionAssets } from "./mission-assets";
import { assetId } from "./mission-assets";
import type { MissionGraph } from "./mission-graph";
import { relatedItems } from "./related-items";

/**
 * React hook: the ids of one kind of item a panel outlines as related to a
 * selection made in ANOTHER panel ({@link relatedItems}). Empty while the
 * panel itself owns the selection. A primitive snapshot underneath, so the
 * array keeps its identity until those ids change.
 *
 * @param kind - The kind the panel outlines.
 * @param panel - The panel asking.
 * @param missionId - The mission shown.
 * @param graph - Its graph.
 * @param assets - Its assets.
 * @param map - The mission's map.
 * @returns The related ids.
 */
export function useRelatedIds(
	kind: SelKind,
	panel: SelectionOwner,
	missionId: string | null | undefined,
	graph: MissionGraph | null | undefined,
	assets: MissionAssets | null | undefined,
	map: string | null | undefined,
): readonly string[] {
	const get = useCallback(() => {
		const selection = getEditorSelection();
		if (selection.owner === panel || selection.items.length === 0)
			return "";
		const ids = new Set((assets?.features ?? []).map(assetId));
		return relatedItems(selection, missionId, graph, ids, map)
			.filter((item) => item.kind === kind)
			.map((item) => item.id)
			.join("\u0000");
	}, [kind, panel, missionId, graph, assets, map]);
	const key = useSyncExternalStore(subscribeEditorSelection, get, get);
	return useMemo(() => idsOfKey(key), [key]);
}
