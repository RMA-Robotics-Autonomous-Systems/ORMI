import { useMemo } from "react";
import { StyleSpecification } from "react-map-gl/maplibre";
import {
	ORMI_BUILDINGS_3D_LAYER,
	ORMI_STYLE_ANCHORS,
	applyBasemapKey,
	basemapMaxSourceZoom,
	insertLayersAt,
	isVectorBasemap,
	vectorBasemapStyleId,
} from "@workspace/utils";
import { createVectorBasemapStyle } from "@workspace/utils/basemap-style";
import { GridUtils } from "../gps-components/maps-grid";

/**
 * Id of the grid layer every built style carries (its opacity follows the
 * grid toggle). The map widget inserts its raster overlays under it when the
 * style has no overlay anchor (every raster basemap).
 */
export const GRID_LAYER_ID = "grid-layer";

/**
 * Props for useMapStyle.
 */
interface UseMapStyleProps {
	mapUrl: string;
	/** Operator-supplied key for basemaps that require one (Carto, Stadia). */
	basemapApiKey?: string;
	use3D: boolean;
	apiKey?: string;
	showGrid: boolean;
}

/**
 * Generates the MapLibre style specification: basemap, grid and 3D buildings.
 *
 * Map-server raster layers are NOT part of the style: they are declarative
 * `<RasterOverlayLayers>` children inserted under {@link GRID_LAYER_ID} (or the
 * overlay anchor, when the style has one), so switching a layer never
 * rebuilds the style.
 *
 * Two branches, picked on the persisted `mapUrl`:
 * - a **vector** sentinel selects an ORMI-bundled style, whose anchor layers
 *   place the grid under the basemap's labels, and whose own `building-3d`
 *   layer serves the 3D toggle — no MapTiler key needed;
 * - anything else is a **raster** XYZ template and takes the original path.
 *   That style carries no anchors, so `insertLayersAt` appends: base tiles,
 *   grid.
 *
 * @param props - Hook props.
 * @returns MapLibre style specification or undefined.
 */
export function useMapStyle({
	mapUrl,
	basemapApiKey,
	use3D,
	apiKey,
	showGrid,
}: UseMapStyleProps): StyleSpecification | undefined {
	return useMemo(() => {
		const gridSource = {
			type: "geojson" as const,
			data: GridUtils.createGridLines([-180, -85, 180, 85], 1000),
		};

		// `showGrid` drives the paint opacity rather than adding/removing the
		// layer: on a vector basemap a structural diff across 100+ layers is far
		// more expensive than a single paint property change.
		const gridLayer = {
			id: GRID_LAYER_ID,
			type: "line",
			source: "grid",
			layout: {
				"line-join": "round",
				"line-cap": "round",
			},
			paint: {
				"line-color": "#888888",
				"line-width": 1,
				"line-opacity": showGrid ? 0.5 : 0,
			},
		};

		/**
		 * Slot the grid into a style at the graticule anchor; appends when the
		 * style has no anchors (every raster basemap).
		 */
		const withOverlays = (
			style: StyleSpecification,
		): StyleSpecification => ({
			...style,
			layers: insertLayersAt(style.layers, ORMI_STYLE_ANCHORS.graticule, [
				gridLayer as never,
			]),
		});

		// --- Vector basemap: an ORMI-bundled style, fresh copy per call ------
		const vectorStyleId = isVectorBasemap(mapUrl)
			? vectorBasemapStyleId(mapUrl)
			: undefined;
		if (vectorStyleId) {
			const vectorStyle = createVectorBasemapStyle(vectorStyleId);
			return withOverlays({
				...vectorStyle,
				sources: {
					...vectorStyle.sources,
					grid: gridSource,
				},
				layers: vectorStyle.layers.map((layer) =>
					layer.id === ORMI_BUILDINGS_3D_LAYER
						? {
								...layer,
								layout: {
									...layer.layout,
									visibility: use3D ? "visible" : "none",
								},
							}
						: layer,
				) as StyleSpecification["layers"],
			});
		}

		// --- Raster basemap: the original XYZ path ---------------------------
		// Two zoom limits, and only one of them belongs on the layer.
		//
		// The SOURCE declares how deep the vendor actually publishes, so
		// MapLibre stops asking for tiles that 404 and overzooms the deepest
		// real level instead — soft imagery rather than a blank map on the way
		// in. An unknown url (an operator's own tile server) declares nothing
		// and keeps MapLibre's default.
		//
		// The LAYER declares nothing at all. A layer `maxzoom` HIDES the layer
		// at and above that zoom: the `22` that used to sit here made the
		// basemap vanish entirely past z22, which is the hard ceiling this
		// change is lifting.
		const sourceMaxZoom = basemapMaxSourceZoom(mapUrl);
		const baseStyle = withOverlays({
			version: 8,
			sources: {
				"raster-tiles": {
					type: "raster",
					tiles: [applyBasemapKey(mapUrl, basemapApiKey)],
					...(sourceMaxZoom !== undefined && {
						maxzoom: sourceMaxZoom,
					}),
				},
				grid: gridSource,
			},
			layers: [
				{
					id: "simple-tiles",
					type: "raster",
					source: "raster-tiles",
					minzoom: 0,
				},
			],
		});

		// Add 3D buildings if enabled. A raster basemap carries no vector
		// geometry, so the extrusions need a vector source of their own — hence
		// the MapTiler key. The vector branch above has one already.
		if (use3D && apiKey) {
			return {
				...baseStyle,
				sources: {
					...baseStyle.sources,
					openmaptiles: {
						type: "vector",
						url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${apiKey}`,
					},
				},
				layers: [
					...baseStyle.layers,
					{
						id: "3d-buildings",
						source: "openmaptiles",
						"source-layer": "building",
						type: "fill-extrusion",
						minzoom: 15,
						filter: ["!=", ["get", "hide_3d"], true],
						paint: {
							"fill-extrusion-color": [
								"interpolate",
								["linear"],
								["get", "render_height"],
								0,
								"lightgray",
								200,
								"royalblue",
								400,
								"lightblue",
							],
							"fill-extrusion-height": [
								"interpolate",
								["linear"],
								["zoom"],
								15,
								0,
								16,
								["get", "render_height"],
							],
							"fill-extrusion-base": [
								"case",
								[">=", ["get", "zoom"], 16],
								["get", "render_min_height"],
								0,
							],
						},
					},
				],
			};
		}

		return baseStyle;
	}, [mapUrl, basemapApiKey, use3D, apiKey, showGrid]);
}
