import { useMemo } from "react";
import { StyleSpecification } from "react-map-gl/maplibre";
import { GridUtils } from "../maps-grid";

interface CustomLayer {
    name: string;
    url: string;
    opacity: number;
    visible: boolean;
    bounds?: [[number, number], [number, number]];
}

interface UseMapStyleProps {
    mapUrl: string;
    use3D: boolean;
    apiKey?: string;
    customLayers: CustomLayer[];
    showGrid: boolean;
}

/**
 * Hook to generate MapLibre style specification
 * Handles base raster tiles, custom layers, grid, and 3D buildings
 */
export function useMapStyle({
    mapUrl,
    use3D,
    apiKey,
    customLayers,
    showGrid,
}: UseMapStyleProps): StyleSpecification | undefined {
    return useMemo(() => {
        // Generate custom layer sources and layers
        const customSources: { [key: string]: any } = {};
        const customLayersData: any[] = [];

        customLayers.forEach((layer, index) => {
            if (layer.url && layer.visible) {
                const sourceId = `custom-layer-${index}`;
                const layerId = `custom-layer-${index}`;

                // Determine source type based on URL
                if (layer.url.startsWith("cog://")) {
                    // COG protocol source
                    customSources[sourceId] = {
                        type: "raster",
                        url: layer.url,
                    };
                } else if (
                    layer.url.includes("{z}") &&
                    layer.url.includes("{x}") &&
                    layer.url.includes("{y}")
                ) {
                    // Standard tile template - fix TiTiler URL format
                    let tileUrl = layer.url;
                    if (
                        layer.url.includes("cog/tiles/") &&
                        !layer.url.includes("WebMercatorQuad")
                    ) {
                        tileUrl = layer.url.replace(
                            "cog/tiles/",
                            "cog/tiles/WebMercatorQuad/"
                        );
                        tileUrl = tileUrl.replace(".png", "");
                    }
                    customSources[sourceId] = {
                        type: "raster",
                        tiles: [tileUrl],
                        tileSize: 256,
                    };
                } else {
                    customSources[sourceId] = {
                        type: "raster",
                        url: layer.url,
                    };
                }

                customLayersData.push({
                    id: layerId,
                    type: "raster",
                    source: sourceId,
                    paint: {
                        "raster-opacity": layer.opacity || 1,
                    },
                });
            }
        });

        // Base style configuration
        const baseStyle: StyleSpecification = {
            version: 8,
            sources: {
                "raster-tiles": {
                    type: "raster",
                    tiles: [mapUrl],
                },
                grid: {
                    type: "geojson",
                    data: GridUtils.createGridLines([-180, -85, 180, 85], 1000),
                },
                ...customSources,
            },
            layers: [
                {
                    id: "simple-tiles",
                    type: "raster",
                    source: "raster-tiles",
                    minzoom: 0,
                    maxzoom: 22,
                },
                ...customLayersData,
                {
                    id: "grid-layer",
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
                },
            ],
        };

        // Add 3D buildings if enabled
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
    }, [mapUrl, use3D, apiKey, customLayers, showGrid]);
}
