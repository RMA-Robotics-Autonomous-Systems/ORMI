/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { ReactNode, useEffect } from "react";
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

	useEffect(() => {
		// Available topics filter — appends this datasource's topics to the list.
		pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: available_topics_id,
			filter: async (topics: any[]) => {
				try {
					const rosTopics = await getTopicsList(ros);
					return [
						...topics,
						...rosTopics.map((t) => ({
							topic: t.topic,
							datasource_id,
							source: settings,
							type:
								UnifiedConverter.getWebappTypeFromROSType(
									t.type,
								) || "",
							rawType: t.type,
						})),
					];
				} catch {
					return topics;
				}
			},
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
					const topicsAndTypes = await getTopicsAndRawTypes(ros);
					return topicsAndTypes.get(topic.topic) ?? definition;
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
		settings,
		pluginsManager,
	]);

	return <>{children}</>;
};

export { TypeSystemManager };
