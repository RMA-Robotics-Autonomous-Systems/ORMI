import type { C2Feature } from "../types/c2-types";

/**
 * A mission's own assets (pure, testable).
 *
 * A mission is a map, its assets and a behaviour graph. The assets are the
 * waypoints, zones and cues the operator placed for THIS mission; they are
 * not the map's. They are saved as a sibling document of the mission in C2DB
 * `missions`, next to `"<mission_id>:graph"`:
 *
 *   { mission_id: "<id>:assets", kind, mission_ref, map, features, updated_at }
 *
 * `map` is the map's registry name: the mission is drawn on it, the planner
 * refuses a step when it has another map loaded. `features` are GeoJSON
 * Features with `properties.{feature_id, feature_type, name}`, the same shape
 * as a map feature. The fog snapshots this document at submit and checks every
 * target against it (TARGET_MISSING, TARGET_TYPE), then sends the planner the
 * target's shape: nothing is looked up in MapDB.
 *
 * Importing from the map, or from another mission, COPIES the feature under a
 * new id: an asset belongs to one mission, so editing it never moves another
 * mission's target.
 */

/** The `kind` marker of an assets document. */
export const MISSION_ASSETS_KIND = "ormi-mission-assets";
/** Suffix of an assets document's id. */
export const MISSION_ASSETS_ID_SUFFIX = ":assets";
/** The feature types a mission owns; everything else belongs to the map. */
export const MISSION_ASSET_TYPES = ["waypoint", "zone", "cue"] as const;

/** A mission's map and assets. */
export interface MissionAssets {
	/** The map's registry name; "" until the mission is placed on one. */
	map: string;
	features: C2Feature[];
}

/** The stored document. */
export interface MissionAssetsDocument extends MissionAssets {
	mission_id: string;
	kind: typeof MISSION_ASSETS_KIND;
	mission_ref: string;
	updated_at: string;
}

/** `"<mission_id>:assets"`. */
export function assetsDocId(missionId: string): string {
	return `${missionId}${MISSION_ASSETS_ID_SUFFIX}`;
}

/** Whether a stored document id is an assets document's, not a mission's. */
export function isMissionAssetsDocId(id: unknown): boolean {
	return typeof id === "string" && id.endsWith(MISSION_ASSETS_ID_SUFFIX);
}

/** Whether a feature type is one a mission owns. */
export function isMissionAssetType(type: unknown): boolean {
	return (MISSION_ASSET_TYPES as readonly unknown[]).includes(type);
}

/** A feature's id, or "". */
export function assetId(feature: C2Feature): string {
	const id = feature.properties?.feature_id;
	return typeof id === "string" ? id : "";
}

/** No assets, on a map. */
export function emptyMissionAssets(map = ""): MissionAssets {
	return { map, features: [] };
}

/**
 * Keep what the fog can read: features with an id, an asset type and a
 * geometry, each once, without Mongo's `_id`.
 */
export function normalizeMissionAssets(assets: MissionAssets): MissionAssets {
	const seen = new Set<string>();
	const features: C2Feature[] = [];
	for (const feature of assets.features) {
		const id = assetId(feature);
		if (!id || seen.has(id)) continue;
		if (!isMissionAssetType(feature.properties?.feature_type)) continue;
		if (!feature.geometry || typeof feature.geometry !== "object") continue;
		seen.add(id);
		const { _id: _omitMongoId, ...rest } = feature;
		void _omitMongoId;
		features.push({ ...rest, type: "Feature" });
	}
	return { map: typeof assets.map === "string" ? assets.map : "", features };
}

/** The document to save. */
export function buildAssetsDocument(
	missionId: string,
	assets: MissionAssets,
	now: Date = new Date(),
): MissionAssetsDocument {
	return {
		mission_id: assetsDocId(missionId),
		kind: MISSION_ASSETS_KIND,
		mission_ref: missionId,
		...normalizeMissionAssets(assets),
		updated_at: now.toISOString(),
	};
}

/**
 * A stored assets document's map and features, or null when it is not one.
 *
 * @param raw - A document from `c2.missions.list`.
 */
export function readAssetsDocument(raw: unknown): MissionAssets | null {
	if (raw == null || typeof raw !== "object") return null;
	const doc = raw as Record<string, unknown>;
	if (!isMissionAssetsDocId(doc.mission_id)) return null;
	if (!Array.isArray(doc.features)) return null;
	return normalizeMissionAssets({
		map: typeof doc.map === "string" ? doc.map : "",
		features: doc.features as C2Feature[],
	});
}

/** `feature_id → feature_type`: what the graph compiler checks targets against. */
export function assetFeatureTypes(
	assets: MissionAssets,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const feature of assets.features) {
		const type = feature.properties?.feature_type;
		if (typeof type === "string") out[assetId(feature)] = type;
	}
	return out;
}

/** One asset by id. */
export function findAsset(
	assets: MissionAssets,
	id: string,
): C2Feature | undefined {
	return assets.features.find((feature) => assetId(feature) === id);
}

/** Add or replace an asset (by its id). */
export function upsertAsset(
	assets: MissionAssets,
	feature: C2Feature,
): MissionAssets {
	const id = assetId(feature);
	if (!id) return assets;
	const at = assets.features.findIndex((f) => assetId(f) === id);
	const features =
		at < 0
			? [...assets.features, feature]
			: assets.features.map((f, i) => (i === at ? feature : f));
	return { ...assets, features };
}

/** Remove an asset. The same object back when it was not there. */
export function removeAsset(assets: MissionAssets, id: string): MissionAssets {
	if (!findAsset(assets, id)) return assets;
	return {
		...assets,
		features: assets.features.filter((f) => assetId(f) !== id),
	};
}

/**
 * Copy a feature (from the map, or another mission) into the mission, under a
 * new id. The copy keeps the name, type, geometry and properties.
 *
 * @param assets - The mission's assets.
 * @param source - The feature to copy.
 * @param newId - The copy's id (`generateMissionId()`; passed in, so this
 *   module does not import the mission list, which imports it).
 * @returns The assets with the copy, and the copy's id.
 */
export function importAsset(
	assets: MissionAssets,
	source: C2Feature,
	newId: string,
): { assets: MissionAssets; id: string } {
	const { _id: _omitMongoId, ...rest } = source;
	void _omitMongoId;
	const copy: C2Feature = {
		...rest,
		type: "Feature",
		properties: { ...(source.properties ?? {}), feature_id: newId },
	};
	return { assets: upsertAsset(assets, copy), id: newId };
}
