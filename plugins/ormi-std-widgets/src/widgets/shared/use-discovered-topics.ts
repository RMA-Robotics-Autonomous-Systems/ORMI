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
 * What {@link useDiscoveredTopics} returns: `waiting` until the first poll has
 * answered, then `settled` with the matching topics (which may be empty), so a
 * widget can tell "still looking" from "none found".
 */
export type DiscoveredTopics =
	| { readonly status: "waiting" }
	| { readonly status: "settled"; readonly topics: SelectedTopic[] };

/** The initial state, shared so it is never re-created. */
const WAITING: DiscoveredTopics = { status: "waiting" };

/**
 * Folds one poll outcome (`null` for a failed poll) into the hook's state.
 *
 * A successful poll settles on its topics, and returns `previous` unless the
 * topic *set* changed: the comparison is order-independent (keyed on
 * `${source.id}::${topic}`), because the local provider resubscribes whenever
 * `SelectedTopics` changes identity. A failed poll settles a `waiting` state on
 * an empty list, so a throwing filter never leaves the widget looking forever,
 * and keeps a `settled` one as it is.
 *
 * Pure and exported for its unit tests.
 */
export function reduceDiscoveredTopics(
	previous: DiscoveredTopics,
	next: SelectedTopic[] | null,
): DiscoveredTopics {
	if (next === null) {
		return previous.status === "settled"
			? previous
			: { status: "settled", topics: [] };
	}
	if (
		previous.status === "settled" &&
		previous.topics.length === next.length
	) {
		const prevKeys = new Set(previous.topics.map(topicKey));
		if (next.every((topic) => prevKeys.has(topicKey(topic)))) {
			return previous;
		}
	}
	return { status: "settled", topics: next };
}

/**
 * Discovers every topic of a given webapp/ROS type across all datasources and
 * returns them as `SelectedTopic[]` for an auto-subscribe widget to feed into a
 * `LocalDataSourcesProvider`.
 *
 * Discovery polls the `AVAILABLE_TOPICS` filter (same mechanism as the topic
 * selection dialog and topics-list widget) every {@link UseDiscoveredTopicsOptions.pollMs}.
 *
 * The returned topics keep a **stable identity** unless the topic *set*
 * actually changes ({@link reduceDiscoveredTopics}), so a reordered
 * enumeration after a reconnect does not force a resubscribe. A failed
 * `AVAILABLE_TOPICS` read is logged and settles the state rather than leaving
 * it waiting.
 *
 * @param options - Discovery type predicates and optional poll period.
 * @returns `{ status: "waiting" }` until the first poll answers, then
 *   `{ status: "settled", topics }`.
 */
export function useDiscoveredTopics({
	webappType,
	rosType,
	pollMs = DEFAULT_POLL_MS,
}: UseDiscoveredTopicsOptions): DiscoveredTopics {
	const pluginsManager = usePluginsManager();
	const [state, setState] = useState<DiscoveredTopics>(WAITING);

	useEffect(() => {
		let cancelled = false;

		const refreshTopics = async () => {
			let next: SelectedTopic[] | null;
			try {
				const available = await pluginsManager.applyFilterAsync<
					DatasourceTopic[]
				>(PluginsHooks.AVAILABLE_TOPICS, []);
				next = available
					.filter(
						(topic) =>
							topic.type === webappType ||
							topic.rawType === rosType,
					)
					.map((topic) => ({ ...topic, property: "" }));
			} catch (error) {
				console.warn("Failed to list available topics", error);
				next = null;
			}
			if (cancelled) return;
			setState((previous) => reduceDiscoveredTopics(previous, next));
		};

		refreshTopics();
		const intervalId = setInterval(refreshTopics, pollMs);

		return () => {
			cancelled = true;
			clearInterval(intervalId);
		};
	}, [pluginsManager, webappType, rosType, pollMs]);

	return state;
}
