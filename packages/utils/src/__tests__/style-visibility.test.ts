/**
 * `setLayerVisibility` — the in-place layer flip both map widgets' 3D toggles
 * ultimately go through.
 *
 * It exists instead of rewriting the style object because a new style makes
 * react-map-gl call `setStyle(next, { diff: true })`, and MapLibre's diff
 * removes every source and layer that was added imperatively rather than
 * declared in the spec. On the C2 mission map those are terra-draw's `td-*`
 * layers, which the adapter adds once in `register()` and never re-adds, so the
 * authoring tool would disappear on a 3D toggle and its next `setData` would
 * throw on the missing source.
 */

import { describe, expect, it } from "bun:test";
import { ORMI_BUILDINGS_3D_LAYER, setLayerVisibility } from "../style-layers";

/** A map stub recording what was set on it. */
function fakeMap(layers: Record<string, string | undefined>) {
	const calls: Array<[string, string, unknown]> = [];
	return {
		calls,
		getLayer: (id: string) => (id in layers ? { id } : undefined),
		getLayoutProperty: (id: string, name: string) =>
			name === "visibility" ? layers[id] : undefined,
		setLayoutProperty: (id: string, name: string, value: unknown) => {
			calls.push([id, name, value]);
			if (name === "visibility") layers[id] = String(value);
		},
	};
}

describe("setLayerVisibility", () => {
	it("shows a hidden layer", () => {
		const map = fakeMap({ [ORMI_BUILDINGS_3D_LAYER]: "none" });
		expect(setLayerVisibility(map, ORMI_BUILDINGS_3D_LAYER, true)).toBe(
			true,
		);
		expect(map.calls).toEqual([
			[ORMI_BUILDINGS_3D_LAYER, "visibility", "visible"],
		]);
	});

	it("hides a visible layer", () => {
		const map = fakeMap({ [ORMI_BUILDINGS_3D_LAYER]: "visible" });
		setLayerVisibility(map, ORMI_BUILDINGS_3D_LAYER, false);
		expect(map.calls).toEqual([
			[ORMI_BUILDINGS_3D_LAYER, "visibility", "none"],
		]);
	});

	it("does nothing when the layer already has the requested visibility", () => {
		// `styledata` fires repeatedly, and the flip is re-applied on every one
		// of them; re-setting an unchanged layout property still walks the layer
		// and schedules a repaint.
		const map = fakeMap({ [ORMI_BUILDINGS_3D_LAYER]: "visible" });
		expect(setLayerVisibility(map, ORMI_BUILDINGS_3D_LAYER, true)).toBe(
			true,
		);
		expect(map.calls).toEqual([]);
	});

	it("reports a no-op for a layer the style does not have", () => {
		// Every raster basemap. This is what keeps raster and vector one code
		// path in the widget: no basemap branch around the call.
		const map = fakeMap({ "simple-tiles": undefined });
		expect(setLayerVisibility(map, ORMI_BUILDINGS_3D_LAYER, true)).toBe(
			false,
		);
		expect(map.calls).toEqual([]);
	});
});
