"use client";

import { useMemo } from "react";
import {
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { LocalTopicVisualizer } from "../local-topic-visualizer-types";

/**
 * Configuration for a local coordinate topic.
 */
interface LocalTopicConfig {
	name: string;
	topic: SelectedTopic;
	gpsOriginTopic: SelectedTopic;
	visualizerType?: string;
}

/**
 * Props for LocalTopicsLayer.
 */
interface LocalTopicsLayerProps extends Record<string, unknown> {
	localTopics: LocalTopicConfig[];
}

/**
 * Renders local coordinate topics and converts them to GPS coordinates.
 * @param props - Component props.
 * @returns React element or null when there is nothing to render.
 */
export function LocalTopicsLayer({ localTopics }: LocalTopicsLayerProps) {
	const pluginsManager = usePluginsManager();

	// Query available visualizers from plugins
	const visualizers = useMemo(() => {
		const initialMap: Map<string, LocalTopicVisualizer> = new Map();
		return pluginsManager.applyFilter<Map<string, LocalTopicVisualizer>>(
			PluginsHooks.MAP_LOCAL_VISUALIZERS,
			initialMap,
		);
	}, [pluginsManager]);

	// Memoize all topics (local + GPS origin)
	const allTopics = useMemo(() => {
		const topicsList: SelectedTopic[] = [];
		const seenSourceIds = new Set<string>();

		localTopics.forEach((lt) => {
			// Add the local topic itself
			if (lt.topic) {
				const sourceId = `${lt.topic.source.id}::${lt.topic.topic}${lt.topic.property ? "::" + lt.topic.property : ""}`;
				if (!seenSourceIds.has(sourceId)) {
					topicsList.push(lt.topic);
					seenSourceIds.add(sourceId);
				}
			}
			// Add the GPS origin topic
			if (lt.gpsOriginTopic) {
				const gpsSourceId = `${lt.gpsOriginTopic.source.id}::${lt.gpsOriginTopic.topic}${lt.gpsOriginTopic.property ? "::" + lt.gpsOriginTopic.property : ""}`;
				if (!seenSourceIds.has(gpsSourceId)) {
					topicsList.push(lt.gpsOriginTopic);
					seenSourceIds.add(gpsSourceId);
				}
			}
		});

		return topicsList.filter(
			(t) => t !== undefined && t.topic !== undefined && t.topic !== "",
		);
	}, [localTopics]);

	if (!localTopics || localTopics.length === 0) {
		return null;
	}

	return (
		<LocalDataSourcesProvider SelectedTopics={allTopics} buffersSize={50}>
			{localTopics.map((lt, index) => {
				// Find visualizer - either specified or auto-detect from topic type
				let visualizer: LocalTopicVisualizer | undefined;

				if (lt.visualizerType && visualizers.has(lt.visualizerType)) {
					visualizer = visualizers.get(lt.visualizerType);
				} else {
					// Auto-detect: find first visualizer that accepts this topic type
					for (const [key, vis] of visualizers.entries()) {
						if (
							lt.topic.type &&
							vis.accepts.includes(lt.topic.type)
						) {
							visualizer = vis;
							break;
						}
					}
				}

				if (!visualizer) {
					console.warn(
						`No visualizer found for local topic: ${lt.name} (type: ${lt.topic.type})`,
					);
					return null;
				}

				const VisualizerComponent = visualizer.component;
				// Create unique key combining topic source, topic name, and array index
				const uniqueKey = `${lt.topic.source.id}_${lt.topic.topic}_${lt.name}_${index}`;

				return <VisualizerComponent key={uniqueKey} {...lt} />;
			})}
		</LocalDataSourcesProvider>
	);
}
