"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The bag analyzer's map-layer selection (`MapLayerRef[]`), kept per browser.
 *
 * The analyzer is a plugin page with no workspace record and no config
 * dialog, so the selection lives in local storage under a versioned key.
 * Storage is a convenience: every read and write tolerates a missing or
 * throwing `localStorage` (private window, blocked site data), and the page
 * then simply starts with no layers.
 *
 * The value is stored as the selection control hands it over and read back as
 * any array: `useMapRasterLayers` and `MapLayersSelectControl` both tolerate
 * malformed items, and keeping them means a ref this build cannot read is not
 * silently erased.
 */

/** Local-storage key. Bump the version when the stored shape changes. */
export const MAP_LAYERS_STORAGE_KEY = "ormi-emi-bag-analyzer:map-layers:v1";

/** Minimal storage surface, so the read and write are testable without a DOM. */
export interface MapLayersStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** Shared empty value: identity-stable for `useSyncExternalStore`. */
const EMPTY: readonly unknown[] = Object.freeze([]);

/** The browser's local storage, or `undefined` when it cannot be reached. */
function browserStorage(): MapLayersStorage | undefined {
	try {
		return typeof window === "undefined" ? undefined : window.localStorage;
	} catch {
		return undefined;
	}
}

/**
 * Read the stored selection.
 *
 * @param storage - Storage to read; defaults to the browser's.
 * @returns The stored array, or an empty one when absent, unreadable or not an array.
 */
export function readStoredMapLayers(
	storage: MapLayersStorage | undefined = browserStorage(),
): readonly unknown[] {
	try {
		const raw = storage?.getItem(MAP_LAYERS_STORAGE_KEY);
		if (!raw) return EMPTY;
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : EMPTY;
	} catch {
		return EMPTY;
	}
}

/**
 * Write the selection. A failed write is ignored: the selection still holds
 * for this session.
 *
 * @param next - The selection to store.
 * @param storage - Storage to write; defaults to the browser's.
 */
export function writeStoredMapLayers(
	next: readonly unknown[],
	storage: MapLayersStorage | undefined = browserStorage(),
): void {
	try {
		storage?.setItem(MAP_LAYERS_STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Storage full or blocked: keep the in-memory value only.
	}
}

// Module-level store: one selection per page, shared by the control and the map.
let current: readonly unknown[] | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): readonly unknown[] {
	if (current === undefined) current = readStoredMapLayers();
	return current;
}

function getServerSnapshot(): readonly unknown[] {
	return EMPTY;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function setStoredMapLayers(next: readonly unknown[]): void {
	current = next;
	writeStoredMapLayers(next);
	for (const listener of listeners) listener();
}

/**
 * The page's map-layer selection and its setter, persisted in local storage.
 *
 * @returns `[selection, setSelection]`; the selection is identity-stable until set.
 */
export function useStoredMapLayers(): [
	readonly unknown[],
	(next: unknown[]) => void,
] {
	const value = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);
	const set = useCallback((next: unknown[]) => setStoredMapLayers(next), []);
	return [value, set];
}
