"use client";

import { useMemo } from "react";
import {
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { createTopicKey } from "@workspace/utils";
import { LocalTopicVisualizer } from "../local-topic-visualizer-types";
import { isEntryConfigured, LOCAL_ENTRY_SLOTS } from "../unconfigured-entries";

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

	// Entries that can actually be drawn. A local frame is placed against its
	// GPS origin, so an entry missing either topic renders nothing at all —
	// the visualizers read `topic.source.id` and `gpsOriginTopic` directly.
	// They are dropped here and reported by the viewer's notice, which is the
	// difference between "not configured yet" and a map that looks broken.
	const drawable = useMemo(
		() =>
			localTopics.filter((lt) =>
				isEntryConfigured(lt, LOCAL_ENTRY_SLOTS),
			),
		[localTopics],
	);

	// Memoize all topics (local + GPS origin)
	const allTopics = useMemo(() => {
		const topicsList: SelectedTopic[] = [];
		const seenSourceIds = new Set<string>();

		const add = (topic: SelectedTopic) => {
			const key = createTopicKey(topic);
			if (key === undefined || seenSourceIds.has(key)) return;
			topicsList.push(topic);
			seenSourceIds.add(key);
		};

		drawable.forEach((lt) => {
			add(lt.topic);
			add(lt.gpsOriginTopic);
		});

		return topicsList;
	}, [drawable]);

	if (drawable.length === 0) {
		return null;
	}

	return (
		<LocalDataSourcesProvider SelectedTopics={allTopics} buffersSize={50}>
			{drawable.map((lt, index) => {
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
