/**
 * Anchor contract for ORMI's bundled MapLibre basemap styles, plus the two
 * helpers that make it safe to use.
 *
 * ORMI's vector styles carry four no-op "anchor" layers at documented seams of
 * the layer stack. Widget code inserts its own layers *before* an anchor rather
 * than at a hardcoded index, so a style can gain or lose layers upstream
 * without silently reordering the map.
 *
 * Raster styles carry no anchors at all, which is the point: both helpers
 * degrade to today's append-at-the-end behaviour when the anchor is absent, so
 * a dashboard on a raster basemap renders exactly as it did before anchors
 * existed.
 *
 * Dependency-free by design (no React, no MapLibre runtime import) — this is a
 * pure array/lookup module that widget code, tests and workers can all use.
 */

/**
 * The anchor layer ids every ORMI-bundled vector style provides, in bottom-to-top
 * stacking order.
 *
 * - `imagery`   — above the basemap background, below the basemap's own vector
 *   geometry; for full-coverage imagery that should read as part of the base.
 * - `overlay`   — above all basemap geometry, below the basemap's label stack;
 *   for raster overlays and COG/TiTiler layers, which must not bury place names.
 * - `graticule` — directly above `overlay`; for the coordinate grid.
 * - `top`       — the last layer of the style; inserting here puts a layer above
 *   the basemap's labels.
 */
export const ORMI_STYLE_ANCHORS = {
	imagery: "ormi-anchor-imagery",
	overlay: "ormi-anchor-overlay",
	graticule: "ormi-anchor-graticule",
	top: "ormi-anchor-top",
} as const;

/**
 * Layer id of the 3D building extrusion every ORMI-bundled vector style carries.
 *
 * It ships with `layout.visibility: "none"` and is flipped to `"visible"` by
 * whichever widget owns the operator's 3D toggle — which is why the id lives
 * here rather than as a literal in each map widget: it is a property of the
 * bundled styles, so a rename upstream is one edit here instead of two silent
 * no-ops that leave two toggles doing nothing. It is a string constant, not a
 * type, so nothing about that rename is caught at compile time; what catches it
 * is `packages/utils/src/__tests__/basemap-styles.test.ts`, which looks the
 * layer up through this constant.
 *
 * Only vector styles have it. A raster basemap carries no vector geometry to
 * extrude, so a widget wanting 3D buildings over raster tiles has to bring its
 * own footprints (a MapTiler source, or fetched polygons).
 */
export const ORMI_BUILDINGS_3D_LAYER = "building-3d";

/**
 * The slice of a MapLibre map this module needs to flip a layer's visibility.
 *
 * Structural, so this module keeps its no-MapLibre-import property: any object
 * with these three methods will do, which is also what makes the helper below
 * unit-testable against a fake.
 */
export interface LayerVisibilityTarget {
	getLayer(id: string): unknown;
	getLayoutProperty(id: string, name: string): unknown;
	setLayoutProperty(id: string, name: string, value: unknown): void;
}

/**
 * Show or hide a style layer on a **live** map, in place.
 *
 * Why in place, rather than rewriting the style object the widget renders: a new
 * style object makes react-map-gl call `map.setStyle(next, { diff: true })`, and
 * MapLibre diffs the *serialized current style* — which enumerates every source
 * and layer added imperatively — against the new spec, emitting a remove for
 * everything the spec does not contain. react-map-gl's own `<Source>` /
 * `<Layer>` children re-add themselves on the style event, but a third-party
 * library that added its layers once and listens for no style event does not:
 * terra-draw's `td-*` layers go, and its next `setData` throws on the missing
 * source. So a map that hosts imperative layers flips visibility here and keeps
 * its style object stable; a map that hosts none may do it in the style.
 *
 * Absent layer is a no-op, not an error: a raster basemap legitimately has no
 * such layer, which is what keeps raster and vector one code path.
 *
 * @param map - The live map (or any {@link LayerVisibilityTarget}).
 * @param layerId - The layer to show or hide.
 * @param visible - Whether it should be visible.
 * @returns True when the layer existed and now has the requested visibility.
 */
export function setLayerVisibility(
	map: LayerVisibilityTarget,
	layerId: string,
	visible: boolean,
): boolean {
	if (!map.getLayer(layerId)) return false;
	const want = visible ? "visible" : "none";
	// Read first: `styledata` fires repeatedly, and re-setting an unchanged
	// layout property still walks the layer and schedules a repaint.
	if (map.getLayoutProperty(layerId, "visibility") === want) return true;
	map.setLayoutProperty(layerId, "visibility", want);
	return true;
}

/** One of the four {@link ORMI_STYLE_ANCHORS} layer ids. */
export type OrmiStyleAnchor =
	(typeof ORMI_STYLE_ANCHORS)[keyof typeof ORMI_STYLE_ANCHORS];

/**
 * Insert layers immediately *before* an anchor layer, or append them when the
 * anchor is absent.
 *
 * @param layers - The style's current layer array; never mutated.
 * @param anchorId - The anchor layer id to insert before, normally one of
 *   {@link ORMI_STYLE_ANCHORS}.
 * @param inserted - The layers to insert, in their own stacking order.
 * @returns A new array; the input array and its elements are untouched.
 */
export function insertLayersAt<L extends { id: string }>(
	layers: readonly L[],
	anchorId: string,
	inserted: readonly L[],
): L[] {
	if (inserted.length === 0) return [...layers];

	const at = layers.findIndex((layer) => layer.id === anchorId);
	if (at === -1) return [...layers, ...inserted];

	return [...layers.slice(0, at), ...inserted, ...layers.slice(at)];
}

/**
 * Resolve an anchor id to a `beforeId` value for `map.addLayer` / react-map-gl's
 * `<Layer beforeId>`.
 *
 * MapLibre THROWS when `beforeId` names a layer the style does not contain, and
 * raster basemaps contain no anchors — so widget code must never pass a bare
 * anchor constant. `undefined` means "append", which is the pre-anchor
 * behaviour and exactly what a raster basemap should get.
 *
 * @param style - The style the layer will be added to, if any.
 * @param anchorId - The anchor layer id being requested.
 * @returns The anchor id when the style actually contains it, else `undefined`.
 */
export function resolveAnchor(
	style: { layers?: readonly { id: string }[] } | undefined | null,
	anchorId: string,
): string | undefined {
	return style?.layers?.some((layer) => layer.id === anchorId)
		? anchorId
		: undefined;
}
