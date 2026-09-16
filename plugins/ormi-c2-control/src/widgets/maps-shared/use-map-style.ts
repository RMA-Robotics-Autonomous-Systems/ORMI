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
 * 3D buildings are NOT toggled here: C2 extrudes its own GeoJSON footprints
 * (`Buildings3DLayer`), so the bundled styles' `building-3d` layer stays hidden
 * exactly as it ships.
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
	return useMemo<StyleSpecification>(() => {
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
	}, [mapUrl, basemapApiKey]);
}
