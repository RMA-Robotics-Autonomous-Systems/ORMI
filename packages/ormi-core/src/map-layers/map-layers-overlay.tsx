"use client";

import React from "react";
import { Layers, Target } from "lucide-react";
import { useMap, type MapRef } from "react-map-gl/maplibre";
import { Button } from "@workspace/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";

import type { RasterOverlayLayer } from "./raster-overlay-plan";

/** Props for {@link MapLayersOverlay}. */
export interface MapLayersOverlayProps {
	/** The map's drawn layers: `useMapRasterLayers().layers`. */
	layers: readonly RasterOverlayLayer[];
	/** The map to centre. Defaults to the enclosing `<Map>`, when there is one. */
	mapRef?: React.RefObject<MapRef | null>;
	/** Heading above the list. Defaults to "Layers". */
	title?: string;
	/** Optional extra class names. */
	className?: string;
}

/**
 * The in-map list of the layers a map draws, each with a button that fits the
 * map to that layer's bounds (disabled when the catalogue has none). It
 * selects nothing: switching layers and opacity live in the configuration
 * dialog. Renders nothing when no layer is drawn.
 *
 * @param props - Component props.
 * @returns React element, or `null`.
 */
export function MapLayersOverlay({
	layers,
	mapRef,
	title = "Layers",
	className,
}: MapLayersOverlayProps) {
	const { current: enclosing } = useMap();

	if (layers.length === 0) return null;

	const centre = (layer: RasterOverlayLayer) => {
		const map = mapRef?.current ?? enclosing;
		if (!map || !layer.bounds) return;
		const [w, s, e, n] = layer.bounds;
		map.fitBounds(
			[
				[w, s],
				[e, n],
			],
			{ padding: 50, duration: 1000 },
		);
	};

	return (
		<div
			className={cn("flex flex-col gap-1", className)}
			data-map-layers-overlay=""
		>
			<span className="text-muted-foreground px-1 text-xs font-medium uppercase">
				{title}
			</span>
			{layers.map((layer) => (
				<div
					key={layer.id}
					className="flex items-center gap-2 rounded px-1 py-0.5"
				>
					<Layers
						className="text-primary h-4 w-4 shrink-0"
						aria-hidden
					/>
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-sm">{layer.title}</span>
						<span className="text-muted-foreground truncate text-xs">
							{layer.serverTitle}
						</span>
					</div>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="shrink-0">
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6"
									disabled={!layer.bounds}
									aria-label={`Center map on ${layer.title}`}
									onClick={() => centre(layer)}
								>
									<Target className="h-3 w-3" />
								</Button>
							</span>
						</TooltipTrigger>
						<TooltipContent>
							{layer.bounds
								? `Center map on "${layer.title}"`
								: "No extent"}
						</TooltipContent>
					</Tooltip>
				</div>
			))}
		</div>
	);
}
