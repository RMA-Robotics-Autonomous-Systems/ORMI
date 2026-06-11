"use client";

import { Fragment, JSX, useMemo } from "react";
import { MapRef } from "react-map-gl/maplibre";
import {
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { usePluginsManager } from "@workspace/ormi-plugins";

import { MapControlPanel } from "../topics-overlay";
import { CustomLayer } from "../layers-overlay";
import TopicMarker from "../gps-components/marker-simple";
import HeatMarker from "../gps-components/marker-heat";
import PathMarker from "../gps-components/marker-path";
import MultiPoints from "../gps-components/marker-multipoints";

/**
 * Configuration for a GPS topic marker.
 */
interface GpsTopicConfig {
	name: string;
	topic: SelectedTopic;
	makerType: "simple" | "heatmap" | "path" | "multipoints" | any;
	numericalTopic?: SelectedTopic;
}

/**
 * Props for GpsTopicsLayer.
 */
interface GpsTopicsLayerProps extends Record<string, unknown> {
	topics: GpsTopicConfig[];
	mapRef?: React.RefObject<MapRef | null>;
	/** Custom raster layers rendered in the consolidated control panel. */
	customLayers: CustomLayer[];
	onLayerVisibilityChange: (layerIndex: number, visible: boolean) => void;
	onLayerOpacityChange: (layerIndex: number, opacity: number) => void;
}

/**
 * Renders GPS-based topics (already in GPS coordinates).
 * @param props - Component props.
 * @returns React element or null when there is nothing to render.
 */
export function GpsTopicsLayer({
	topics,
	mapRef,
	customLayers,
	onLayerVisibilityChange,
	onLayerOpacityChange,
}: GpsTopicsLayerProps) {
	const pluginsManager = usePluginsManager();

	// Memoize all topics to prevent unnecessary re-computation
	const allTopics = useMemo(() => {
		const topicsList: SelectedTopic[] = [];
		const seenSourceIds = new Set<string>();

		topics.forEach((t) => {
			if (t.topic) {
				const sourceId = `${t.topic.source.id}::${t.topic.topic}${t.topic.property ? "::" + t.topic.property : ""}`;
				if (!seenSourceIds.has(sourceId)) {
					topicsList.push(t.topic);
					seenSourceIds.add(sourceId);
				}
			}
			if (t.numericalTopic) {
				const numericalSourceId = `${t.numericalTopic.source.id}::${t.numericalTopic.topic}${t.numericalTopic.property ? "::" + t.numericalTopic.property : ""}`;
				if (!seenSourceIds.has(numericalSourceId)) {
					topicsList.push(t.numericalTopic);
					seenSourceIds.add(numericalSourceId);
				}
			}
		});

		return topicsList.filter(
			(t) => t !== undefined && t.topic !== undefined && t.topic !== "",
		);
	}, [topics]);

	// Render nothing only when there is neither a topic nor a layer to control.
	if (
		(!topics || topics.length === 0) &&
		(!customLayers || customLayers.length === 0)
	) {
		return null;
	}

	return (
		<LocalDataSourcesProvider SelectedTopics={allTopics} buffersSize={50}>
			{topics.map((t, i) => {
				// Unique, stable key per entry: a topic name can be empty or shared across
				// entries, so compose it with the topic identity and the list index.
				const key = t.topic
					? `${t.topic.source.id}::${t.topic.topic}::${t.topic.property ?? ""}::${i}`
					: `gps-topic-${i}`;
				if (t.makerType === "simple") {
					return (
						<TopicMarker
							key={key}
							topic={t.topic}
							name={t.name}
							scale={1}
						/>
					);
				} else if (t.makerType === "heatmap") {
					return (
						<HeatMarker
							key={key}
							topic={t.topic}
							name={t.name}
							scale={1}
							numericalTopic={t.numericalTopic}
						/>
					);
				} else if (t.makerType === "path") {
					return (
						<PathMarker
							key={key}
							topic={t.topic}
							name={t.name}
							scale={1}
						/>
					);
				} else if (t.makerType === "multipoints") {
					return (
						<MultiPoints
							key={key}
							topic={t.topic}
							name={t.name}
							scale={1}
						/>
					);
				}
				// Plugin-provided marker: wrap in a keyed Fragment — the returned element
				// is arbitrary JSX we cannot attach a key to directly.
				return (
					<Fragment key={key}>
						{pluginsManager.applyFilter<JSX.Element | null>(
							"std-widgets-map-components",
							null,
							t,
						)}
					</Fragment>
				);
			})}

			<MapControlPanel
				topics={topics}
				customLayers={customLayers}
				mapRef={mapRef}
				onLayerVisibilityChange={onLayerVisibilityChange}
				onLayerOpacityChange={onLayerOpacityChange}
			/>
		</LocalDataSourcesProvider>
	);
}
