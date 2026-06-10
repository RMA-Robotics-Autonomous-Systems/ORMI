/**
 * Stable string keying for datasource-selected topics.
 *
 * This module is intentionally dependency-free (no React, no `ormi-core`,
 * no `ormi-plugins`) so that both the core `LocalDataSourcesProvider`
 * consumer and the subscription registry agree on the exact same wire key
 * byte-for-byte. It was previously a private helper in
 * `packages/ormi-core/src/datasources/components/local-datasource-provider.tsx`.
 */

/**
 * Minimal structural shape of a selected topic required to compute its key.
 *
 * Mirrors the relevant fields of `SelectedTopic` from `@workspace/ormi-core`
 * without importing core, keeping `@workspace/utils` decoupled. The real
 * `SelectedTopic` satisfies this interface structurally.
 */
export interface TopicKeyInput {
	/** Datasource provider settings; only `id` is read for keying. */
	source: { id: string };
	/** Topic name. */
	topic: string;
	/** Optional sub-property path within the message (e.g. `pose.position`). */
	property?: string;
}

/**
 * Create a stable key for a selected topic.
 *
 * Output is `dsId::topic` when no property is set, or `dsId::topic::property`
 * when a non-empty property is present. This output must remain identical to
 * the historical local implementation so registry state and the consumer's
 * buffer map stay aligned.
 *
 * @param selectedTopic - Topic to key (only `source.id`, `topic`, `property` read).
 * @returns The stable topic key.
 */
export const createTopicKey = (selectedTopic: TopicKeyInput): string => {
	return `${selectedTopic.source.id}::${selectedTopic.topic}${selectedTopic.property ? "::" + selectedTopic.property : ""}`;
};
