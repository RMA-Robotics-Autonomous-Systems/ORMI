"use client";

import { useMemo } from "react";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";

import type { TopicPreviewRegistry } from "./topic-preview-registry";

/**
 * Topic previews contributed by plugins, read the way every other plugin
 * contribution is read.
 *
 * Memoised on the manager: the filter is a pull with no change notification,
 * and plugins register in their constructors, so the result is fixed for the
 * lifetime of a manager.
 *
 * @returns Preview configurations by webapp type name.
 */
export function useTopicPreviews(): TopicPreviewRegistry {
	const pluginsManager = usePluginsManager();

	return useMemo(
		() =>
			pluginsManager.applyFilter<TopicPreviewRegistry>(
				PluginsHooks.TOPIC_PREVIEWS,
				new Map(),
			),
		[pluginsManager],
	);
}
