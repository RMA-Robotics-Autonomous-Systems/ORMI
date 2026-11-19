import { beforeEach, describe, expect, it } from "bun:test";
import {
	__resetMapLayersStore,
	focusMapFeature,
	getMapLayers,
	groupByLayer,
	publishLayerFeatures,
	subscribeMapFeatureFocus,
	toggleLayerHidden,
	toggleLayerLocked,
	type MapFeatureFocusRequest,
} from "./map-layers-store";

const features = [
	{ featureId: "g", name: "geofence", featureType: "geofence" },
	{ featureId: "r2", name: "Track B", featureType: "road" },
	{ featureId: "r1", name: "Track A", featureType: "road" },
	{ featureId: "d", name: "danger1", featureType: "risk" },
];

describe("map-layers-store", () => {
	beforeEach(() => __resetMapLayersStore());

	it("lists every layer, roads before the geofence that covers them", () => {
		const groups = groupByLayer(features);
		expect(groups.map(([type]) => type)).toEqual([
			"road",
			"risk",
			"geofence",
		]);
		expect(groups[0]?.[1].map((f) => f.name)).toEqual([
			"Track A",
			"Track B",
		]);
	});

	it("keeps hidden and locked layers across a republish of the same map", () => {
		publishLayerFeatures("Inta", features);
		toggleLayerLocked("geofence");
		toggleLayerHidden("risk");
		publishLayerFeatures("Inta", features.slice(1));
		expect(getMapLayers().locked.has("geofence")).toBe(true);
		expect(getMapLayers().hidden.has("risk")).toBe(true);
	});

	it("resets hidden and locked layers on another map", () => {
		publishLayerFeatures("Inta", features);
		toggleLayerLocked("geofence");
		publishLayerFeatures("Other", features);
		expect(getMapLayers().locked.size).toBe(0);
	});

	it("keeps the same snapshot when nothing changed", () => {
		publishLayerFeatures("Inta", features);
		const before = getMapLayers();
		publishLayerFeatures("Inta", [...features]);
		expect(getMapLayers()).toBe(before);
	});

	it("unhides and unlocks the layer of a feature asked for by name", () => {
		publishLayerFeatures("Inta", features);
		toggleLayerHidden("road");
		toggleLayerLocked("road");
		const seen: MapFeatureFocusRequest[] = [];
		subscribeMapFeatureFocus((request) => seen.push(request));
		focusMapFeature("r1");
		expect(getMapLayers().hidden.has("road")).toBe(false);
		expect(getMapLayers().locked.has("road")).toBe(false);
		expect(seen).toEqual([{ map: "Inta", featureId: "r1", seq: 1 }]);
	});
});
