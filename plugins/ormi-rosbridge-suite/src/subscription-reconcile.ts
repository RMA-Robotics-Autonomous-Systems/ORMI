/**
 * Pure decision logic for reconciling the rosbridge datasource's live
 * `ROSLIB.Topic` subscriptions against the topics the subscription registry has
 * asked us to subscribe.
 *
 * Each `ROSLIB.Topic` is bound to a specific `ROSLIB.Ros` connection. On a
 * reconnect the old connection's topics are dead, but the subscription registry
 * re-flushes the recorded subscriptions by re-invoking the `${id}-subscribe`
 * action. That action short-circuits on the stale live-subscriber entry and
 * only bumps a refcount, so without reconciliation the topic stays "subscribed"
 * to a dead socket and never receives data again.
 *
 * The durable record of intent is the set of topics the registry asked for
 * (kept independently of the ROS connection, keyed by topic name). When a new
 * connection stabilizes we drop the stale live subscribers and diff the
 * recorded intent against what is currently live, re-subscribing whatever is
 * missing on the new connection. This module isolates that diff as a pure
 * function so it can be unit tested without roslib or a React tree.
 */

/** Recorded intent for a single requested topic. */
export interface RequestedTopic {
	/** Raw ROS message type, needed to recreate the `ROSLIB.Topic`. */
	rawType: string;
	/** Refcount of widgets that requested this topic. */
	count: number;
}

/** A topic that must be (re)subscribed on the current connection. */
export interface TopicToResubscribe {
	topic: string;
	rawType: string;
}

/**
 * Computes the topics that must be (re)subscribed to bring the live
 * subscriptions in line with the registry's recorded intent.
 *
 * A topic is scheduled only when it is requested and has no live subscriber.
 * Already-live topics are skipped, which makes the function idempotent: feeding
 * back its own result (now reflected as live subscribers) yields an empty list,
 * so it never double-subscribes.
 *
 * @param requested Recorded intent keyed by topic name; the value carries the
 *   `rawType` needed to recreate the subscription.
 * @param liveTopicNames Topics with a live `ROSLIB.Topic` on the current
 *   connection.
 * @returns The topics to subscribe now, in `requested` iteration order.
 */
export function topicsToResubscribe(
	requested: Map<string, RequestedTopic>,
	liveTopicNames: Set<string>,
): TopicToResubscribe[] {
	const toResubscribe: TopicToResubscribe[] = [];
	for (const [topic, { rawType }] of requested) {
		// Already live → idempotent skip (never double-subscribe).
		if (liveTopicNames.has(topic)) continue;
		toResubscribe.push({ topic, rawType });
	}
	return toResubscribe;
}
