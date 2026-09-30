"use client";

/**
 * Asset selection — which of the open mission's assets the operator is
 * looking at, shared by the asset tree, the mission map and the graph editor.
 *
 * Two things ride on it:
 * - the SELECTION (latest value): picking an asset on the map, or in the
 *   tree, selects it everywhere that lists it;
 * - a FOCUS request (with `seq`): "show me this one" — the map picks it and
 *   flies to it, the graph editor selects the nodes that use it. A request,
 *   acted on once, like `graph-focus-store`: `seq` tells a repeated click
 *   from a stale one.
 *
 * Same module-level `useSyncExternalStore` contract as the other plugin
 * stores; no ORMI core change.
 */

import { useCallback, useSyncExternalStore } from "react";

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

let selected: AssetRef | null = null;
let focus: AssetFocusRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const focusListeners = new Set<(request: AssetFocusRequest) => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * Select an asset (or none), without asking anyone to move to it.
 * @param ref - The asset, or null.
 */
export function selectAsset(ref: AssetRef | null): void {
	if (
		selected?.missionId === ref?.missionId &&
		selected?.featureId === ref?.featureId
	)
		return;
	selected = ref ? { ...ref } : null;
	emit();
}

/**
 * Select an asset AND ask every widget that shows it to bring it into view.
 * @param ref - The asset.
 */
export function focusAsset(ref: AssetRef): void {
	seq += 1;
	focus = { ...ref, seq };
	selected = { ...ref };
	emit();
	for (const listener of focusListeners) listener(focus);
}

/** The selected asset, outside React. */
export function getSelectedAsset(): AssetRef | null {
	return selected;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Be told about every focus request, as it is made.
 * @param listener - Called with each request.
 * @returns Unsubscribe.
 */
export function subscribeAssetFocus(
	listener: (request: AssetFocusRequest) => void,
): () => void {
	focusListeners.add(listener);
	return () => {
		focusListeners.delete(listener);
	};
}

/**
 * React hook: the feature id selected in `missionId`, or null.
 * @param missionId - The mission shown.
 */
export function useSelectedAsset(
	missionId: string | null | undefined,
): string | null {
	const get = useCallback(
		() =>
			missionId && selected?.missionId === missionId
				? selected.featureId
				: null,
		[missionId],
	);
	return useSyncExternalStore(subscribe, get, get);
}

/** Test-only: reset all module-level state. */
export function __resetAssetFocusStore(): void {
	selected = null;
	focus = null;
	seq = 0;
	listeners.clear();
	focusListeners.clear();
}
