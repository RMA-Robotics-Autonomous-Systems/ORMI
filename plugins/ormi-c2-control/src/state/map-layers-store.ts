"use client";

/**
 * Map layers: the selected map's features as a list, which layers are hidden
 * or locked, and requests to show one feature.
 *
 * The mission map publishes the features it shows; the assets panel lists
 * them by layer (`feature_type`) in both contexts, so a feature covered by
 * another (a road under the geofence) can be reached from the list. Hiding a
 * layer takes it off the map; locking it keeps it drawn but never picked.
 * Usability test 2026-11-12: on the Inta map the geofence covered everything
 * and nothing under it could be picked or edited.
 *
 * Same module-level `useSyncExternalStore` contract as the other plugin
 * stores: every write builds a new state object once, `getSnapshot` returns
 * the stored reference (never a fresh literal). No ORMI core change.
 */

import { useSyncExternalStore } from "react";

/** One feature as the list shows it. */
export interface MapLayerFeature {
	featureId: string;
	name: string;
	/** `feature_type`: the layer it belongs to. */
	featureType: string;
}

/** The store's state (read-only to consumers). */
export interface MapLayersState {
	/** The map the features belong to, "" for none. */
	map: string;
	features: readonly MapLayerFeature[];
	hidden: ReadonlySet<string>;
	locked: ReadonlySet<string>;
}

/** A request to show (pick, fly to, and in Edit open) one feature. */
export interface MapFeatureFocusRequest {
	map: string;
	featureId: string;
	/** Increases with every request. */
	seq: number;
}

const EMPTY: MapLayersState = {
	map: "",
	features: [],
	hidden: new Set(),
	locked: new Set(),
};

let state: MapLayersState = EMPTY;
let seq = 0;
const listeners = new Set<() => void>();
const focusListeners = new Set<(request: MapFeatureFocusRequest) => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

function sameFeatures(
	a: readonly MapLayerFeature[],
	b: readonly MapLayerFeature[],
): boolean {
	return (
		a.length === b.length &&
		a.every(
			(feature, i) =>
				feature.featureId === b[i]?.featureId &&
				feature.name === b[i]?.name &&
				feature.featureType === b[i]?.featureType,
		)
	);
}

/**
 * Publish the features the map shows. Hidden and locked layers are kept
 * across a republish of the same map and reset when the map changes.
 * @param map - The map name.
 * @param features - Its features.
 */
export function publishLayerFeatures(
	map: string,
	features: readonly MapLayerFeature[],
): void {
	if (map === state.map && sameFeatures(features, state.features)) return;
	const sameMap = map === state.map;
	state = {
		map,
		features: [...features],
		hidden: sameMap ? state.hidden : new Set(),
		locked: sameMap ? state.locked : new Set(),
	};
	emit();
}

function toggled(set: ReadonlySet<string>, key: string): Set<string> {
	const next = new Set(set);
	if (next.has(key)) next.delete(key);
	else next.add(key);
	return next;
}

/**
 * Hide or show a layer.
 * @param featureType - The layer.
 */
export function toggleLayerHidden(featureType: string): void {
	state = { ...state, hidden: toggled(state.hidden, featureType) };
	emit();
}

/**
 * Lock or unlock a layer: a locked layer is drawn but never picked.
 * @param featureType - The layer.
 */
export function toggleLayerLocked(featureType: string): void {
	state = { ...state, locked: toggled(state.locked, featureType) };
	emit();
}

/**
 * Ask the map to show one feature. A hidden layer is shown first, a locked
 * one unlocked: the operator asked for that feature by name.
 * @param featureId - The feature.
 */
export function focusMapFeature(featureId: string): void {
	const feature = state.features.find((f) => f.featureId === featureId);
	if (feature) {
		const hidden = state.hidden.has(feature.featureType);
		const locked = state.locked.has(feature.featureType);
		if (hidden || locked) {
			const nextHidden = new Set(state.hidden);
			nextHidden.delete(feature.featureType);
			const nextLocked = new Set(state.locked);
			nextLocked.delete(feature.featureType);
			state = { ...state, hidden: nextHidden, locked: nextLocked };
			emit();
		}
	}
	seq += 1;
	const request = { map: state.map, featureId, seq };
	for (const listener of focusListeners) listener(request);
}

/** The state, outside React. */
export function getMapLayers(): MapLayersState {
	return state;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Be told about every focus request.
 * @param listener - Called with each request.
 * @returns Unsubscribe.
 */
export function subscribeMapFeatureFocus(
	listener: (request: MapFeatureFocusRequest) => void,
): () => void {
	focusListeners.add(listener);
	return () => {
		focusListeners.delete(listener);
	};
}

/** React hook: the map-layers state. */
export function useMapLayers(): MapLayersState {
	return useSyncExternalStore(subscribe, getMapLayers, getMapLayers);
}

/**
 * The features grouped by layer, in a fixed layer order (areas that cover
 * others last), each group sorted by name.
 * @param features - The features.
 * @returns Groups of `[featureType, features]`.
 */
export function groupByLayer(
	features: readonly MapLayerFeature[],
): Array<[string, MapLayerFeature[]]> {
	const order = ["waypoint", "cue", "road", "zone", "risk", "geofence"];
	const groups = new Map<string, MapLayerFeature[]>();
	for (const feature of features) {
		const key = feature.featureType || "other";
		const list = groups.get(key) ?? [];
		list.push(feature);
		groups.set(key, list);
	}
	const rank = (key: string) => {
		const i = order.indexOf(key);
		return i === -1 ? order.length : i;
	};
	return [...groups.entries()]
		.sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
		.map(([key, list]) => [
			key,
			[...list].sort((a, b) => a.name.localeCompare(b.name)),
		]);
}

/** Test-only: reset all module-level state. */
export function __resetMapLayersStore(): void {
	state = EMPTY;
	seq = 0;
	listeners.clear();
	focusListeners.clear();
}
