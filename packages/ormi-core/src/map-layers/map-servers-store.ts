/**
 * Live map-server registry state, held on the single shared {@link appStore}.
 *
 * Written by `MapServersProvider` (and by the settings page after an edit),
 * read by the `mapLayersSelect` renderer and by `useMapRasterLayers`. Every
 * writer here targets `appStore`, never `getDefaultStore()`: a write to a
 * store the `<Provider>` does not bind is invisible to `useAtomValue`.
 *
 * React-free: only jotai atoms and plain setters.
 */

import { atom } from "jotai";

import { appStore } from "../store";
import type { MapServerRecord } from "./model";

/**
 * The map-server registry as a consumer sees it. A discriminated union, never
 * a nullable array, per the async-list rule: "still loading" and "you have no
 * servers" are different answers, and a consumer cannot reach `servers`
 * without narrowing.
 *
 * - `unavailable`: no `MapServersProvider` is mounted (tests, foreign hosts).
 * - `waiting`: the provider is loading the records.
 * - `settled`: the stored records, in registry order.
 * - `failed`: the records could not be loaded.
 */
export type MapServersState =
	| { status: "unavailable" }
	| { status: "waiting" }
	| { status: "settled"; servers: MapServerRecord[] }
	| { status: "failed" };

/** The state before any provider has mounted. */
export const MAP_SERVERS_UNAVAILABLE: MapServersState = Object.freeze({
	status: "unavailable",
});

/** Registry state. Read with `useAtomValue(mapServersAtom, { store: appStore })`. */
export const mapServersAtom = atom<MapServersState>(MAP_SERVERS_UNAVAILABLE);

/**
 * Replace the registry state on {@link appStore}.
 *
 * @param state - The new state.
 */
export function setMapServersState(state: MapServersState): void {
	appStore.set(mapServersAtom, state);
}

/**
 * Settle the registry on a list of records, e.g. the list a settings-page
 * edit returned, without a reload.
 *
 * @param servers - Stored records, in registry order.
 */
export function setMapServers(servers: readonly MapServerRecord[]): void {
	setMapServersState({ status: "settled", servers: [...servers] });
}

/**
 * Read the registry state from {@link appStore} outside React.
 *
 * @returns The current state.
 */
export function getMapServersState(): MapServersState {
	return appStore.get(mapServersAtom);
}

/** Health of one layer as observed by the maps drawing it. */
export type MapLayerHealth = "not-responding";

/**
 * Per-layer health, keyed by {@link mapLayerHealthKey}. A key is present only
 * while the layer is unhealthy; an absent key means nothing is known to be
 * wrong. Session state, never persisted.
 */
export const mapLayerHealthAtom = atom<ReadonlyMap<string, MapLayerHealth>>(
	new Map(),
);

/**
 * Key of a layer in {@link mapLayerHealthAtom}.
 *
 * @param serverKey - The layer's server identity.
 * @param layerId - The adapter-scoped layer id.
 * @returns A stable key.
 */
export function mapLayerHealthKey(serverKey: string, layerId: string): string {
	return `${serverKey}\u0000${layerId}`;
}

/**
 * Record a layer's health. A no-op when nothing changes, so a map reporting
 * the same state on every error does not re-render its readers.
 *
 * @param key - From {@link mapLayerHealthKey}.
 * @param health - The observed health, or `undefined` when it is fine again.
 */
export function setMapLayerHealth(
	key: string,
	health: MapLayerHealth | undefined,
): void {
	const current = appStore.get(mapLayerHealthAtom);
	if (current.get(key) === health) return;
	const next = new Map(current);
	if (health === undefined) next.delete(key);
	else next.set(key, health);
	appStore.set(mapLayerHealthAtom, next);
}
