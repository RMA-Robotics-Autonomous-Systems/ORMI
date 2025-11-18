import { Eye, EyeOff, Layers, Target } from "lucide-react";
import { useState } from "react";
import { MapRef } from "react-map-gl/maplibre";
import { cn } from "@workspace/ui/lib/utils";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent } from "@workspace/ui/components/card";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { Slider } from "@workspace/ui/components/slider";

interface CustomLayer {
    name: string;
    url: string;
    opacity: number;
    visible: boolean;
    bounds?: [[number, number], [number, number]]; // Optional bounds: [[minLng, minLat], [maxLng, maxLat]]
}

export function CustomLayersOverlay({
    customLayers,
    mapRef,
    onLayerVisibilityChange,
    onLayerOpacityChange
}: {
    customLayers: CustomLayer[],
    mapRef?: React.RefObject<MapRef | null>,
    onLayerVisibilityChange: (layerIndex: number, visible: boolean) => void,
    onLayerOpacityChange: (layerIndex: number, opacity: number) => void
}) {
    const { items } = useButtonHolder();

    // Function to fetch bounds from TiTiler COG info endpoint
    const fetchCogBounds = async (baseUrl: string): Promise<[[number, number], [number, number]] | null> => {
        try {
            // Extract the COG URL from the tiles URL
            const cogMatch = baseUrl.match(/url=([^&]+)/);
            if (!cogMatch) return null;

            const cogUrl = decodeURIComponent(cogMatch[1] || '');
            const tiTilerBase = baseUrl.split('/cog/')[0];
            const infoUrl = `${tiTilerBase}/cog/info?url=${encodeURIComponent(cogUrl)}`;

            const response = await fetch(infoUrl);
            if (!response.ok) return null;

            const info = await response.json();
            if (info.bounds && info.bounds.length === 4) {
                return [
                    [info.bounds[0], info.bounds[1]], // [minLng, minLat]
                    [info.bounds[2], info.bounds[3]]  // [maxLng, maxLat]
                ];
            }
        } catch (error) {
            console.error('Error fetching COG bounds:', error);
        }
        return null;
    };

    // Function to extract bounds from various layer URL formats
    const getLayerBounds = async (layer: CustomLayer): Promise<[[number, number], [number, number]] | null> => {
        try {
            // First, check if bounds are explicitly provided
            if (layer.bounds) {
                return layer.bounds;
            }

            const url = layer.url;

            // Try to extract bounds from TiTiler COG URLs
            if (url.includes('cog/tiles/') || url.includes('cog/')) {
                return await fetchCogBounds(url);
            }

            // For WMS services, you could parse GetCapabilities
            if (url.includes('SERVICE=WMS') || url.includes('service=wms')) {
                // WMS bounds extraction could be implemented here
                return null;
            }

            // For other URL formats, we might not have bounds info
            // You could extend this to parse other formats or store bounds separately
            return null;
        } catch (error) {
            console.error('Error parsing layer bounds:', error);
            return null;
        }
    };

    // Function to handle centering on a layer
    const handleLayerCenter = async (layer: CustomLayer, index: number) => {
        if (!mapRef?.current) return;

        try {
            // First, try to get bounds from the layer URL
            const bounds = await getLayerBounds(layer);

            if (bounds) {
                // If we have bounds, fit the map to those bounds
                mapRef.current.fitBounds(bounds, {
                    padding: 50,
                    duration: 1000
                });
            } else {
                // If no bounds available, try to get them from the map layer itself
                const map = mapRef.current.getMap();
                const layerId = `custom-layer-${index}`;

                // Check if the layer exists in the map
                if (map.getLayer(layerId)) {
                    // For raster layers, we can try to get the source bounds
                    const source = map.getSource(`custom-layer-${index}`);

                    if (source && 'bounds' in source) {
                        const sourceBounds = (source as any).bounds;
                        if (sourceBounds && sourceBounds.length === 4) {
                            mapRef.current.fitBounds([
                                [sourceBounds[0], sourceBounds[1]],
                                [sourceBounds[2], sourceBounds[3]]
                            ], {
                                padding: 50,
                                duration: 1000
                            });
                            return;
                        }
                    }
                }

                // Fallback: If we can't determine bounds, just zoom to a reasonable level
                // and center on the current map center (or you could set a default location)
                const currentCenter = mapRef.current.getCenter();
                mapRef.current.flyTo({
                    center: [currentCenter.lng, currentCenter.lat],
                    zoom: Math.max(mapRef.current.getZoom(), 10),
                    duration: 1000
                });

                console.log(`Layer "${layer.name}" bounds not available. Consider adding bounds information.`);
            }
        } catch (error) {
            console.error('Error centering on layer:', error);
        }
    };

    if (!customLayers || customLayers.length === 0) {
        return null;
    }

    return (
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-2 mt-2">
            {customLayers.map((layer, index) => {
                const layerKey = `custom-layer-${index}`;
                return (
                    <div
                        key={layerKey}
                        className={cn(
                            "relative bg-background bg-muted/50 rounded transition-all duration-300 ease-in-out overflow-hidden",
                            "hover-expand-width-right flex items-center"
                        )}
                    >
                        {/* Sliding content - hidden by default, slides in on hover */}
                        <div className={cn(
                            "flex items-center min-w-0 flex-1 pl-3",
                            "slide-in-from-right"
                        )}>
                            <div className="flex items-center gap-3 justify-between min-w-0 w-full">
                                <div className="flex flex-col gap-1 min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="text-sm font-medium truncate cursor-pointer hover:text-primary transition-colors"
                                            onClick={() => handleLayerCenter(layer, index)}
                                            title={`Click to center map on "${layer.name}"`}
                                        >
                                            {layer.name}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="p-1 h-6 w-6"
                                            onClick={() => handleLayerCenter(layer, index)}
                                            title={`Center map on "${layer.name}"`}
                                        >
                                            <Target className="w-3 h-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="p-1 h-6 w-6"
                                            onClick={() => onLayerVisibilityChange(index, !layer.visible)}
                                        >
                                            {layer.visible ? (
                                                <Eye className="w-3 h-3" />
                                            ) : (
                                                <EyeOff className="w-3 h-3" />
                                            )}
                                        </Button>
                                    </div>

                                    {/* Opacity slider - only show when layer is visible */}
                                    {layer.visible && (
                                        <div className="flex items-center gap-2 w-full">
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                {Math.round(layer.opacity * 100)}%
                                            </span>
                                            <Slider
                                                value={[layer.opacity]}
                                                onValueChange={(value) => onLayerOpacityChange(index, value[0] ?? 0)}
                                                max={1}
                                                min={0}
                                                step={0.1}
                                                className="flex-1"
                                            />
                                        </div>
                                    )}
                                </div>

                                {items.has(layerKey) && (
                                    <div className="flex-shrink-0">
                                        {items.get(layerKey)?.component}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Always visible layer icon button - now on the right */}
                        <div className="flex-shrink-0 w-12 flex justify-center">
                            <Button
                                variant={"ghost"}
                                size="sm"
                                className="p-2"
                                onClick={() => handleLayerCenter(layer, index)}
                                title={`Click to center map on "${layer.name}"`}
                            >
                                <Layers
                                    className={cn(
                                        "w-6 h-6",
                                        layer.visible ? "text-primary" : "text-muted-foreground"
                                    )}
                                />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}