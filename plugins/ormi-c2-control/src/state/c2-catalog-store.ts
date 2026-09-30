"use client";

/**
 * C2 catalog store — shared UUID→human-name maps.
 *
 * A tiny module-level store mapping `mission_id → name` and `feature_id → name`.
 * The widgets that already fetch these lists (the mission browser and editor
 * for missions, the map for features) publish names here; the read-only
 * display widgets (control panel, feedback, swarm log, editor geometry list) resolve a UUID to its human name without each one refetching
 * the list (the redundant-request anti-pattern — see AGENTS.md "prefer
 * structural fix over caching").
 *
 * Kept SEPARATE from the selection store (`selection-store.ts`) and the
 * map-editing store (`map-editing-store.ts`): the active mission, a geometry
 * hand-off, and a name catalog are independent concerns, exactly as those two
 * are kept separate from each other. Agents/vehicles are deliberately NOT held
 * here (a later phase).
 *
 * Read through `useSyncExternalStore` with an identity-stable, change-fresh
 * snapshot — same contract as the transform store
 * (`packages/ormi-core/src/transforms/transform-atoms.ts`).
 *
 * ⚠ CRITICAL — each name hook resolves a SINGLE id to its name STRING (a
 * primitive), and its `getSnapshot` returns that primitive, NOT the underlying
 * map object.
 * A primitive snapshot is naturally reference-stable while unchanged and fresh
 * after a change, so `useSyncExternalStore` neither loops nor goes stale. The
 * per-id getSnapshot is built with `useCallback` keyed on the id so it closes
 * over the right id while staying stable across renders.
 *
 * ## The per-map feature catalogue
 *
 * Beyond the flat name maps, the store also carries the FEATURES of each map —
 * their `feature_type` as well as their name — because two questions need it
 * and neither can be answered from a name: which features may be offered as
 * mission assets (`waypoint` / `zone` / `cue`), and which `feature_id`s are
 * zones (what the graph compiler derives `behavior` from).
 *
 * ⚠ REPLACE-PER-MAP, never merge. A publish for map **B** replaces map B's
 * entry outright and touches no other map's. Merging would leave map A's zones
 * in the list an operator sees while looking at map B, and they would pick one:
 * a mission objective referencing a feature that is not on the map. Deletions
 * are the same argument in reverse — a merged list can never shrink, so a zone
 * deleted on the map stays offerable forever.
 *
 * The derived views (asset list, `feature_id → feature_type`) are computed ONCE
 * at publish time and stored, so the array/record a hook hands back is
 * reference-stable while unchanged — an object snapshot recomputed per call
 * would make `useSyncExternalStore` loop. An identical re-publish is deduped on
 * a content signature and notifies nobody.
 *
 * ⚠ Do NOT replace this with a `useMemo` keyed on a version counter that reads
 * the module store: the React Compiler (enabled in the web app) strips the
 * no-op version read and freezes the memo on its first result (the trap
 * documented in AGENTS.md "React Compiler + external mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

import { uuidKey } from "../types/uuid";

/** mission_id → operator-facing mission name. */
let missionNames: Record<string, string> = {};
/** feature_id → operator-facing feature name. */
let featureNames: Record<string, string> = {};

/**
 * One map feature, reduced to what any consumer outside the map itself needs.
 *
 * Deliberately NOT a `C2Feature`: geometry belongs to the map and nothing here
 * has any business reading it, so it is not carried.
 */
export interface CatalogFeature {
	feature_id: string;
	/** Operator-facing name, when the feature has one. */
	name?: string;
	/** MapDB `feature_type` (`zone`, `waypoint`, `cue`, `road`, …). */
	feature_type?: string;
}

/**
 * The feature types a mission may reference as an objective.
 *
 * A road or a geofence is map furniture, not something a mission is dispatched
 * over, so offering one would be a choice the C2 cannot act on.
 */
export const ASSET_FEATURE_TYPES = ["waypoint", "zone", "cue"] as const;

/**
 * Whether a `feature_type` names a mission-assignable asset.
 *
 * @param type - A MapDB `feature_type`, or anything at all.
 * @returns True for `waypoint`, `zone` and `cue`.
 */
export function isAssetFeatureType(type: unknown): boolean {
	return (
		typeof type === "string" &&
		(ASSET_FEATURE_TYPES as readonly string[]).includes(type)
	);
}

/** One map's published feature catalogue, plus its precomputed derived views. */
interface MapFeatureEntry {
	/** Content signature — an identical re-publish is a no-op. */
	sig: string;
	/** Every feature on the map, in publish order. */
	features: readonly CatalogFeature[];
	/** Just the {@link ASSET_FEATURE_TYPES} ones, in publish order. */
	assets: readonly CatalogFeature[];
	/** `feature_id → feature_type`, for the behaviour derivation. */
	types: Readonly<Record<string, string>>;
}

/** map name → its feature catalogue. Replaced per map, never merged. */
let mapFeatures: Record<string, MapFeatureEntry> = {};

/** Shared empty results, so an unknown map yields a STABLE reference. */
const NO_FEATURES: readonly CatalogFeature[] = Object.freeze([]);
const NO_TYPES: Readonly<Record<string, string>> = Object.freeze({});

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * Shorten a UUID for display when no human name is known: first 8 chars + "…".
 *
 * @param id - The id to shorten; empty/`null`/`undefined` yields "".
 * @returns The shortened id, or "" when there is nothing to show.
 */
export function shortId(id: string | null | undefined): string {
	if (!id) return "";
	return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

/**
 * Merge a list of `{ id, name }` rows into a name map, returning a NEW map only
 * when at least one name actually changed (so identical re-fetches are no-ops).
 *
 * Entries without a usable string name are skipped (they keep any prior name).
 */
function mergeNames(
	current: Record<string, string>,
	rows: { id: string; name?: string }[],
): Record<string, string> {
	let next: Record<string, string> | null = null;
	for (const row of rows) {
		const id = row.id;
		if (!id) continue;
		const name = typeof row.name === "string" ? row.name : undefined;
		if (!name) continue;
		if (current[id] === name) continue;
		if (!next) next = { ...current };
		next[id] = name;
	}
	return next ?? current;
}

/**
 * Publish mission names (from a `c2.missions.list` fetch).
 *
 * Merges into the mission map. A no-op (no listener notification) when every
 * resolved name is already present and unchanged, so repeated identical list
 * fetches do not churn consumers.
 *
 * @param rows - Mission rows carrying `mission_id` and an optional `name`.
 */
export function publishMissionNames(
	rows: { mission_id: string; name?: string }[],
): void {
	const next = mergeNames(
		missionNames,
		rows.map((r) => ({ id: r.mission_id, name: r.name })),
	);
	if (next === missionNames) return;
	missionNames = next;
	emit();
}

/**
 * Publish feature names (from a `c2.features.list` fetch).
 *
 * Merges into the feature map. A no-op (no listener notification) when every
 * resolved name is already present and unchanged.
 *
 * @param features - Features carrying `feature_id` and an optional `name`.
 */
export function publishFeatureNames(
	features: { feature_id: string; name?: string }[],
): void {
	const next = mergeNames(
		featureNames,
		features.map((f) => ({ id: f.feature_id, name: f.name })),
	);
	if (next === featureNames) return;
	featureNames = next;
	emit();
}

/**
 * Publish the FEATURES of one map — names and `feature_type`s together.
 *
 * The single hook point for the map's own `fetchFeatures`, which every mount,
 * map switch, save, delete and OSM import already goes through. Two effects,
 * and they are deliberately different:
 *
 * - the flat `feature_id → name` catalogue is **merged** (a widget resolving a
 *   name for a feature on another map must keep working — that is what
 *   {@link useFeatureName} promises), and
 * - the per-map catalogue is **replaced**, so a feature deleted on the map
 *   stops being offered and map A's features never appear under map B.
 *
 * A no-op (no notification) when the map's catalogue is content-identical to
 * what is already stored, so a refetch that changed nothing does not churn the
 * asset dropdown out from under the operator's pointer.
 *
 * @param mapName - The map registry name these features belong to. An empty
 *   name is ignored: features with no map are features nothing can scope.
 * @param features - The map's features, as returned by `c2.features.list`.
 */
export function publishMapFeatures(
	mapName: string,
	features: readonly CatalogFeature[],
): void {
	if (!mapName) return;

	const rows: CatalogFeature[] = [];
	for (const feature of features) {
		if (!feature?.feature_id) continue;
		rows.push({
			feature_id: feature.feature_id,
			...(typeof feature.name === "string" ? { name: feature.name } : {}),
			...(typeof feature.feature_type === "string"
				? { feature_type: feature.feature_type }
				: {}),
		});
	}

	const sig = JSON.stringify(rows);
	const prev = mapFeatures[mapName];
	const unchanged = prev?.sig === sig;

	if (!unchanged) {
		const types: Record<string, string> = {};
		for (const row of rows) {
			if (row.feature_type) types[row.feature_id] = row.feature_type;
		}
		mapFeatures = {
			...mapFeatures,
			[mapName]: {
				sig,
				features: rows,
				assets: rows.filter((row) =>
					isAssetFeatureType(row.feature_type),
				),
				types,
			},
		};
	}

	const nextNames = mergeNames(
		featureNames,
		rows.map((row) => ({ id: row.feature_id, name: row.name })),
	);
	const namesChanged = nextNames !== featureNames;
	if (namesChanged) featureNames = nextNames;

	if (unchanged && !namesChanged) return;
	emit();
}

/**
 * Whether a map's features have been published at least once.
 *
 * The graph editor's fallback-fetch guard: it fetches for itself only when
 * nothing (the mission map, typically) has already published the map, so the
 * two panels stay independent without fetching the same list twice.
 *
 * @param mapName - The map registry name.
 * @returns True when a catalogue is stored for that map.
 */
export function hasMapFeatures(mapName: string | null | undefined): boolean {
	if (!mapName) return false;
	return mapFeatures[mapName] !== undefined;
}

/**
 * Every published feature of one map. Treat as read-only.
 *
 * @param mapName - The map registry name.
 * @returns The map's features, or a stable empty array.
 */
export function getMapFeatures(
	mapName: string | null | undefined,
): readonly CatalogFeature[] {
	if (!mapName) return NO_FEATURES;
	return mapFeatures[mapName]?.features ?? NO_FEATURES;
}

/**
 * The mission-assignable features of one map. Treat as read-only.
 *
 * @param mapName - The map registry name.
 * @returns The map's `waypoint`/`zone`/`cue` features, or a stable empty array.
 */
export function getMapAssetFeatures(
	mapName: string | null | undefined,
): readonly CatalogFeature[] {
	if (!mapName) return NO_FEATURES;
	return mapFeatures[mapName]?.assets ?? NO_FEATURES;
}

/**
 * `feature_id → feature_type` for one map. Treat as read-only.
 *
 * This is what `compileMissionGraph`'s `featureTypes` argument wants: a
 * graph compiled without it derives NAVIGATE for every mission, including a
 * zone sweep, and the planner's navigate branch plans to a point instead of
 * sweeping.
 *
 * @param mapName - The map registry name.
 * @returns The map's type index, or a stable empty record.
 */
export function getMapFeatureTypes(
	mapName: string | null | undefined,
): Readonly<Record<string, string>> {
	if (!mapName) return NO_TYPES;
	return mapFeatures[mapName]?.types ?? NO_TYPES;
}

/**
 * Resolve a mission id to its human name outside React.
 *
 * @param id - The mission id.
 * @returns The known name, or `shortId(id)` when none is known.
 */
export function getMissionName(id: string | null | undefined): string {
	if (!id) return "";
	return missionNames[id] ?? shortId(id);
}

/**
 * Look up a KNOWN mission name, tolerant of `-` vs `_` and case in the id.
 *
 * Unlike {@link getMissionName} this does not fall back to a shortened id: it
 * returns null when no name is known, so a caller can choose its own fallback.
 *
 * @param id - The mission id, in any separator/case spelling.
 * @returns The published name, or null.
 */
export function findMissionName(id: string | null | undefined): string | null {
	if (!id) return null;
	const direct = missionNames[id];
	if (direct) return direct;
	const key = uuidKey(id);
	if (!key) return null;
	for (const [known, name] of Object.entries(missionNames)) {
		if (uuidKey(known) === key) return name;
	}
	return null;
}

/**
 * Resolve a feature id to its human name outside React.
 *
 * @param id - The feature id.
 * @returns The known name, or `shortId(id)` when none is known.
 */
export function getFeatureName(id: string | null | undefined): string {
	if (!id) return "";
	return featureNames[id] ?? shortId(id);
}

/**
 * Subscribe to catalog changes (the `useSyncExternalStore` subscribe arg).
 * @param listener - Change callback.
 * @returns Unsubscribe function.
 */
export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * React hook: the human name for a mission id, re-rendering on change.
 *
 * The snapshot is the resolved name STRING (a primitive) for `id`, not the map
 * object — identity-stable while unchanged, fresh after a publish. Falls back to
 * `shortId(id)` until a name is known.
 *
 * @param id - The mission id (or null/undefined → "").
 * @returns The mission's human name or a shortened id.
 */
export function useMissionName(id: string | null | undefined): string {
	const getName = useCallback(() => getMissionName(id), [id]);
	return useSyncExternalStore(subscribe, getName, getName);
}

/**
 * React hook: the human name for a feature id, re-rendering on change.
 *
 * Same primitive-snapshot contract as {@link useMissionName}.
 *
 * @param id - The feature id (or null/undefined → "").
 * @returns The feature's human name or a shortened id.
 */
export function useFeatureName(id: string | null | undefined): string {
	const getName = useCallback(() => getFeatureName(id), [id]);
	return useSyncExternalStore(subscribe, getName, getName);
}

/**
 * React hook: every published feature of one map, re-rendering on change.
 *
 * The snapshot is the STORED array for that map — reference-stable while the
 * map's catalogue is unchanged (the store dedups an identical re-publish on a
 * content signature) and fresh after a real one. Never build a new array here:
 * a per-call `filter`/`map` is a new reference every call and
 * `useSyncExternalStore` would re-render forever.
 *
 * @param mapName - The map registry name.
 * @returns The map's features, or a stable empty array.
 */
export function useMapFeatures(
	mapName: string | null | undefined,
): readonly CatalogFeature[] {
	const get = useCallback(() => getMapFeatures(mapName), [mapName]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * React hook: the mission-assignable features of one map.
 *
 * Same stored-snapshot contract as {@link useMapFeatures}; the asset subset is
 * precomputed at publish time for exactly that reason.
 *
 * @param mapName - The map registry name.
 * @returns The map's `waypoint`/`zone`/`cue` features, or a stable empty array.
 */
export function useMapAssetFeatures(
	mapName: string | null | undefined,
): readonly CatalogFeature[] {
	const get = useCallback(() => getMapAssetFeatures(mapName), [mapName]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * React hook: `feature_id → feature_type` for one map.
 *
 * Same stored-snapshot contract as {@link useMapFeatures}.
 *
 * @param mapName - The map registry name.
 * @returns The map's type index, or a stable empty record.
 */
export function useMapFeatureTypes(
	mapName: string | null | undefined,
): Readonly<Record<string, string>> {
	const get = useCallback(() => getMapFeatureTypes(mapName), [mapName]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * Test-only: drop every published map catalogue.
 *
 * The name maps are deliberately left alone — they are additive by design and
 * every existing test depends on that.
 */
export function __resetMapFeatures(): void {
	mapFeatures = {};
}
