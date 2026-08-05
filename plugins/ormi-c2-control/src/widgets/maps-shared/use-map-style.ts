import { useMemo } from "react";
import type { StyleSpecification } from "react-map-gl/maplibre";

/**
 * Raster-base MapLibre style for the C2 map widget (F6).
 *
 * COPIED-AND-TRIMMED from `ormi-std-widgets`
 * (`src/widgets/maps/hooks/useMapStyle.ts`) — the std map internals are not
 * exported across the plugin boundary, so a small trimmed copy lives here. The
 * 3D-buildings and COG/custom-layer branches are dropped; the C2 map only needs
 * a single raster tile base under the feature / draw / overlay layers.
 *
 * @param mapUrl - A raster XYZ tile URL template (`{x}/{y}/{z}`).
 * @returns A MapLibre `StyleSpecification` with a single raster base layer.
 */
export function useMapStyle(mapUrl: string): StyleSpecification {
	return useMemo<StyleSpecification>(
		() => ({
			version: 8,
			sources: {
				"raster-tiles": {
					type: "raster",
					tiles: [mapUrl],
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
		}),
		[mapUrl],
	);
}
