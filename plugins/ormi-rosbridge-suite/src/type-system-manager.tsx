/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { ReactNode, useEffect, useRef } from "react";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { useRosbridgeData } from "./rosbridge-data-handler";
import {
	getTopicsList,
	getTopicsAndRawTypes,
	getAllTopicTypes,
} from "./ros-api";
import { UnifiedConverter } from "./ros2/unified-converter";
import type { RosBridgeSuiteDataSourceSettings } from "./types";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";
import type { JsonSchema } from "@jsonforms/core";

interface TypeSystemManagerProps {
	children: ReactNode;
	settings: RosBridgeSuiteDataSourceSettings;
}

/**
 * TypeSystemManager registers the hooks that feed topic discovery and schema
 * resolution back into the ORMI plugin system:
 *
 * - AVAILABLE_TOPICS  — lists all ROS topics exposed by the bridge
 * - definition        — returns a JsonSchema for a given topic's message type
 * - available-types   — lists all ROS interface types (via rosapi/interfaces)
 */
const TypeSystemManager: React.FC<TypeSystemManagerProps> = ({
	children,
	settings,
}) => {
	const { ros } = useRosbridgeData();
	const pluginsManager = usePluginsManager();

	const datasource_id = settings.id;
	const available_topics_id = `${datasource_id}-available-topics`;
	const definition_hook = `${datasource_id}-definition`;
	const available_types_hook = `${datasource_id}-available-types`;

	// Topic cache — populated once per ROS connection, read by the filter.
	// Using a ref means the filter closure always sees the latest value without
	// being re-registered every time the cache updates.
	const topicCacheRef = useRef<DatasourceTopic[]>([]);

	// Schema cache — populated on the first definition request per connection,
	// then reused for all subsequent calls. Matches the caching strategy used
	// by the worker path (getDefinition in rosbridge-source.worker.ts).
	const definitionCacheRef = useRef<Map<string, JsonSchema> | null>(null);

	// Keep a stable ref to settings so the fetch effect does not re-run when
	// non-id settings fields change (e.g. display name).
	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	// Fetch the topic list ONCE per ROS (re)connection.
	// RosbridgeDataHandler only renders this tree while the connection is
	// active, so `ros` changing is the connection event — no polling needed.
	useEffect(() => {
		const fetchTopics = async () => {
			try {
				const rosTopics = await getTopicsList(ros);
				topicCacheRef.current = rosTopics.map((t) => ({
					topic: t.topic,
					datasource_id,
					source: settingsRef.current,
					type:
						UnifiedConverter.getWebappTypeFromROSType(t.type) || "",
					rawType: t.type,
				}));
			} catch {
				topicCacheRef.current = [];
			}
		};

		fetchTopics();

		return () => {
			topicCacheRef.current = [];
			definitionCacheRef.current = null;
		};
	}, [ros, datasource_id]);

	// Register plugin filters. The AVAILABLE_TOPICS filter reads from the
	// cache ref — it never makes a live bridge call.
	useEffect(() => {
		pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: available_topics_id,
			filter: (topics: any[]) => [...topics, ...topicCacheRef.current],
			priority: 100,
		});

		// Definition filter — returns a JsonSchema for the requested topic.
		pluginsManager.addFilter(definition_hook, {
			id: definition_hook,
			priority: 10,
			filter: async (definition: any, topic: DatasourceTopic) => {
				const converter = UnifiedConverter.converters[topic.type];
				if (converter?.isPrimitive) return definition;
				try {
					if (!definitionCacheRef.current) {
						definitionCacheRef.current =
							await getTopicsAndRawTypes(ros);
					}
					return (
						definitionCacheRef.current.get(topic.topic) ??
						definition
					);
				} catch {
					return definition;
				}
			},
		});

		// Available types filter — appends all known ROS interface types.
		pluginsManager.addFilter(available_types_hook, {
			id: available_types_hook,
			filter: async (types: string[]) => {
				try {
					const all = await getAllTopicTypes(ros);
					return [...types, ...all];
				} catch {
					return types;
				}
			},
			priority: 100,
		});

		return () => {
			pluginsManager.removeFilter(available_topics_id);
			pluginsManager.removeFilter(definition_hook);
			pluginsManager.removeFilter(available_types_hook);
		};
	}, [
		ros,
		datasource_id,
		available_topics_id,
		definition_hook,
		available_types_hook,
		pluginsManager,
	]);

	return <>{children}</>;
};

export { TypeSystemManager };
