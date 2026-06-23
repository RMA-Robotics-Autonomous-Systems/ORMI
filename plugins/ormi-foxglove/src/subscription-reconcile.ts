/**
 * Pure decision logic for reconciling the foxglove client's actual
 * subscriptions against the topics the subscription registry has asked us to
 * subscribe.
 *
 * The datasource connection, the SubscriptionManager (which registers the
 * `${id}-subscribe` action), and each widget's intent provider mount/unmount on
 * independent schedules. React StrictMode double-invoke (dev) and real
 * reconnects produce a mount→unmount→mount churn. After it settles the registry
 * can believe a wire is handled while the foxglove client never actually
 * subscribed it on the FINAL connection (or a pending subscription was dropped
 * during a teardown).
 *
 * The durable record of intent is the set of topic names the registry asked
 * for. Whenever the connection and channel list stabilize, we diff that intent
 * against the client's live subscribers and (re)subscribe whatever is missing.
 * This module isolates the diff as a pure function so it can be unit tested
 * without a foxglove client or React tree.
 */

/** Minimal channel shape needed to decide whether a topic can be subscribed. */
export interface ReconcileChannel {
	topic: string;
}

/** Minimal subscriber shape needed to detect an already-live subscription. */
export interface ReconcileSubscriber {
	topic: string;
}

/**
 * Computes the topics that must be (re)subscribed to bring the client in line
 * with the registry's recorded intent.
 *
 * A topic is scheduled only when it is requested, has no live subscriber, and
 * its channel is currently advertised. Topics whose channel has not arrived yet
 * are skipped — a later channel advertisement will reconcile them. This makes
 * the function idempotent: feeding back its own result (now reflected as new
 * subscribers) yields an empty list, so it never double-subscribes.
 *
 * @param requestedTopics Topic names the registry asked us to subscribe (the
 *   durable intent; the value is the requested refcount, unused for the diff).
 * @param currentSubscribers Live subscribers, keyed by anything; only `.topic`
 *   is read to detect an existing subscription.
 * @param availableChannels Advertised channels; only `.topic` is read.
 * @returns The topic names to subscribe now, in `requestedTopics` iteration
 *   order, with no duplicates.
 */
export function topicsToSubscribe(
	requestedTopics: Iterable<string>,
	currentSubscribers: Iterable<ReconcileSubscriber>,
	availableChannels: Iterable<ReconcileChannel>,
): string[] {
	const subscribedTopics = new Set<string>();
	for (const subscriber of currentSubscribers) {
		subscribedTopics.add(subscriber.topic);
	}

	const advertisedTopics = new Set<string>();
	for (const channel of availableChannels) {
		advertisedTopics.add(channel.topic);
	}

	const toSubscribe: string[] = [];
	const seen = new Set<string>();
	for (const topic of requestedTopics) {
		if (seen.has(topic)) continue;
		seen.add(topic);

		// Already live → idempotent skip (never double-subscribe).
		if (subscribedTopics.has(topic)) continue;
		// Channel not advertised yet → a later advertisement will reconcile it.
		if (!advertisedTopics.has(topic)) continue;

		toSubscribe.push(topic);
	}

	return toSubscribe;
}
