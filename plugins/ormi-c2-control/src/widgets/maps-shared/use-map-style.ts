import { useMemo } from "react";
import type { StyleSpecification } from "react-map-gl/maplibre";
import {
	applyBasemapKey,
	isVectorBasemap,
	vectorBasemapStyleId,
} from "@workspace/utils";
import { createVectorBasemapStyle } from "@workspace/utils/basemap-style";

/**
 * MapLibre style for the C2 map widget (F6) — raster XYZ tiles, or one of
 * ORMI's bundled vector styles.
 *
 * COPIED-AND-TRIMMED from `ormi-std-widgets`
 * (`src/widgets/maps/hooks/useMapStyle.ts`) — the std map internals are not
 * exported across the plugin boundary, so a small trimmed copy lives here. The
 * COG/custom-layer branch is dropped; the C2 map only needs a base map under
 * the feature / draw / overlay layers.
 *
 * 3D buildings come from whichever source the basemap can actually answer with,
 * and the two are not interchangeable:
 *
 * - on a **vector** basemap the geometry is already on the wire, so the style's
 *   own `building-3d` layer (shipped hidden) is flipped visible — no fetch, real
 *   `render_height` / `render_min_height` per building, and it follows the view
 *   as the operator pans;
 * - on a **raster** basemap there is no vector geometry to extrude, so the
 *   widget keeps its Overpass path (`Buildings3DLayer` over
 *   `osmBuildingsToExtrusionFc`) — one fetch scoped to the picked geofence or
 *   the view at toggle time, with tag-derived heights.
 *
 * The widget must therefore not run both: see the fetch effect in
 * `mission-map.tsx`, which stands down when the basemap carries buildings.
 *
 * **Neither path is a property of this style.** The vector flip is applied to the
 * live map through `setLayerVisibility`, deliberately *not* by returning a style
 * whose `building-3d` is visible: a new style object makes react-map-gl call
 * `setStyle(next, { diff: true })`, and that diff removes every source and layer
 * added imperatively — terra-draw's `td-*` among them, which nothing re-adds.
 * Toggling 3D would take the authoring tool with it. So this style depends on
 * the basemap and the key, and on nothing the operator toggles.
 *
 * The return type is non-optional — a widget config always resolves to a style,
 * falling back to the raster path for any value that is not a vector sentinel.
 *
 * @param mapUrl - A raster XYZ tile URL template (`{x}/{y}/{z}`), or an
 *   `ormi:vector/...` sentinel naming a bundled vector style.
 * @param basemapApiKey - Operator-supplied key, appended only for the raster
 *   basemap providers that require one (Carto, Stadia Maps).
 * @returns A MapLibre `StyleSpecification`; for vector basemaps a FRESH deep
 *   copy, never a shared object.
 */
export function useMapStyle(
	mapUrl: string,
	basemapApiKey?: string,
): StyleSpecification {
	return useMemo<StyleSpecification>(
		() => buildMapStyle(mapUrl, basemapApiKey),
		[mapUrl, basemapApiKey],
	);
}

/**
 * The style itself, as a pure function — which is how the two branches are
 * tested (a hook would need a renderer for what is a plain object transform).
 *
 * @param mapUrl - Raster XYZ template, or an `ormi:vector/...` sentinel.
 * @param basemapApiKey - Key for the raster providers that require one.
 * @returns A MapLibre `StyleSpecification`, freshly built on every call. Its
 *   `building-3d` layer is left exactly as the bundled style ships it (hidden);
 *   the widget flips it on the live map.
 */
export function buildMapStyle(
	mapUrl: string,
	basemapApiKey?: string,
): StyleSpecification {
	const vectorStyleId = isVectorBasemap(mapUrl)
		? vectorBasemapStyleId(mapUrl)
		: undefined;
	if (vectorStyleId) return createVectorBasemapStyle(vectorStyleId);

	return {
		version: 8,
		sources: {
			"raster-tiles": {
				type: "raster",
				tiles: [applyBasemapKey(mapUrl, basemapApiKey)],
				tileSize: 256,
			},
		},
		layers: [
			{
				id: "simple-tiles",
				type: "raster",
				source: "raster-tiles",
				minzoom: 0,
				maxzoom: 22,
			},
		],
	};
}
