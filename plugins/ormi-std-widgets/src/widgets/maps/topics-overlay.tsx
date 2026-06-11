"use client";

import {
	SelectedTopic,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import { Layers, Target } from "lucide-react";
import { useState } from "react";
import { MapRef } from "react-map-gl/maplibre";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { Separator } from "@workspace/ui/components/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { createAvatarDataUri } from "@workspace/utils";
import { CustomLayer, LayersSection } from "./layers-overlay";

/** A GPS topic entry rendered as a row in the control panel. */
interface TopicEntry {
	name: string;
	topic: SelectedTopic;
	makerType: "simple" | "heatmap" | "path" | "multipoints";
}

/**
 * Consolidated, collapsible map control panel anchored top-right.
 *
 * Replaces the previous two independent hover-expand overlays with a single
 * panel that holds a "Topics" section (GPS markers, requires the surrounding
 * `LocalDataSourcesProvider`) and a "Layers" section (custom raster layers).
 * Each section only renders when it has items; when both are empty the panel
 * renders nothing.
 *
 * The per-row visibility toggle is injected by the marker components through
 * the keyed ButtonHolder bus (`items`); its key is `getSourceId(topic)`.
 *
 * @param props - Component props.
 * @returns React element or null when there is nothing to show.
 */
export function MapControlPanel({
	topics,
	customLayers,
	mapRef,
	onLayerVisibilityChange,
	onLayerOpacityChange,
}: {
	topics: TopicEntry[];
	customLayers: CustomLayer[];
	mapRef?: React.RefObject<MapRef | null>;
	onLayerVisibilityChange: (layerIndex: number, visible: boolean) => void;
	onLayerOpacityChange: (layerIndex: number, opacity: number) => void;
}) {
	const [open, setOpen] = useState(false);

	const hasTopics = topics.length > 0;
	const hasLayers = customLayers.length > 0;
	const itemCount = topics.length + customLayers.length;

	if (!hasTopics && !hasLayers) {
		return null;
	}

	return (
		<div className="absolute top-2 right-2 z-10 flex max-h-[calc(100%-1rem)] w-64 max-w-[calc(100%-1rem)] flex-col">
			<Card className="bg-popover text-popover-foreground min-h-0 flex-1 gap-0 overflow-hidden rounded-md border py-0 shadow-md">
				<Collapsible
					open={open}
					onOpenChange={setOpen}
					className="flex min-h-0 flex-1 flex-col"
				>
					<CollapsibleTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="h-9 w-full justify-start gap-2 px-3 text-sm font-medium"
						>
							<Layers className="h-4 w-4" />
							<span>Map controls</span>
							<Badge variant="secondary" className="ml-auto">
								{itemCount}
							</Badge>
						</Button>
					</CollapsibleTrigger>

					<CollapsibleContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
						<Separator />
						<div className="max-h-80 min-h-0 flex-1 overflow-y-auto">
							<div className="flex flex-col gap-3 p-2">
								{hasTopics && (
									<TopicsSection
										topics={topics}
										mapRef={mapRef}
									/>
								)}

								{hasTopics && hasLayers && <Separator />}

								{hasLayers && (
									<LayersSection
										customLayers={customLayers}
										mapRef={mapRef}
										onLayerVisibilityChange={
											onLayerVisibilityChange
										}
										onLayerOpacityChange={
											onLayerOpacityChange
										}
									/>
								)}
							</div>
						</div>
					</CollapsibleContent>
				</Collapsible>
			</Card>
		</div>
	);
}

/**
 * "Topics" section: one always-visible row per GPS topic with a center action
 * and the marker-injected visibility toggle.
 * @param props - Component props.
 * @returns React element.
 */
function TopicsSection({
	topics,
	mapRef,
}: {
	topics: TopicEntry[];
	mapRef?: React.RefObject<MapRef | null>;
}) {
	const { getSource, getSourceId } = useLocalDataSource();
	const { items } = useButtonHolder();

	const handleTopicClick = (topic: TopicEntry) => {
		if (!mapRef?.current) return;

		const data = getSource(topic.topic);
		if (!data || data.data.length === 0) return;

		if (topic.makerType === "simple") {
			const lastData = data.data[
				data.data.length - 1
			] as GeolocationPosition;
			mapRef.current.flyTo({
				center: [lastData.coords.longitude, lastData.coords.latitude],
				zoom: 16,
				duration: 1000,
			});
			return;
		}

		// heatmap / path / multipoints: fit the bounds of all points.
		const coordinates: [number, number][] = [];
		data.data.forEach((item: unknown) => {
			const geoItem = item as GeolocationPosition;
			coordinates.push([
				geoItem.coords.longitude,
				geoItem.coords.latitude,
			]);
		});

		if (coordinates.length === 1 && coordinates[0]) {
			mapRef.current.flyTo({
				center: coordinates[0],
				zoom: 16,
				duration: 1000,
			});
		} else if (coordinates.length > 1) {
			const bounds: [[number, number], [number, number]] = [
				[
					Math.min(...coordinates.map((c) => c[0])),
					Math.min(...coordinates.map((c) => c[1])),
				],
				[
					Math.max(...coordinates.map((c) => c[0])),
					Math.max(...coordinates.map((c) => c[1])),
				],
			];
			mapRef.current.fitBounds(bounds, { padding: 50, duration: 1000 });
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<span className="px-1 text-xs font-medium text-muted-foreground uppercase">
				Topics
			</span>
			{topics.map((topic) => {
				const topicKey = getSourceId(topic.topic);
				return (
					<div
						key={topicKey}
						className="flex items-center gap-2 rounded px-1 py-0.5"
					>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							width={20}
							height={20}
							className="shrink-0"
							src={createAvatarDataUri("bottts", topicKey)}
							alt={`Marker for ${topic.name}`}
						/>
						<span className="min-w-0 flex-1 truncate text-sm">
							{topic.name}
						</span>
						<Badge variant="secondary" className="shrink-0">
							{topic.makerType}
						</Badge>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6 shrink-0"
									onClick={() => handleTopicClick(topic)}
								>
									<Target className="h-3 w-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								Center map on &quot;{topic.name}&quot;
							</TooltipContent>
						</Tooltip>
						{items.has(topicKey) && (
							<div className="shrink-0">
								{items.get(topicKey)?.component}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
