/**
 * The topics panel: the product's single topic list, plus the plugin contract
 * for the live previews it shows.
 *
 * Exposed as its own package subpath (`@workspace/ormi-core/dashboard/topic-list`)
 * so a plugin can register previews, or embed the panel in a widget, without
 * importing the dashboard barrel.
 */

export { TopicsPanel } from "./topics-panel";
export type { TopicsPanelProps } from "./topics-panel";

export { TopicPreviewHover } from "./topic-preview-hover";
export type { TopicPreviewHoverProps } from "./topic-preview-hover";

export {
	TOPIC_PREVIEW_FALLBACK,
	resolveTopicPreview,
} from "./topic-preview-registry";
export type {
	TopicPreviewConfig,
	TopicPreviewRegistry,
} from "./topic-preview-registry";

export { useTopicPreviews } from "./use-topic-previews";

export { matchesTopicQuery, selectTopics, topicSortValue } from "./topic-sort";
export type {
	TopicListView,
	TopicSortDirection,
	TopicSortKey,
} from "./topic-sort";
