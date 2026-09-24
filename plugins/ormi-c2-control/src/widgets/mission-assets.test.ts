import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetMissionAssetsStore,
	adoptStoredAssets,
	editMissionAssets,
	getMissionAssets,
	isMissionAssetsDirty,
	isMissionAssetsStored,
	placeMissionAssets,
} from "../state/mission-assets-store";
import type { C2Feature } from "../types/c2-types";
import {
	assetFeatureTypes,
	buildAssetsDocument,
	importAsset,
	readAssetsDocument,
	removeAsset,
	upsertAsset,
} from "./mission-assets";
import { normalizeMissions } from "./mission-list";

function feature(
	id: string,
	type: string,
	extra: Partial<C2Feature> = {},
): C2Feature {
	return {
		type: "Feature",
		properties: { feature_id: id, feature_type: type, name: `${id} name` },
		geometry: { type: "Point", coordinates: [4.39, 50.84] },
		...extra,
	};
}

beforeEach(() => {
	__resetMissionAssetsStore();
});

describe("the assets document", () => {
	it("round-trips the map and the features, under <id>:assets", () => {
		const doc = buildAssetsDocument(
			"m1",
			{ map: "RMA", features: [feature("wp", "waypoint")] },
			new Date("2026-09-24T10:00:00Z"),
		);
		expect(doc.mission_id).toBe("m1:assets");
		expect(doc.mission_ref).toBe("m1");
		expect(doc.updated_at).toBe("2026-09-24T10:00:00.000Z");
		expect(readAssetsDocument(doc)).toEqual({
			map: "RMA",
			features: [feature("wp", "waypoint")],
		});
	});

	it("keeps only what the fog can read: asset types, with an id and a geometry, once, without _id", () => {
		const read = readAssetsDocument({
			mission_id: "m1:assets",
			map: "RMA",
			features: [
				feature("wp", "waypoint", { _id: "mongo" }),
				feature("wp", "waypoint"),
				feature("road", "road"),
				feature("", "zone"),
				{ ...feature("nogeo", "zone"), geometry: undefined },
			],
		});
		expect(read?.features.map((f) => f.properties?.feature_id)).toEqual([
			"wp",
		]);
		expect(read?.features[0]).not.toHaveProperty("_id");
	});

	it("is not a mission: the browser lists no row for it", () => {
		const rows = normalizeMissions([
			{ mission_id: "m1", name: "Alpha" },
			{ mission_id: "m1:graph", graph: {} },
			{ mission_id: "m1:assets", map: "RMA", features: [] },
		]);
		expect(rows.map((r) => r.mission_id)).toEqual(["m1"]);
	});

	it("reads nothing from a mission or a graph document", () => {
		expect(
			readAssetsDocument({ mission_id: "m1", features: [] }),
		).toBeNull();
		expect(readAssetsDocument({ mission_id: "m1:assets" })).toBeNull();
	});
});

describe("editing the assets", () => {
	it("imports a map feature as a copy under a new id", () => {
		const source = feature("map-wp", "waypoint", { _id: "mongo" });
		const { assets, id } = importAsset(
			{ map: "RMA", features: [] },
			source,
			"new-id",
		);
		expect(id).toBe("new-id");
		expect(assets.features[0]?.properties?.feature_id).toBe("new-id");
		expect(assets.features[0]?.properties?.name).toBe("map-wp name");
		expect(assets.features[0]).not.toHaveProperty("_id");
		// The source is untouched: editing the copy never moves the map's.
		expect(source.properties?.feature_id).toBe("map-wp");
	});

	it("upserts by id, removes by id, and types the targets", () => {
		let assets = upsertAsset(
			{ map: "RMA", features: [] },
			feature("z", "zone"),
		);
		assets = upsertAsset(assets, feature("wp", "waypoint"));
		assets = upsertAsset(assets, {
			...feature("z", "zone"),
			properties: { feature_id: "z", feature_type: "zone", name: "Z2" },
		});
		expect(assets.features).toHaveLength(2);
		expect(assetFeatureTypes(assets)).toEqual({
			z: "zone",
			wp: "waypoint",
		});
		expect(removeAsset(assets, "nope")).toBe(assets);
		expect(removeAsset(assets, "z").features).toHaveLength(1);
	});
});

describe("the assets store", () => {
	it("adopts a stored document as stored and clean", () => {
		adoptStoredAssets(
			"m1",
			[
				{
					mission_id: "m1:assets",
					map: "Park",
					features: [feature("wp", "waypoint")],
				},
			],
			"RMA",
		);
		expect(getMissionAssets("m1")?.map).toBe("Park");
		expect(isMissionAssetsStored("m1")).toBe(true);
		expect(isMissionAssetsDirty("m1")).toBe(false);
	});

	it("places a mission with no document on the fallback map, not stored", () => {
		adoptStoredAssets("m1", [{ mission_id: "m1" }], "RMA");
		expect(getMissionAssets("m1")).toEqual({ map: "RMA", features: [] });
		expect(isMissionAssetsStored("m1")).toBe(false);
	});

	it("places a mission once, without marking it dirty", () => {
		adoptStoredAssets("m1", [], "");
		placeMissionAssets("m1", "RMA");
		placeMissionAssets("m1", "Park");
		expect(getMissionAssets("m1")?.map).toBe("RMA");
		expect(isMissionAssetsDirty("m1")).toBe(false);
	});

	it("placing a STORED mission that has no map marks it dirty, so Save writes the fix", () => {
		adoptStoredAssets(
			"m1",
			[{ mission_id: "m1:assets", map: "", features: [] }],
			"",
		);
		expect(isMissionAssetsStored("m1")).toBe(true);
		placeMissionAssets("m1", "RMA");
		expect(isMissionAssetsDirty("m1")).toBe(true);
	});

	it("marks an edit dirty, and ignores an edit that changes nothing", () => {
		adoptStoredAssets("m1", [], "RMA");
		editMissionAssets("m1", (a) => removeAsset(a, "nope"));
		expect(isMissionAssetsDirty("m1")).toBe(false);
		editMissionAssets("m1", (a) =>
			upsertAsset(a, feature("wp", "waypoint")),
		);
		expect(isMissionAssetsDirty("m1")).toBe(true);
	});
});
