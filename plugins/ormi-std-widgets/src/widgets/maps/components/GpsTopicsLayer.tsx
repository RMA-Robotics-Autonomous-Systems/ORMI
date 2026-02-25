"use client";

import { JSX, useMemo } from "react";
import { MapRef } from "react-map-gl/maplibre";
import {
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { usePluginsManager } from "@workspace/ormi-plugins";

import { TopicListOverlay } from "../topics-overlay";
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
}

/**
 * Renders GPS-based topics (already in GPS coordinates).
 * @param props - Component props.
 * @returns React element or null when there is nothing to render.
 */
export function GpsTopicsLayer({ topics, mapRef }: GpsTopicsLayerProps) {
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

	if (!topics || topics.length === 0) {
		return null;
	}

	return (
		<LocalDataSourcesProvider SelectedTopics={allTopics} buffersSize={50}>
			{topics.map((t) => {
				if (t.makerType === "simple") {
					return (
						<TopicMarker
							key={t.name}
							topic={t.topic}
							name={t.name}
							scale={1}
						/>
					);
				} else if (t.makerType === "heatmap") {
					return (
						<HeatMarker
							key={t.name}
							topic={t.topic}
							name={t.name}
							scale={1}
							numericalTopic={t.numericalTopic}
						/>
					);
				} else if (t.makerType === "path") {
					return (
						<PathMarker
							key={t.name}
							topic={t.topic}
							name={t.name}
							scale={1}
						/>
					);
				} else if (t.makerType === "multipoints") {
					return (
						<MultiPoints
							key={t.name}
							topic={t.topic}
							name={t.name}
							scale={1}
						/>
					);
				}
				return pluginsManager.applyFilter<JSX.Element | null>(
					"std-widgets-map-components",
					null,
					t,
				);
			})}

			<TopicListOverlay topics={topics} mapRef={mapRef} />
		</LocalDataSourcesProvider>
	);
}
