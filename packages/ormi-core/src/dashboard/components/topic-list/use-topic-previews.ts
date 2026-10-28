"use client";

import { PluginsHooks, usePluginFilter } from "@workspace/ormi-plugins";

import type { TopicPreviewRegistry } from "./topic-preview-registry";

/** The hooks {@link useTopicPreviews} reads, as a module-level array. */
const TOPIC_PREVIEWS_HOOKS = [PluginsHooks.TOPIC_PREVIEWS] as const;

/** Fresh accumulator for `TOPIC_PREVIEWS`. */
const emptyPreviews = (): TopicPreviewRegistry => new Map();

/**
 * Topic previews contributed by plugins, read the way every other plugin
 * contribution is read.
 *
 * Re-read whenever a plugin adds or removes a preview, and otherwise keeps
 * its identity.
 *
 * @returns Preview configurations by webapp type name.
 */
export function useTopicPreviews(): TopicPreviewRegistry {
	return usePluginFilter(
		PluginsHooks.TOPIC_PREVIEWS,
		emptyPreviews,
		TOPIC_PREVIEWS_HOOKS,
	);
}
