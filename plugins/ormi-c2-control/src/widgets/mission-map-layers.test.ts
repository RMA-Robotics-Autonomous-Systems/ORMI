/**
 * The mission map's map-server layer selection.
 *
 * Raster layers come from the user's map servers through `mapLayers`, a
 * `MapLayerRef[]` the core renderer edits. Two properties matter here: the
 * dialog is valid on open (an empty array in `data`, never `required`), and
 * the retired `overlays` setting is gone from the schema, so a stored value
 * is an undeclared leftover rather than a choice the dialog still offers.
 */

import { describe, expect, it } from "bun:test";
import { hasMapLayersSelectMarker } from "@workspace/ormi-core/map-layers";

import { MissionMapDefinition } from "./mission-map";
import { defaultMissionControl } from "../page/default-mission-control";

type Schema = {
	properties: Record<string, unknown>;
	required?: string[];
};

type UiElement = { scope?: string };

describe("mission map definition", () => {
	const definition = MissionMapDefinition();
	const schema = definition.schema as unknown as Schema;

	it("declares mapLayers as a marked map-layer selection", () => {
		expect(hasMapLayersSelectMarker(schema.properties.mapLayers)).toBe(
			true,
		);
	});

	it("is valid on open: [] in data, never required", () => {
		expect(definition.data.mapLayers).toEqual([]);
		expect(schema.required ?? []).not.toContain("mapLayers");
	});

	it("shows mapLayers in the configuration dialog", () => {
		const elements = (
			definition.uischema as unknown as { elements: UiElement[] }
		).elements;
		expect(elements.map((e) => e.scope)).toContain(
			"#/properties/mapLayers",
		);
	});

	it("no longer declares the retired overlays setting", () => {
		expect(schema.properties.overlays).toBeUndefined();
		expect("overlays" in definition.data).toBe(false);
	});

	it("is seeded on the C2 page with an empty selection", () => {
		const map = [...defaultMissionControl().widgets.values()].find(
			(w) => w.widget_id === "c2-mission-map-widget",
		);
		expect(map?.settings.mapLayers).toEqual([]);
	});
});
