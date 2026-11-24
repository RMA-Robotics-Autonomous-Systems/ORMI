"use client";

/**
 * The mission editor's ONE selection: what the operator has picked, in which
 * panel, shared by the mission map, the node editor and the Assets panel.
 *
 * Each panel used to keep its own: the map a `pickedId` and a group, the
 * node editor its selected nodes and links, the Assets panel a selected
 * asset. Linking them took a request store per pair, and nothing could say
 * what "the selection" was when a key arrived. There is now one, with one
 * owner: the panel that made it. Delete acts only on it, in that panel, and
 * the other panels outline what it relates to (`relatedItems`) without
 * selecting anything of their own.
 *
 * Moving a camera to an item is a separate channel ({@link requestReveal}):
 * selecting never moves a view; an explicit "show me this" does.
 *
 * Same module-level `useSyncExternalStore` contract as the other plugin
 * stores (AGENTS.md "React Compiler + external mutable stores"): the state
 * object is replaced only on a real change, and the hooks read PRIMITIVE
 * snapshots (a joined id key), so a panel re-renders only when the ids it
 * shows change, never because another panel's selection moved.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";

/** One selected thing. `scope` is its map (a map feature) or its mission. */
export type SelItem =
	| { kind: "map-feature"; map: string; id: string }
	| { kind: "asset"; missionId: string; id: string }
	| { kind: "node"; missionId: string; id: string }
	| { kind: "edge"; missionId: string; id: string };

/** The kinds of selected thing. */
export type SelKind = SelItem["kind"];

/** The panel a selection was made in. */
export type SelectionOwner = "map" | "graph" | "assets";

/** The selection (read-only to consumers). */
export interface EditorSelection {
	items: readonly SelItem[];
	owner: SelectionOwner | null;
	/**
	 * The map's group: features selected together (two or more, or one that
	 * cannot be opened), shown on the group card rather than opened.
	 */
	group: boolean;
}

/** A request to bring an item into view, wherever it is shown. */
export interface RevealRequest {
	item: SelItem;
	/** Increases with every request, so a repeated one is told from a stale one. */
	seq: number;
}

/** Nothing selected. */
export const EMPTY_SELECTION: EditorSelection = Object.freeze({
	items: Object.freeze([]) as readonly SelItem[],
	owner: null,
	group: false,
});

/** The map or the mission an item belongs to. */
export function scopeOf(item: SelItem): string {
	return item.kind === "map-feature" ? item.map : item.missionId;
}

function sameItem(a: SelItem, b: SelItem): boolean {
	return a.kind === b.kind && a.id === b.id && scopeOf(a) === scopeOf(b);
}

/**
 * Whether two selections are the same.
 * @param a - One selection.
 * @param b - The other.
 * @returns True when the owner, the group flag and the items (in order) match.
 */
export function sameSelection(a: EditorSelection, b: EditorSelection): boolean {
	return (
		a.owner === b.owner &&
		a.group === b.group &&
		a.items.length === b.items.length &&
		a.items.every((item, i) => sameItem(item, b.items[i]!))
	);
}

/**
 * The ids of one kind of item in one scope.
 * @param selection - The selection.
 * @param kind - The kind.
 * @param scope - The map (map features) or mission (the rest).
 * @returns The ids, in selection order.
 */
export function selectedIdsOf(
	selection: EditorSelection,
	kind: SelKind,
	scope: string | null | undefined,
): string[] {
	if (!scope) return [];
	return selection.items
		.filter((item) => item.kind === kind && scopeOf(item) === scope)
		.map((item) => item.id);
}

let state: EditorSelection = EMPTY_SELECTION;
let seq = 0;
const listeners = new Set<() => void>();
const revealListeners = new Set<(request: RevealRequest) => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * Replace the selection. A no-op when nothing changes.
 * @param items - What is selected; empty for nothing.
 * @param owner - The panel it was made in.
 * @param options.group - The map's group (see {@link EditorSelection.group}).
 */
export function setEditorSelection(
	items: readonly SelItem[],
	owner: SelectionOwner,
	options: { group?: boolean } = {},
): void {
	const next: EditorSelection =
		items.length === 0
			? EMPTY_SELECTION
			: {
					items: items.map((item) => ({ ...item })),
					owner,
					group: options.group ?? false,
				};
	if (sameSelection(state, next)) return;
	state = next;
	emit();
}

/**
 * Clear the selection, only when `owner` made it (a panel letting go of its
 * own pick never clears another panel's), or whoever made it without one.
 * @param owner - The panel letting go, or none for any.
 */
export function clearEditorSelection(owner?: SelectionOwner): void {
	if (state.items.length === 0) return;
	if (owner && state.owner !== owner) return;
	state = EMPTY_SELECTION;
	emit();
}

/** The selection, outside React. */
export function getEditorSelection(): EditorSelection {
	return state;
}

/**
 * Subscribe to selection changes.
 * @param listener - Called after each change.
 * @returns Unsubscribe.
 */
export function subscribeEditorSelection(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Ask every panel that shows an item to bring it into view. Does not select.
 * @param item - The item.
 */
export function requestReveal(item: SelItem): void {
	seq += 1;
	const request = { item: { ...item }, seq };
	for (const listener of revealListeners) listener(request);
}

/**
 * Be told about every reveal request, as it is made.
 * @param listener - Called with each request.
 * @returns Unsubscribe.
 */
export function subscribeReveal(
	listener: (request: RevealRequest) => void,
): () => void {
	revealListeners.add(listener);
	return () => {
		revealListeners.delete(listener);
	};
}

/** The separator of an id key (an id never holds it). */
const KEY_SEPARATOR = "\u0000";
const NO_IDS: readonly string[] = Object.freeze([]);

/**
 * Split an id key back into ids.
 * @param key - Ids joined by {@link KEY_SEPARATOR}.
 * @returns The ids; one shared empty array for none.
 */
export function idsOfKey(key: string): readonly string[] {
	return key ? key.split(KEY_SEPARATOR) : NO_IDS;
}

/**
 * React hook: the selected ids of one kind in one scope, optionally only
 * when a given panel made the selection. A primitive snapshot underneath,
 * so the array keeps its identity until those ids change.
 *
 * @param kind - The kind.
 * @param scope - The map or mission.
 * @param owner - Only a selection this panel made, when given.
 * @returns The ids.
 */
export function useSelectedIds(
	kind: SelKind,
	scope: string | null | undefined,
	owner?: SelectionOwner,
): readonly string[] {
	const get = useCallback(
		() =>
			owner && state.owner !== owner
				? ""
				: selectedIdsOf(state, kind, scope).join(KEY_SEPARATOR),
		[kind, scope, owner],
	);
	const key = useSyncExternalStore(subscribeEditorSelection, get, get);
	return useMemo(() => idsOfKey(key), [key]);
}

/**
 * React hook: whether the selection is the map's group.
 * @returns True while the map's group is the selection.
 */
export function useSelectionIsGroup(): boolean {
	const get = useCallback(() => state.owner === "map" && state.group, []);
	return useSyncExternalStore(subscribeEditorSelection, get, get);
}

/**
 * React hook: the selection itself. Its identity changes on every change of
 * any panel's selection, so prefer {@link useSelectedIds} in a panel.
 * @returns The selection.
 */
export function useEditorSelection(): EditorSelection {
	return useSyncExternalStore(
		subscribeEditorSelection,
		getEditorSelection,
		getEditorSelection,
	);
}

/** Test-only: reset all module-level state. */
export function __resetEditorSelectionStore(): void {
	state = EMPTY_SELECTION;
	seq = 0;
	listeners.clear();
	revealListeners.clear();
}
