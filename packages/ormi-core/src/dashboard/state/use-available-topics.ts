"use client";

import { useEffect, useMemo, useState } from "react";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";

import { DatasourceTopic } from "../../datasources/datasource-interface";
import { getCreatedTopicsStore } from "../../datasources/created-topics";

/**
 * How long the poll waits between reads of `AVAILABLE_TOPICS`.
 *
 * The hook is a pull filter with no change notification, and a datasource that
 * is still connecting reports nothing, so polling is the only way to learn that
 * topics have arrived. Two seconds is fast enough that a freshly connected
 * robot fills the list while the operator is still looking at it, and slow
 * enough that enumerating a few hundred topics is not a per-frame cost.
 */
export const AVAILABLE_TOPICS_POLL_MS = 2000;

/**
 * Whether two topic lists describe the same rows, in the same order.
 *
 * The comparison must cover **everything a consumer renders from a topic**, not
 * just its identity: returning `previous` is what stops the list re-rendering,
 * so any displayed field left out here is a field that can never change on
 * screen. `source.title` is the datasource's operator-chosen name, shown in the
 * topic list's first column — omitting it meant renaming a datasource left every
 * row showing the old name until the dashboard was reloaded, even once the
 * datasource reported the new one.
 *
 * Exported for its unit tests only — nothing outside this module should need
 * it, and the dashboard barrel deliberately does not re-export it.
 *
 * `source` is compared by title alone on purpose: the rest of a datasource's
 * settings (url, timeouts, transform topics) are not rendered anywhere a topic
 * appears, and a deep compare would tear the list down on every unrelated edit.
 */
export function sameTopics(
	previous: DatasourceTopic[],
	next: DatasourceTopic[],
): boolean {
	if (previous.length !== next.length) return false;
	return next.every((topic, index) => {
		const before = previous[index];
		return (
			!!before &&
			before.topic === topic.topic &&
			before.type === topic.type &&
			before.rawType === topic.rawType &&
			before.datasource_id === topic.datasource_id &&
			before.source?.title === topic.source?.title
		);
	});
}

/**
 * Live list of every topic the configured datasources currently offer.
 *
 * Returns the **previous array** when a poll reports the same topics, so
 * consumers that memoise on the list — a row list, a routing decision — are not
 * torn down twice a second while nothing has changed.
 *
 * Unlike `useSettledTopics`, this never latches: a topic list has to show one
 * that appeared after the dashboard opened, and a robot that reconnects with a
 * different set has to be visible as such.
 *
 * A topic the operator creates is not something to wait up to
 * {@link AVAILABLE_TOPICS_POLL_MS} for: they created it a moment ago and are
 * looking straight at the list. The created-topics store notifies on change and
 * the poll re-runs then, so the new row is there on the same interaction. The
 * interval stays — it is still the only way to learn that a *robot* advertised
 * something.
 *
 * @returns The current topics, empty until the first poll resolves.
 */
export function useAvailableTopics(): DatasourceTopic[] {
	const pluginsManager = usePluginsManager();
	const [topics, setTopics] = useState<DatasourceTopic[]>([]);

	// Resolved eagerly rather than on first use: creating the store is what
	// registers its `AVAILABLE_TOPICS` contribution, and a list that has not
	// resolved it cannot show a created topic at all.
	const createdTopics = useMemo(
		() => getCreatedTopicsStore(pluginsManager),
		[pluginsManager],
	);

	useEffect(() => {
		let cancelled = false;

		const poll = async () => {
			let listed: DatasourceTopic[] = [];
			try {
				listed = await pluginsManager.applyFilterAsync<
					DatasourceTopic[]
				>(PluginsHooks.AVAILABLE_TOPICS, []);
			} catch (error) {
				console.warn("Topics: failed to list available topics", error);
				return;
			}
			if (cancelled) return;
			setTopics((previous) =>
				sameTopics(previous, listed) ? previous : listed,
			);
		};

		void poll();
		const interval = setInterval(
			() => void poll(),
			AVAILABLE_TOPICS_POLL_MS,
		);
		const unsubscribe = createdTopics.subscribe(() => void poll());

		return () => {
			cancelled = true;
			clearInterval(interval);
			unsubscribe();
		};
	}, [pluginsManager, createdTopics]);

	return topics;
}
