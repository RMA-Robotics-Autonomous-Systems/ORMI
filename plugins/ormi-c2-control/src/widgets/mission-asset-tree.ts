import type { C2Feature } from "../types/c2-types";
import {
	assetId,
	isMissionAssetType,
	type MissionAssets,
} from "./mission-assets";
import type { MissionGraph } from "./mission-graph";

/**
 * The mission's assets as a tree (pure, testable): waypoints, zones and cues,
 * each with the graph nodes that use it, and the map's own ones that could be
 * imported. What the asset panel draws.
 */

/** One asset in the tree. */
export interface AssetLeaf {
	featureId: string;
	name: string;
	type: string;
	/** Graph nodes that name it: asset nodes, and actions that picked it. */
	usedBy: string[];
}

/** One branch: the assets of one type. */
export interface AssetGroup {
	type: "waypoint" | "zone" | "cue";
	label: string;
	leaves: AssetLeaf[];
}

const GROUPS: readonly { type: AssetGroup["type"]; label: string }[] = [
	{ type: "waypoint", label: "Waypoints" },
	{ type: "zone", label: "Zones" },
	{ type: "cue", label: "Cues" },
];

/**
 * The graph nodes that use an asset: an asset node naming it, an action
 * that picked it inline, or a condition keyed on it (a zone condition).
 *
 * @param graph - The mission's graph, or null when not loaded.
 * @param featureId - The asset.
 * @returns Node ids, in graph order.
 */
export function assetUses(
	graph: MissionGraph | null,
	featureId: string,
): string[] {
	if (!graph) return [];
	return graph.nodes
		.filter(
			(node) =>
				((node.kind === "asset" || node.kind === "action") &&
					node.feature_id === featureId) ||
				(node.kind === "condition" &&
					node.condition?.key === featureId),
		)
		.map((node) => node.id);
}

/** A feature's operator-facing name. */
function nameOf(feature: C2Feature): string {
	const name = feature.properties?.name;
	return typeof name === "string" && name.trim() ? name : assetId(feature);
}

/**
 * The mission's assets grouped by type, each group sorted by name. Every
 * group is present, empty or not, so the tree does not jump as assets come
 * and go.
 *
 * @param assets - The mission's assets.
 * @param graph - Its graph, for the uses; null when not loaded.
 * @returns One group per asset type.
 */
export function assetTree(
	assets: MissionAssets,
	graph: MissionGraph | null,
): AssetGroup[] {
	return GROUPS.map(({ type, label }) => ({
		type,
		label,
		leaves: assets.features
			.filter((feature) => feature.properties?.feature_type === type)
			.map((feature) => ({
				featureId: assetId(feature),
				name: nameOf(feature),
				type,
				usedBy: assetUses(graph, assetId(feature)),
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
	}));
}

/**
 * The map's own waypoints, zones and cues: what can be imported (as a copy)
 * into the mission. A feature already imported keeps its own id in the
 * mission, so nothing here says whether it was: the operator sees the map's.
 *
 * @param mapFeatures - Every feature of the mission's map.
 * @returns The importable ones, sorted by type then name.
 */
export function importableAssets(
	mapFeatures: readonly C2Feature[],
): C2Feature[] {
	return mapFeatures
		.filter(
			(feature) =>
				assetId(feature) !== "" &&
				isMissionAssetType(feature.properties?.feature_type),
		)
		.sort((a, b) => {
			const byType = String(a.properties?.feature_type).localeCompare(
				String(b.properties?.feature_type),
			);
			return byType !== 0 ? byType : nameOf(a).localeCompare(nameOf(b));
		});
}

/**
 * Rename an asset (its `properties.name`); the same object back when it is
 * not there or the name does not change.
 *
 * @param assets - The mission's assets.
 * @param featureId - The asset.
 * @param name - The new name.
 * @returns The assets.
 */
export function renameAsset(
	assets: MissionAssets,
	featureId: string,
	name: string,
): MissionAssets {
	const at = assets.features.findIndex((f) => assetId(f) === featureId);
	const current = assets.features[at];
	if (!current || current.properties?.name === name) return assets;
	const features = [...assets.features];
	features[at] = {
		...current,
		properties: { ...(current.properties ?? {}), name },
	};
	return { ...assets, features };
}

/**
 * The middle of an asset's shape (its bounding box's centre), for a map to
 * fly to; null when it has no usable coordinates.
 *
 * @param feature - The asset.
 * @returns `[lon, lat]`, or null.
 */
export function assetCenter(feature: C2Feature): [number, number] | null {
	let minLon = Infinity;
	let minLat = Infinity;
	let maxLon = -Infinity;
	let maxLat = -Infinity;
	const walk = (value: unknown) => {
		if (!Array.isArray(value)) return;
		if (
			value.length >= 2 &&
			typeof value[0] === "number" &&
			typeof value[1] === "number"
		) {
			minLon = Math.min(minLon, value[0]);
			maxLon = Math.max(maxLon, value[0]);
			minLat = Math.min(minLat, value[1]);
			maxLat = Math.max(maxLat, value[1]);
			return;
		}
		for (const item of value) walk(item);
	};
	walk(feature.geometry?.coordinates);
	if (!Number.isFinite(minLon)) return null;
	return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}
