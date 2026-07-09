"use client";

import {
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";
import { useEffect, useState } from "react";

/** Default topic list refresh period for auto-subscribe widgets. */
const DEFAULT_POLL_MS = 2000;

/** Options for {@link useDiscoveredTopics}. */
interface UseDiscoveredTopicsOptions {
	/** Resolved webapp type tag applied by the converter (primary match). */
	webappType: string;
	/** Raw ROS type, used as a fallback discovery predicate. */
	rosType: string;
	/** Poll period in ms; defaults to {@link DEFAULT_POLL_MS}. */
	pollMs?: number;
}

/** Stable identity key for a topic: `${source.id}::${topic}`. */
const topicKey = (topic: SelectedTopic): string =>
	`${topic.source.id}::${topic.topic}`;

/**
 * Discovers every topic of a given webapp/ROS type across all datasources and
 * returns them as `SelectedTopic[]` for an auto-subscribe widget to feed into a
 * `LocalDataSourcesProvider`.
 *
 * Discovery polls the `AVAILABLE_TOPICS` filter (same mechanism as the topic
 * selection dialog and topics-list widget) every {@link UseDiscoveredTopicsOptions.pollMs}.
 *
 * The returned array keeps a **stable identity** unless the topic *set* actually
 * changes: the local provider resubscribes everything whenever `SelectedTopics`
 * changes identity, so churning it on every poll would thrash subscriptions.
 * The set comparison is order-independent (keyed on `${source.id}::${topic}`),
 * so a pure reordering of `AVAILABLE_TOPICS` — e.g. after a datasource
 * reconnect re-enumerates its topics — does not force a resubscribe.
 *
 * @param options - Discovery type predicates and optional poll period.
 * @returns The discovered topics, with a stable array identity across polls
 *   until the topic set changes.
 */
export function useDiscoveredTopics({
	webappType,
	rosType,
	pollMs = DEFAULT_POLL_MS,
}: UseDiscoveredTopicsOptions): SelectedTopic[] {
	const pluginsManager = usePluginsManager();
	const [topics, setTopics] = useState<SelectedTopic[]>([]);

	useEffect(() => {
		let cancelled = false;

		const refreshTopics = async () => {
			const available = await pluginsManager.applyFilterAsync<
				DatasourceTopic[]
			>(PluginsHooks.AVAILABLE_TOPICS, []);
			if (cancelled) return;

			const next: SelectedTopic[] = available
				.filter(
					(topic) =>
						topic.type === webappType || topic.rawType === rosType,
				)
				.map((topic) => ({ ...topic, property: "" }));

			// Preserve array identity unless the topic set changed. Compare on
			// stable keys rather than position, so a reordered enumeration with
			// the same members keeps the previous identity (no resubscribe).
			setTopics((prev) => {
				if (prev.length !== next.length) return next;
				const prevKeys = new Set(prev.map(topicKey));
				const unchanged = next.every((topic) =>
					prevKeys.has(topicKey(topic)),
				);
				return unchanged ? prev : next;
			});
		};

		refreshTopics();
		const intervalId = setInterval(refreshTopics, pollMs);

		return () => {
			cancelled = true;
			clearInterval(intervalId);
		};
	}, [pluginsManager, webappType, rosType, pollMs]);

	return topics;
}
