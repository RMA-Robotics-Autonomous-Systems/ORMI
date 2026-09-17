import { useEffect, useRef, useState } from "react";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";

import { DatasourceTopic } from "../../datasources/datasource-interface";

/**
 * How long the topic poll waits before its second attempt.
 *
 * `AVAILABLE_TOPICS` is a pull filter with no change notification, and a
 * datasource that is still connecting reports an empty list, so polling is the
 * only way to learn that topics have arrived.
 */
export const SETTLED_TOPICS_POLL_MS = 1500;

/**
 * Ceiling on the poll interval.
 *
 * The poll never stops — a robot may be powered on an hour after the dashboard
 * was opened, and a picker that gave up shows an operator "no topics" for the
 * rest of the session. Backing the interval off to this ceiling keeps a
 * dashboard left open overnight from asking every 1.5s forever, at the cost of
 * up to this long before a late robot's topics appear in a control that is
 * already on screen.
 */
export const SETTLED_TOPICS_MAX_POLL_MS = 30_000;

/** Growth factor applied to the poll interval after each empty list. */
export const SETTLED_TOPICS_POLL_BACKOFF = 1.5;

/**
 * Next poll interval after an empty list.
 *
 * Exported and pure so the backoff curve can be asserted without a timer: a
 * backoff that silently degenerated to a constant, or grew without bound, is
 * invisible in a running dashboard.
 *
 * @param previous - The interval just waited, in milliseconds.
 * @returns The next interval, capped at {@link SETTLED_TOPICS_MAX_POLL_MS}.
 */
export const nextSettledTopicsDelay = (previous: number): number => {
	if (!Number.isFinite(previous) || previous < SETTLED_TOPICS_POLL_MS) {
		return SETTLED_TOPICS_POLL_MS;
	}
	return Math.min(
		Math.round(previous * SETTLED_TOPICS_POLL_BACKOFF),
		SETTLED_TOPICS_MAX_POLL_MS,
	);
};

/**
 * State of one control's topic poll.
 *
 * Deliberately a union rather than a nullable array: "the poll has not seen a
 * topic yet" and "these are the topics" are different answers, and a control
 * that renders the first as an empty list tells the operator no topics exist
 * when the truth is that no datasource has enumerated yet.
 */
export type SettledTopics =
	| { readonly status: "waiting" }
	| { readonly status: "settled"; readonly topics: DatasourceTopic[] };

/**
 * The waiting state, as a module-level constant so an unsettled control's
 * result keeps its identity across renders.
 */
export const WAITING_FOR_TOPICS: SettledTopics = { status: "waiting" };

/**
 * Read `AVAILABLE_TOPICS` until it is first non-empty, then latch it.
 *
 * **The latch is the point.** Topics appear and disappear as datasources
 * connect, and a picker whose options grow, shrink or reorder while the
 * operator is reaching for one is worse than a dialog: the row under the
 * pointer is not the row that gets clicked. So the first non-empty list this
 * control sees is the list it offers for as long as it stays mounted, and the
 * full picker — which re-reads on open — is the way to reach anything that
 * showed up later.
 *
 * **The poll, by contrast, never gives up.** It used to stop after a fixed
 * number of empty lists and latch `[]`, which turned "this robot took longer
 * than twelve seconds to enumerate" into "this dashboard has no topics" — and
 * because the widget's gear card stays mounted between opens, closing and
 * reopening the configuration dialog did not clear it. Only a dashboard remount
 * did. The interval now backs off towards
 * {@link SETTLED_TOPICS_MAX_POLL_MS} instead, so an idle dashboard is cheap
 * while a late robot is still picked up.
 *
 * The hook takes no props, so nothing forces it to restart: widget definition
 * factories re-run on every dashboard render, and an effect keyed on a value
 * that arrives with a fresh identity each time would never reach its first
 * `await`.
 *
 * @returns `{ status: "waiting" }` until a non-empty list arrives, then
 * `{ status: "settled", topics }` with the latched list for this mount.
 */
export const useSettledTopics = (): SettledTopics => {
	const pluginsManager = usePluginsManager();
	const [result, setResult] = useState<SettledTopics>(WAITING_FOR_TOPICS);

	/** True once the list has latched; a ref because it must never re-arm. */
	const settledRef = useRef(false);

	useEffect(() => {
		if (settledRef.current) return;

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let delay = SETTLED_TOPICS_POLL_MS;

		const attempt = async () => {
			if (cancelled || settledRef.current) return;

			let listed: DatasourceTopic[] = [];
			try {
				listed = await pluginsManager.applyFilterAsync<
					DatasourceTopic[]
				>(PluginsHooks.AVAILABLE_TOPICS, []);
			} catch (error) {
				console.warn("Topic picker: failed to list topics", error);
			}

			if (cancelled || settledRef.current) return;

			if (listed.length === 0) {
				timer = setTimeout(attempt, delay);
				delay = nextSettledTopicsDelay(delay);
				return;
			}

			settledRef.current = true;
			setResult({ status: "settled", topics: listed });
		};

		void attempt();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [pluginsManager]);

	return result;
};
