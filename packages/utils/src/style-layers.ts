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
