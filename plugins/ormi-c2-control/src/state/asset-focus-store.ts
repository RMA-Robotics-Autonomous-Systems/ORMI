"use client";

/**
 * Asset selection, as the asset tree and the mission map speak of it: an
 * adapter over the editor's one selection (`editor-selection-store.ts`).
 *
 * - SELECTING an asset (`selectAsset`) makes it the selection, owned by the
 *   Assets panel;
 * - a FOCUS request (`focusAsset`) selects it AND asks every panel that
 *   shows it to bring it into view (the selection store's reveal channel):
 *   the map picks it and flies to it. Selecting alone never moves a view.
 *
 * `useSelectedAsset` reads an asset whichever panel selected it.
 */

import {
	clearEditorSelection,
	getEditorSelection,
	requestReveal,
	setEditorSelection,
	subscribeReveal,
	useSelectedIds,
} from "./editor-selection-store";

/** An asset of a mission. */
export interface AssetRef {
	missionId: string;
	featureId: string;
}

/** A request to show an asset, in every widget that can. */
export interface AssetFocusRequest extends AssetRef {
	/** Increases with every request. */
	seq: number;
}

/**
 * Select an asset (or nothing), without asking anyone to move to it.
 * @param ref - The asset, or null.
 */
export function selectAsset(ref: AssetRef | null): void {
	if (!ref) {
		clearEditorSelection();
		return;
	}
	setEditorSelection(
		[{ kind: "asset", missionId: ref.missionId, id: ref.featureId }],
		"assets",
	);
}

/**
 * Select an asset AND ask every widget that shows it to bring it into view.
 * @param ref - The asset.
 */
export function focusAsset(ref: AssetRef): void {
	selectAsset(ref);
	requestReveal({
		kind: "asset",
		missionId: ref.missionId,
		id: ref.featureId,
	});
}

/** The selected asset (one alone), outside React. */
export function getSelectedAsset(): AssetRef | null {
	const selection = getEditorSelection();
	const item = selection.items[0];
	if (selection.items.length !== 1 || item?.kind !== "asset") return null;
	return { missionId: item.missionId, featureId: item.id };
}

/**
 * Be told about every focus request, as it is made.
 * @param listener - Called with each request.
 * @returns Unsubscribe.
 */
export function subscribeAssetFocus(
	listener: (request: AssetFocusRequest) => void,
): () => void {
	return subscribeReveal(({ item, seq }) => {
		if (item.kind !== "asset") return;
		listener({ missionId: item.missionId, featureId: item.id, seq });
	});
}

/**
 * React hook: the asset selected in `missionId` (by any panel), or null.
 * @param missionId - The mission shown.
 */
export function useSelectedAsset(
	missionId: string | null | undefined,
): string | null {
	const ids = useSelectedIds("asset", missionId);
	return ids.length === 1 ? ids[0]! : null;
}
