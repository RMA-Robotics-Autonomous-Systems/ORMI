import type { ReactNode } from "react";

import type { DatasourceTopic } from "../../../datasources/datasource-interface";

/** How one topic type is previewed when the operator hovers its row. */
export interface TopicPreviewConfig {
	/**
	 * Renders the preview for a topic. A function rather than a component type
	 * so a plugin can hand over a memoised wrapper around one of its own
	 * widgets without exposing that widget's prop shape to core.
	 */
	component: (topic: DatasourceTopic) => ReactNode;
	/** Minimum height reserved for the preview card. */
	minHeight?: string;
}

/**
 * Preview configurations by webapp type name (`DatasourceTopic.type`), plus
 * the {@link TOPIC_PREVIEW_FALLBACK} entry.
 *
 * Collected through `PluginsHooks.TOPIC_PREVIEWS`, so it is an ordinary plugin
 * contribution — core never imports a preview, it is handed them.
 */
export type TopicPreviewRegistry = Map<string, TopicPreviewConfig>;

/**
 * Registry key for the preview used when a topic's type has none of its own.
 *
 * Exported so the plugin that registers the fallback and the panel that looks
 * it up cannot drift apart on the spelling — a mismatch shows up as "hovering
 * does nothing" for every unrecognised type, which reads as a dead feature
 * rather than a missing entry.
 */
export const TOPIC_PREVIEW_FALLBACK = "__fallback__";

/**
 * The preview to render for a topic, or `undefined` when there is none.
 *
 * Lookup is on the **webapp** type only, never `rawType`: previews are built
 * from widgets, and widgets accept webapp types. A topic whose type is unset or
 * unregistered falls through to {@link TOPIC_PREVIEW_FALLBACK}, which is what
 * keeps a brand-new message type inspectable (as JSON) instead of silent.
 *
 * Pure and unit-tested — a lookup that quietly stops resolving leaves the row
 * hover working and the card empty, which nobody reports.
 *
 * @param registry - Previews contributed by plugins.
 * @param topic - Topic being hovered.
 * @returns The preview configuration, or `undefined` if not even a fallback exists.
 */
export function resolveTopicPreview(
	registry: TopicPreviewRegistry,
	topic: DatasourceTopic,
): TopicPreviewConfig | undefined {
	const byType = topic.type ? registry.get(topic.type) : undefined;
	return byType ?? registry.get(TOPIC_PREVIEW_FALLBACK);
}
