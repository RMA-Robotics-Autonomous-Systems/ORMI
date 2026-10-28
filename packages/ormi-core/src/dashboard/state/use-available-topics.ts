"use client";

import { useEffect, useMemo, useState } from "react";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";

import { DatasourceTopic } from "../../datasources/datasource-interface";
import { getCreatedTopicsStore } from "../../datasources/created-topics";
import {
	WAITING_FOR_TOPICS,
	type SettledTopics,
} from "../../renderers/topic-selection/use-settled-topics";

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
 * What {@link useAvailableTopics} returns: `waiting` until the first poll has
 * answered, then `settled` with the current list (which may be empty).
 *
 * The same union as `SettledTopics`, per the rule that an asynchronously
 * injected list crossing the core boundary is never a bare array: "nothing has
 * answered yet" and "the datasources list no topics" are different answers.
 * Unlike `useSettledTopics`, `settled` here is not a latch: the list keeps
 * following later polls.
 */
export type AvailableTopics = SettledTopics;

/** The outcome of one `AVAILABLE_TOPICS` poll. */
export type AvailableTopicsPoll =
	| { readonly ok: true; readonly topics: DatasourceTopic[] }
	| { readonly ok: false };

/**
 * Folds one poll outcome into the hook's state.
 *
 * - A successful poll settles on its list, and hands back `previous` when the
 *   rows are unchanged ({@link sameTopics}), so memoised consumers are not torn
 *   down twice a second.
 * - A failed poll settles a `waiting` state on an empty list, so a filter that
 *   throws never leaves the topic list on a spinner forever; the next poll that
 *   succeeds replaces it. A failed poll over a `settled` state keeps that list.
 *
 * Pure and exported for its unit tests; the dashboard barrel does not re-export
 * it.
 */
export function reduceAvailableTopics(
	previous: AvailableTopics,
	poll: AvailableTopicsPoll,
): AvailableTopics {
	if (!poll.ok) {
		return previous.status === "settled"
			? previous
			: { status: "settled", topics: [] };
	}
	if (
		previous.status === "settled" &&
		sameTopics(previous.topics, poll.topics)
	) {
		return previous;
	}
	return { status: "settled", topics: poll.topics };
}

/**
 * Live list of every topic the configured datasources currently offer.
 *
 * Returns the **previous state object** when a poll reports the same topics,
 * so consumers that memoise on the list — a row list, a routing decision — are
 * not torn down twice a second while nothing has changed.
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
 * @returns `{ status: "waiting" }` until the first poll answers (or fails),
 * then `{ status: "settled", topics }` with the current list.
 */
export function useAvailableTopics(): AvailableTopics {
	const pluginsManager = usePluginsManager();
	const [state, setState] = useState<AvailableTopics>(WAITING_FOR_TOPICS);

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
			let poll: AvailableTopicsPoll;
			try {
				const topics = await pluginsManager.applyFilterAsync<
					DatasourceTopic[]
				>(PluginsHooks.AVAILABLE_TOPICS, []);
				poll = { ok: true, topics };
			} catch (error) {
				console.warn("Topics: failed to list available topics", error);
				poll = { ok: false };
			}
			if (cancelled) return;
			setState((previous) => reduceAvailableTopics(previous, poll));
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

	return state;
}
