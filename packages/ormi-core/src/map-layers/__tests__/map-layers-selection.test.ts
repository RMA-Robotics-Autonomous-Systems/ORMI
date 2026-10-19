import { describe, expect, it } from "bun:test";
import { createAjv } from "@jsonforms/core";

import { mapLayersProperty } from "../map-layers-property";
import {
	buildMapLayerSelectView,
	describeStaleMapLayerRef,
	filterMapLayerRows,
	removeMapLayerRef,
	setMapLayerEnabled,
	setMapLayerOpacity,
} from "../map-layers-selection";
import { mapLayerHealthKey } from "../map-servers-store";
import {
	FIELD,
	GEO_KEY,
	PROVIDERS,
	ROAD,
	SWEDEN,
	XYZ_KEY,
	entry,
	geoServer,
	xyzAdapter,
	xyzServer,
} from "./map-layers-fixtures";

describe("mapLayersProperty", () => {
	it("is valid on open with [] and carries the marker, never format", () => {
		const schema = {
			type: "object",
			properties: {
				mapLayers: mapLayersProperty({ title: "Map layers" }),
			},
		};
		const validate = createAjv().compile(schema);
		expect(validate({ mapLayers: [] })).toBe(true);
		expect(validate({})).toBe(true);
		const property = schema.properties.mapLayers as unknown as Record<
			string,
			unknown
		>;
		expect(property.mapLayersSelect).toEqual({});
		expect(property.format).toBeUndefined();
	});

	it("accepts a stored ref to a server that no longer exists", () => {
		const validate = createAjv().compile({
			type: "object",
			properties: {
				mapLayers: mapLayersProperty({ title: "Map layers" }),
			},
		});
		expect(
			validate({
				mapLayers: [
					{
						serverKey: "gone:x",
						layerId: "y",
						enabled: true,
						opacity: 0.4,
					},
				],
			}),
		).toBe(true);
	});
});

describe("map layer edits", () => {
	it("first switch-on creates { enabled: true, opacity: 1 }", () => {
		expect(setMapLayerEnabled([], GEO_KEY, ROAD, true)).toEqual([
			{ serverKey: GEO_KEY, layerId: ROAD, enabled: true, opacity: 1 },
		]);
	});

	it("switch-off keeps the ref and its opacity", () => {
		const stored = [
			{ serverKey: GEO_KEY, layerId: ROAD, enabled: true, opacity: 0.35 },
		];
		const next = setMapLayerEnabled(stored, GEO_KEY, ROAD, false);
		expect(next).toEqual([
			{
				serverKey: GEO_KEY,
				layerId: ROAD,
				enabled: false,
				opacity: 0.35,
			},
		]);
		expect(stored[0]!.enabled).toBe(true);
		// Back on keeps the opacity too.
		expect(setMapLayerEnabled(next, GEO_KEY, ROAD, true)).toEqual([
			{ serverKey: GEO_KEY, layerId: ROAD, enabled: true, opacity: 0.35 },
		]);
	});

	it("switching off an untouched layer writes nothing new", () => {
		expect(setMapLayerEnabled([], GEO_KEY, ROAD, false)).toEqual([]);
	});

	it("opacity is clamped and only touches an existing ref", () => {
		const stored = [
			{ serverKey: GEO_KEY, layerId: ROAD, enabled: true, opacity: 1 },
		];
		expect(setMapLayerOpacity(stored, GEO_KEY, ROAD, 1.7)[0]).toMatchObject(
			{
				opacity: 1,
			},
		);
		expect(
			setMapLayerOpacity(stored, GEO_KEY, ROAD, 0.25)[0],
		).toMatchObject({
			opacity: 0.25,
		});
		expect(setMapLayerOpacity(stored, GEO_KEY, FIELD, 0.5)).toEqual(stored);
	});

	it("carries unrecognised items through every edit", () => {
		const odd = { something: "else" };
		const stored = [odd];
		expect(setMapLayerEnabled(stored, GEO_KEY, ROAD, true)[0]).toBe(odd);
		expect(removeMapLayerRef(stored, GEO_KEY, ROAD)).toEqual([odd]);
	});

	it("remove drops only the named ref", () => {
		const stored = [
			{ serverKey: "gone:x", layerId: "a", enabled: true, opacity: 1 },
			{ serverKey: GEO_KEY, layerId: ROAD, enabled: true, opacity: 1 },
		];
		expect(removeMapLayerRef(stored, "gone:x", "a")).toEqual([stored[1]]);
	});
});

describe("buildMapLayerSelectView", () => {
	it("groups per server in registry order with one row per catalogue layer", () => {
		const view = buildMapLayerSelectView(
			[geoServer(), xyzServer],
			[
				{
					serverKey: GEO_KEY,
					layerId: ROAD,
					enabled: true,
					opacity: 0.5,
				},
			],
			PROVIDERS,
		);
		expect(view.groups.map((g) => g.server.serverKey)).toEqual([
			GEO_KEY,
			XYZ_KEY,
		]);
		expect(view.groups[0]!.typeName).toBe("GeoServer");
		expect(view.groups[0]!.rows.map((r) => r.entry.id)).toEqual([
			FIELD,
			ROAD,
			SWEDEN,
		]);
		expect(view.groups[0]!.rows[1]!.ref?.opacity).toBe(0.5);
		expect(view.groups[0]!.rows[0]!.ref).toBeUndefined();
		expect(view.stale).toEqual([]);
	});

	it("lists a not-Web-Mercator layer as unselectable", () => {
		const view = buildMapLayerSelectView([geoServer()], [], PROVIDERS);
		const sweden = view.groups[0]!.rows.find((r) => r.entry.id === SWEDEN);
		expect(sweden?.selectable).toBe(false);
	});

	it("names every stale kind and keeps it as saved", () => {
		const refs = [
			{
				serverKey: "geoserver:http://gone",
				layerId: "a",
				enabled: true,
				opacity: 0.2,
			},
			{
				serverKey: GEO_KEY,
				layerId: "removed",
				enabled: false,
				opacity: 0.7,
			},
			{ serverKey: XYZ_KEY, layerId: "rail", enabled: true, opacity: 1 },
		];
		// The xyz adapter is not registered in this build.
		const view = buildMapLayerSelectView(
			[geoServer(), xyzServer],
			refs,
			PROVIDERS.filter((p) => p !== xyzAdapter),
		);
		expect(view.stale.map((s) => s.kind)).toEqual([
			"missing-layer",
			"adapter-unavailable",
			"missing-server",
		]);
		expect(view.stale.map((s) => s.ref)).toEqual([
			refs[1]!,
			refs[2]!,
			refs[0]!,
		]);
		expect(view.stale.map(describeStaleMapLayerRef)).toEqual([
			"Layer not on Lab GeoServer",
			"Server type not available (xyz)",
			"Server not registered (geoserver:http://gone)",
		]);
		const xyzGroup = view.groups.find(
			(g) => g.server.serverKey === XYZ_KEY,
		);
		expect(xyzGroup?.adapterAvailable).toBe(false);
		expect(xyzGroup?.rows).toEqual([]);
	});

	it("carries health onto the row", () => {
		const view = buildMapLayerSelectView(
			[geoServer()],
			[{ serverKey: GEO_KEY, layerId: ROAD, enabled: true, opacity: 1 }],
			PROVIDERS,
			new Map([
				[mapLayerHealthKey(GEO_KEY, ROAD), "not-responding" as const],
			]),
		);
		expect(view.groups[0]!.rows[1]!.health).toBe("not-responding");
	});

	it("filters rows by title or id", () => {
		const rows = buildMapLayerSelectView(
			[
				{
					...xyzServer,
					catalog: [entry("a", { title: "Rail" }), entry("road_b")],
				},
			],
			[],
			PROVIDERS,
		).groups[0]!.rows;
		expect(filterMapLayerRows(rows, "rail").map((r) => r.entry.id)).toEqual(
			["a"],
		);
		expect(filterMapLayerRows(rows, "ROAD").map((r) => r.entry.id)).toEqual(
			["road_b"],
		);
		expect(filterMapLayerRows(rows, " ")).toHaveLength(2);
	});
});
