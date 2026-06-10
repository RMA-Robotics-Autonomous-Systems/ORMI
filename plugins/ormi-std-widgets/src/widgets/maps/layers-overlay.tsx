"use client";

import { Layers, Target } from "lucide-react";
import { MapRef } from "react-map-gl/maplibre";
import { cn } from "@workspace/ui/lib/utils";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { Slider } from "@workspace/ui/components/slider";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { Toggle } from "@workspace/ui/components/toggle";
import { Eye, EyeOff } from "lucide-react";

/** Custom raster layer configuration. */
export interface CustomLayer {
	name: string;
	url: string;
	opacity: number;
	visible: boolean;
	bounds?: [[number, number], [number, number]]; // Optional bounds: [[minLng, minLat], [maxLng, maxLat]]
}

/**
 * "Layers" section of the map control panel. Renders one row per custom raster
 * layer with a center action, a show/hide toggle, and (when visible) an opacity
 * slider. Designed to live inside the consolidated `MapControlPanel`.
 * @param props - Component props.
 * @returns React element.
 */
export function LayersSection({
	customLayers,
	mapRef,
	onLayerVisibilityChange,
	onLayerOpacityChange,
}: {
	customLayers: CustomLayer[];
	mapRef?: React.RefObject<MapRef | null>;
	onLayerVisibilityChange: (layerIndex: number, visible: boolean) => void;
	onLayerOpacityChange: (layerIndex: number, opacity: number) => void;
}) {
	const { items } = useButtonHolder();

	// Function to fetch bounds from TiTiler COG info endpoint
	const fetchCogBounds = async (
		baseUrl: string,
	): Promise<[[number, number], [number, number]] | null> => {
		try {
			// Extract the COG URL from the tiles URL
			const cogMatch = baseUrl.match(/url=([^&]+)/);
			if (!cogMatch) return null;

			const cogUrl = decodeURIComponent(cogMatch[1] || "");
			const tiTilerBase = baseUrl.split("/cog/")[0];
			const infoUrl = `${tiTilerBase}/cog/info?url=${encodeURIComponent(cogUrl)}`;

			const response = await fetch(infoUrl);
			if (!response.ok) return null;

			const info = await response.json();
			if (info.bounds && info.bounds.length === 4) {
				return [
					[info.bounds[0], info.bounds[1]], // [minLng, minLat]
					[info.bounds[2], info.bounds[3]], // [maxLng, maxLat]
				];
			}
		} catch {
			// Bounds fetch is best-effort; fall back to map-derived bounds.
		}
		return null;
	};

	// Function to extract bounds from various layer URL formats
	const getLayerBounds = async (
		layer: CustomLayer,
	): Promise<[[number, number], [number, number]] | null> => {
		// First, check if bounds are explicitly provided
		if (layer.bounds) {
			return layer.bounds;
		}

		const url = layer.url;

		// Try to extract bounds from TiTiler COG URLs
		if (url.includes("cog/tiles/") || url.includes("cog/")) {
			return await fetchCogBounds(url);
		}

		// For WMS services, you could parse GetCapabilities
		if (url.includes("SERVICE=WMS") || url.includes("service=wms")) {
			// WMS bounds extraction could be implemented here
			return null;
		}

		// For other URL formats, we might not have bounds info
		return null;
	};

	// Function to handle centering on a layer
	const handleLayerCenter = async (layer: CustomLayer, index: number) => {
		if (!mapRef?.current) return;

		// First, try to get bounds from the layer URL
		const bounds = await getLayerBounds(layer);

		if (bounds) {
			// If we have bounds, fit the map to those bounds
			mapRef.current.fitBounds(bounds, {
				padding: 50,
				duration: 1000,
			});
			return;
		}

		// If no bounds available, try to get them from the map layer itself
		const map = mapRef.current.getMap();
		const layerId = `custom-layer-${index}`;

		// Check if the layer exists in the map
		if (map.getLayer(layerId)) {
			// For raster layers, we can try to get the source bounds
			const source = map.getSource(`custom-layer-${index}`);

			if (source && "bounds" in source) {
				const sourceBounds = (source as { bounds?: number[] }).bounds;
				if (sourceBounds && sourceBounds.length === 4) {
					mapRef.current.fitBounds(
						[
							[sourceBounds[0]!, sourceBounds[1]!],
							[sourceBounds[2]!, sourceBounds[3]!],
						],
						{
							padding: 50,
							duration: 1000,
						},
					);
					return;
				}
			}
		}

		// Fallback: zoom to a reasonable level centered on the current center.
		const currentCenter = mapRef.current.getCenter();
		mapRef.current.flyTo({
			center: [currentCenter.lng, currentCenter.lat],
			zoom: Math.max(mapRef.current.getZoom(), 10),
			duration: 1000,
		});
	};

	return (
		<div className="flex flex-col gap-1">
			<span className="px-1 text-xs font-medium text-muted-foreground uppercase">
				Layers
			</span>
			{customLayers.map((layer, index) => {
				const layerKey = `custom-layer-${index}`;
				return (
					<div
						key={layerKey}
						className="flex flex-col gap-1 rounded px-1 py-0.5"
					>
						<div className="flex items-center gap-2">
							<Layers
								className={cn(
									"h-4 w-4 shrink-0",
									layer.visible
										? "text-primary"
										: "text-muted-foreground",
								)}
							/>
							<span className="min-w-0 flex-1 truncate text-sm">
								{layer.name}
							</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6 shrink-0"
										onClick={() =>
											handleLayerCenter(layer, index)
										}
									>
										<Target className="h-3 w-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									Center map on &quot;{layer.name}&quot;
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Toggle
										size="sm"
										pressed={layer.visible}
										onPressedChange={(pressed) =>
											onLayerVisibilityChange(
												index,
												pressed,
											)
										}
										className="h-6 w-6 min-w-6 shrink-0 p-0"
										aria-label={
											layer.visible
												? "Hide layer"
												: "Show layer"
										}
									>
										{layer.visible ? (
											<Eye className="h-3 w-3" />
										) : (
											<EyeOff className="h-3 w-3" />
										)}
									</Toggle>
								</TooltipTrigger>
								<TooltipContent>
									{layer.visible
										? "Hide layer"
										: "Show layer"}
								</TooltipContent>
							</Tooltip>
							{items.has(layerKey) && (
								<div className="shrink-0">
									{items.get(layerKey)?.component}
								</div>
							)}
						</div>

						{/* Opacity slider - only show when layer is visible */}
						{layer.visible && (
							<div className="flex items-center gap-2">
								<span className="w-8 shrink-0 text-xs text-muted-foreground tabular-nums">
									{Math.round(layer.opacity * 100)}%
								</span>
								<Slider
									value={[layer.opacity]}
									onValueChange={(value) =>
										onLayerOpacityChange(
											index,
											value[0] ?? 0,
										)
									}
									max={1}
									min={0}
									step={0.1}
									className="flex-1"
								/>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
