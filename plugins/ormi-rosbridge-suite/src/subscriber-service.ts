import * as ROSLIB from "roslib";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";
import { RefCountedSubscriptionRegistry } from "./ref-counted-subscription-registry";

/** Minimal interface for the ROSLIB.Topic lifecycle methods used here. */
export interface TopicLike {
	subscribe(callback: (msg: unknown) => void): void;
	unsubscribe(): void;
}

export type TopicFactory = (opts: {
	ros: ROSLIB.Ros;
	name: string;
	messageType: string;
}) => TopicLike;

/**
 * SubscriberService manages ref-counted ROSLIB.Topic subscriptions.
 *
 * A single ROSLIB subscriber is created on the first `subscribe` call for a
 * topic and destroyed only when all consumers have unsubscribed (ref count
 * reaches zero) or `cleanup()` is called.  The optional `factory` parameter
 * makes the class fully testable without a real ROS connection.
 */
export class SubscriberService {
	private readonly subscriptions =
		new RefCountedSubscriptionRegistry<TopicLike>();
	private readonly factory: TopicFactory;

	constructor(factory: TopicFactory = (opts) => new ROSLIB.Topic(opts)) {
		this.factory = factory;
	}

	/**
	 * Subscribe to a topic.  If the topic already has an active subscriber,
	 * its ref count is incremented and no new ROSLIB.Topic is created.
	 */
	subscribe(
		ros: ROSLIB.Ros,
		topic: DatasourceTopic,
		onMessage: (msg: unknown) => void,
	): void {
		this.subscriptions.subscribe(topic.topic, () => {
			const subscriber = this.factory({
				ros,
				name: topic.topic,
				messageType: topic.rawType,
			});
			subscriber.subscribe(onMessage);
			return { subscriber, metadata: undefined };
		});
	}

	/**
	 * Decrement the ref count for a topic.  When the count reaches zero (or
	 * `ignoreCount` is true) the underlying ROSLIB subscriber is destroyed.
	 */
	unsubscribe(topic: DatasourceTopic, ignoreCount = false): void {
		this.subscriptions.unsubscribe(topic.topic, ignoreCount);
	}

	/**
	 * Unsubscribe all active topics and reset internal state.
	 * Called when the datasource is torn down (e.g. connection lost or
	 * component unmounted).
	 */
	cleanup(): void {
		this.subscriptions.cleanup();
	}

	/** Number of topics with at least one active subscriber. */
	get activeCount(): number {
		return this.subscriptions.activeCount;
	}

	/** Ref count for the given topic name. Returns 0 when not subscribed. */
	refCountFor(topicName: string): number {
		return this.subscriptions.refCountFor(topicName);
	}
}
