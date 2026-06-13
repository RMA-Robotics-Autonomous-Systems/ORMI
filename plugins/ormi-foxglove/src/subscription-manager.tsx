/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, {
	ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Channel, MessageData } from "@foxglove/ws-protocol";
import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";

import { UnifiedConverter } from "./unified-converter";
import { MessageCoalescer } from "./message-coalescer";
import {
	FoxgloveDataSourceSettings,
	Subscriber,
	PendingSubscription,
	DatasourceTopic,
} from "./types";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { metrics } from "@workspace/utils";
import { useFoxgloveData } from "./foxglove-data-handler";
import { topicsToSubscribe } from "./subscription-reconcile";
import { toast } from "sonner";

interface SubscriptionManagerProps {
	children: ReactNode;
	settings: FoxgloveDataSourceSettings;
}

/**
 * TF messages are deltas — different frame pairs arrive in different
 * messages — so last-wins coalescing would silently lose transforms. Topics
 * with these schemas must use the lossless queue mode.
 */
const isTfLikeSchema = (schemaName: string): boolean =>
	schemaName === "tf2_msgs/msg/TFMessage" ||
	schemaName.endsWith("/TFMessage");

/** True when `stamp` looks like a ROS2 `builtin_interfaces/Time`. */
const isRosStamp = (
	stamp: unknown,
): stamp is { sec: number; nanosec: number } =>
	typeof stamp === "object" &&
	stamp !== null &&
	(stamp as any).sec !== undefined &&
	(stamp as any).nanosec !== undefined;

/** Converts a ROS2 `builtin_interfaces/Time` to JavaScript milliseconds. */
const rosStampToMillis = (stamp: { sec: number; nanosec: number }): number =>
	stamp.sec * 1000 + stamp.nanosec / 1000000;

/**
 * Extracts `frame_id` and timestamp from a decoded ROS2 message with a
 * bounded, shape-aware probe: the standard `header`, then
 * `transforms[0].header` (TFMessage), then top-level `frame_id`/`stamp`,
 * then one level of plain-object children (max depth 2). Arrays and typed
 * arrays are never enumerated — a headerless point cloud must not cost
 * O(points) of property enumeration. Falls back to `"unknown"` /
 * `Date.now()` when nothing is found, like the previous deep scan.
 */
function extractMessageMeta(parsed: unknown): {
	frameId: string;
	timestamp: number;
} {
	let frameId = "unknown";
	let timestamp = Date.now();

	if (typeof parsed !== "object" || parsed === null) {
		return { frameId, timestamp };
	}
	const msg = parsed as any;

	let frameFound = false;
	let stampFound = false;

	// Standard std_msgs/Header.
	if (typeof msg.header?.frame_id === "string") {
		frameId = msg.header.frame_id;
		frameFound = true;
	}
	if (isRosStamp(msg.header?.stamp)) {
		timestamp = rosStampToMillis(msg.header.stamp);
		stampFound = true;
	}

	// tf2_msgs/TFMessage shape: read the first transform's header.
	if (Array.isArray(msg.transforms) && msg.transforms.length > 0) {
		const first = msg.transforms[0];
		if (typeof first?.header?.frame_id === "string") {
			frameId = first.header.frame_id;
			frameFound = true;
			if (!stampFound && isRosStamp(first.header.stamp)) {
				timestamp = rosStampToMillis(first.header.stamp);
				stampFound = true;
			}
		} else {
			// Multiple transforms without a readable single frame.
			frameId = "tf_multiple";
			frameFound = true;
		}
	}

	// Top-level frame_id/stamp (headerless messages).
	if (!frameFound && typeof msg.frame_id === "string") {
		frameId = msg.frame_id;
		frameFound = true;
	}
	if (!stampFound && isRosStamp(msg.stamp)) {
		timestamp = rosStampToMillis(msg.stamp);
		stampFound = true;
	}

	// Last resort: probe direct plain-object children only. Never recurse
	// further and never enumerate arrays or typed arrays.
	if (!frameFound || !stampFound) {
		for (const key of Object.keys(msg)) {
			if (frameFound && stampFound) break;
			const child = msg[key];
			if (
				child === null ||
				typeof child !== "object" ||
				Array.isArray(child) ||
				ArrayBuffer.isView(child)
			) {
				continue;
			}
			if (!frameFound) {
				if (typeof child.frame_id === "string") {
					frameId = child.frame_id;
					frameFound = true;
				} else if (typeof child.header?.frame_id === "string") {
					frameId = child.header.frame_id;
					frameFound = true;
				}
			}
			if (!stampFound) {
				if (isRosStamp(child.stamp)) {
					timestamp = rosStampToMillis(child.stamp);
					stampFound = true;
				} else if (isRosStamp(child.header?.stamp)) {
					timestamp = rosStampToMillis(child.header.stamp);
					stampFound = true;
				}
			}
		}
	}

	return { frameId, timestamp };
}

/**
 * Builds the raw-message coalescer for one manager instance. The dispatcher
 * is dereferenced through a ref at drain time (timer/socket callbacks, never
 * during render) so the long-lived coalescer always decodes through the
 * latest closure.
 */
const createDrainCoalescer = (
	dispatchRef: React.RefObject<(messageData: MessageData) => void>,
) =>
	new MessageCoalescer<MessageData>((messageData) =>
		dispatchRef.current(messageData),
	);

const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({
	children,
	settings,
}) => {
	const { client, channels, addCallback, removeCallback } = useFoxgloveData();
	const pluginsManager = usePluginsManager();

	// Initialization state
	const [isInitialized, setIsInitialized] = useState(false);

	// Stable refs for values used inside long-lived action closures.
	// Using refs instead of closing over state prevents the hook-registration
	// effect from re-running (and briefly removing/re-adding subscribe hooks)
	// every time a channel is advertised.
	// Assigned during render (not in a useEffect) so the ref is always
	// current before any effect fires — the standard "latest ref" pattern.
	const channelsRef = useRef(channels);
	const clientRef = useRef(client);
	channelsRef.current = channels;
	clientRef.current = client;

	// State management refs
	const subscribersRef = useRef<Map<number, Subscriber>>(new Map());
	const pendingSubscriptionsRef = useRef<Map<number, PendingSubscription>>(
		new Map(),
	);

	// Durable record of "what the registry asked us to subscribe", keyed by
	// topic name with the requested refcount as value. Independent of async
	// channel/pending timing: the subscribe/unsubscribe actions update it
	// synchronously at the top, so it survives the mount→unmount→mount churn
	// caused by StrictMode double-invoke and real reconnects. This is the source
	// of truth the reconcile diffs against the client's live subscribers.
	const requestedTopicsRef = useRef<Map<string, number>>(new Map());

	// Tracks whether DATASOURCE_READY has already been re-fired for the current
	// stable (client + non-empty channels) window, so the stabilize effect fires
	// it exactly once per (re)connect instead of on every render. Reset on
	// disconnect so the next connection re-aligns the registry's wire state.
	const readyFiredRef = useRef(false);

	// Latest-ref so the long-lived coalescer always drains through the
	// current decode closure (pluginsManager, settings) without being
	// recreated. Assigned below, after decodeAndDispatch is defined.
	const decodeAndDispatchRef = useRef<(messageData: MessageData) => void>(
		() => {},
	);

	// One coalescer per manager instance. Raw payloads are stashed on
	// arrival and decoded on its ~30 Hz drain tick; per-message error
	// handling lives inside decodeAndDispatch, so one bad message cannot
	// break a drain tick for other topics.
	const [coalescer] = useState(() =>
		createDrainCoalescer(decodeAndDispatchRef),
	);

	// Function queue for ordered processing
	const queueRef = useRef<Map<number, Array<() => Promise<void>>>>(new Map());
	const processingRef = useRef<Map<number, boolean>>(new Map());

	const datasource_id = settings.id;
	const subscribe_hook = `${datasource_id}-subscribe`;
	const unsubscribe_hook = `${datasource_id}-unsubscribe`;

	// Topics that must use the lossless coalescer queue: configured
	// transform-tree topics plus any TF-schema channel. TF streams are
	// deltas, so last-wins coalescing would silently lose transforms.
	const isLosslessTopic = (topic: string, schemaName: string): boolean =>
		(settings.transformTreeTopics ?? []).includes(topic) ||
		isTfLikeSchema(schemaName);

	// Utility functions
	const hashTopicName = (topic: string): number => {
		let hash = 0;
		for (let i = 0; i < topic.length; i++) {
			const char = topic.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash);
	};

	const enqueueOperation = async (
		id: number,
		operation: () => Promise<void>,
	): Promise<void> => {
		if (!queueRef.current.has(id)) {
			queueRef.current.set(id, []);
			processingRef.current.set(id, false);
		}

		return new Promise<void>((resolve, reject) => {
			queueRef.current.get(id)?.push(async () => {
				try {
					await operation();
					resolve();
				} catch (error) {
					reject(error);
					console.error(
						`Error in enqueued operation for ID ${id}:`,
						error,
					);
				}
			});

			processQueue(id);
		});
	};

	const processQueue = async (id: number) => {
		if (processingRef.current.get(id)) {
			return;
		}

		processingRef.current.set(id, true);

		while (
			queueRef.current.has(id) &&
			queueRef.current.get(id)!.length > 0
		) {
			const operation = queueRef.current.get(id)?.shift();
			if (operation) {
				try {
					await operation();
				} catch (error) {
					console.error(
						`Unexpected error awaiting queued operation for ID ${id}:`,
						error,
					);
				}
			}
		}

		processingRef.current.set(id, false);

		if (!queueRef.current.get(id)?.length) {
			queueRef.current.delete(id);
			processingRef.current.delete(id);
		}
	};

	/**
	 * Subscribes the client to a known channel and registers the resulting
	 * Subscriber, deduped per channelId via the operation queue. Shared by the
	 * direct subscribe path and the reconcile so both produce an identical
	 * Subscriber (reader, lossless flag, producedId, hook). Idempotent: if a
	 * subscriber for this channelId already exists, its count is bumped instead
	 * of issuing a second `client.subscribe`, so concurrent callers (direct
	 * path, pending machinery, reconcile) never double-subscribe.
	 *
	 * @param channel The advertised channel to subscribe.
	 * @param count Initial subscriber count when newly created.
	 */
	const ensureSubscribedToChannel = async (
		channel: Channel,
		count: number,
	): Promise<void> => {
		await enqueueOperation(channel.id, async () => {
			// Already subscribed by channelId → bump refcount, never resubscribe.
			const existingSubscriber = Array.from(
				subscribersRef.current.values(),
			).find((s) => s.channelId === channel.id);

			if (existingSubscriber) {
				existingSubscriber.count += count;
				return;
			}

			if (!clientRef.current) {
				// No client yet: a later stabilize/reconcile will retry.
				await addPendingSubscription(channel.topic);
				return;
			}

			const subscriptionId = clientRef.current.subscribe(channel.id);

			if (subscriptionId === undefined || subscriptionId === null) {
				console.error(`Failed to subscribe to topic ${channel.topic}`);
				throw new Error(
					`Failed to subscribe to topic ${channel.topic}`,
				);
			}

			const subscriber = {
				subscriberId: subscriptionId,
				channelId: channel.id,
				topic: channel.topic,
				schemaName: channel.schemaName,
				webtype: UnifiedConverter.getWebappTypeFromROSType(
					channel.schemaName,
				),
				count,
				hook: `${datasource_id}-${channel.topic}-published`,
				reader: new MessageReader(
					parse(channel.schema, { ros2: true }),
				),
				lossless: isLosslessTopic(channel.topic, channel.schemaName),
				producedId: metrics.counter(
					`ds.${datasource_id}.topic.${channel.topic}.produced`,
				),
			} as Subscriber;

			subscribersRef.current.set(subscriptionId, subscriber);
			coalescer.start();
		});
	};

	const addPendingSubscription = async (topic: string): Promise<boolean> => {
		return new Promise<boolean>((resolve, reject) => {
			const pendingId = hashTopicName(topic);

			if (pendingSubscriptionsRef.current.has(pendingId)) {
				const existing =
					pendingSubscriptionsRef.current.get(pendingId)!;
				existing.count++;
				existing.resolvers.push(resolve);
				existing.rejectors.push(reject);
			} else {
				pendingSubscriptionsRef.current.set(pendingId, {
					topic,
					count: 1,
					resolvers: [resolve],
					rejectors: [reject],
				});

				if (settings.toasts) {
					toast("Pending Subscription: " + topic);
				}
			}
		});
	};

	const processPendingSubscriptions = (channel: Channel) => {
		const pendingIds = Array.from(pendingSubscriptionsRef.current.keys());

		for (const pendingId of pendingIds) {
			const pending = pendingSubscriptionsRef.current.get(pendingId);

			if (pending && pending.topic === channel.topic) {
				const topic: DatasourceTopic = {
					topic: channel.topic,
					datasource_id: datasource_id,
					source: settings,
					type:
						UnifiedConverter.getWebappTypeFromROSType(
							channel.schemaName,
						) || channel.schemaName,
					rawType: channel.schemaName,
				};

				enqueueOperation(channel.id, async () => {
					try {
						// Check if client is available
						if (!client) {
							// Keep the pending subscription for later retry
							return;
						}

						const subscriptionId = client.subscribe(channel.id);

						if (
							subscriptionId === undefined ||
							subscriptionId === null
						) {
							for (const rejector of pending.rejectors) {
								rejector(
									new Error(
										`Failed to subscribe to topic ${pending.topic}`,
									),
								);
							}
						} else {
							const subscriber = {
								subscriberId: subscriptionId,
								channelId: channel.id,
								topic: channel.topic,
								schemaName: channel.schemaName,
								webtype:
									UnifiedConverter.getWebappTypeFromROSType(
										channel.schemaName,
									),
								count: pending.count,
								hook: `${datasource_id}-${channel.topic}-published`,
								reader: new MessageReader(
									parse(channel.schema, { ros2: true }),
								),
								lossless: isLosslessTopic(
									channel.topic,
									channel.schemaName,
								),
								producedId: metrics.counter(
									`ds.${datasource_id}.topic.${channel.topic}.produced`,
								),
							} as Subscriber;

							subscribersRef.current.set(
								subscriptionId,
								subscriber,
							);
							coalescer.start();

							for (const resolver of pending.resolvers) {
								resolver(true);
							}

							if (settings.toasts) {
								toast(
									`Subscribed to pending topic: ${pending.topic}`,
								);
							}
						}

						pendingSubscriptionsRef.current.delete(pendingId);
					} catch (error) {
						console.error(
							`Failed to subscribe to pending topic ${pending.topic}:`,
							error,
						);
						for (const rejector of pending.rejectors) {
							rejector(error);
						}
						pendingSubscriptionsRef.current.delete(pendingId);
					}
				}).catch((error) => {
					console.error(
						`Error processing pending subscription for ${pending.topic}:`,
						error,
					);
				});
			}
		}
	};

	// Process pending subscriptions when client and channels become available
	useEffect(() => {
		if (!client || channels.size === 0) {
			return;
		}

		// Process any pending subscriptions that couldn't be handled due to missing client or channels
		const pendingIds = Array.from(pendingSubscriptionsRef.current.keys());

		for (const pendingId of pendingIds) {
			const pending = pendingSubscriptionsRef.current.get(pendingId);
			if (!pending) continue;

			// Find the channel for this pending topic
			const channel = Array.from(channels.values()).find(
				(ch) => ch.topic === pending.topic,
			);
			if (channel) {
				// Process this pending subscription now that client and channel are available
				processPendingSubscriptions(channel);
			}
		}
	}, [client, channels]);

	// Handle channel advertisements
	useEffect(() => {
		// Process pending subscriptions whenever channels change
		if (channels.size === 0) return;

		const pendingIds = Array.from(pendingSubscriptionsRef.current.keys());
		for (const pendingId of pendingIds) {
			const pending = pendingSubscriptionsRef.current.get(pendingId);
			if (!pending) continue;

			// Find the channel for this pending topic
			const channel = Array.from(channels.values()).find(
				(ch) => ch.topic === pending.topic,
			);
			if (channel) {
				processPendingSubscriptions(channel);
			}
		}
	}, [channels, client, settings, datasource_id]);

	// Reconcile the client's live subscriptions against the registry's recorded
	// intent. This is the robustness net for the mount/unmount churn described
	// on requestedTopicsRef: it (re)subscribes any requested topic that has an
	// advertised channel but no live subscriber. Idempotent — topics already
	// subscribed are skipped, and ensureSubscribedToChannel dedupes per channel
	// — so it is safe to call repeatedly and concurrently with the pending
	// machinery.
	const reconcileSubscriptions = useCallback(() => {
		if (!clientRef.current || channelsRef.current.size === 0) {
			return;
		}

		const channelValues = Array.from(channelsRef.current.values());
		const toSubscribe = topicsToSubscribe(
			requestedTopicsRef.current.keys(),
			subscribersRef.current.values(),
			channelValues,
		);

		for (const topicName of toSubscribe) {
			const channel = channelValues.find((ch) => ch.topic === topicName);
			if (!channel) continue; // Channel vanished between diff and use.

			const count = requestedTopicsRef.current.get(topicName) ?? 1;
			ensureSubscribedToChannel(channel, count).catch((error) => {
				console.error(
					`Failed to reconcile subscription for ${topicName}:`,
					error,
				);
			});
		}
		// channelValues is recomputed inside; refs are stable, so the callback
		// only needs to change when the (re)connect identity does.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [client, channels]);

	// Run the reconcile when the connection and channel list stabilize — the
	// moment channels/client become available after a (re)connect or remount.
	// Also re-fire DATASOURCE_READY once per stable window so the registry
	// re-flushes any wire it left idle during the churn (idempotent for other
	// listeners). The readyFiredRef guard prevents firing on every render; it is
	// reset on disconnect so the next connection realigns the wire state.
	useEffect(() => {
		if (client && channels.size > 0) {
			reconcileSubscriptions();

			if (!readyFiredRef.current) {
				readyFiredRef.current = true;
				pluginsManager.doAction(
					PluginsHooks.DATASOURCE_READY,
					datasource_id,
				);
			}
		} else {
			// Lost the client or all channels: next stabilize must re-fire READY.
			readyFiredRef.current = false;
		}
	}, [
		channels,
		client,
		reconcileSubscriptions,
		pluginsManager,
		datasource_id,
	]);

	// Decode + dispatch one stashed raw message. Runs from the coalescer's
	// drain tick, NOT on message arrival — high-rate topics pay at most one
	// decode per drain tick instead of one per wire message.
	const decodeAndDispatch = (messageData: MessageData) => {
		// Get the subscriber directly by subscriptionId
		const subscriber = subscribersRef.current.get(
			messageData.subscriptionId,
		);

		if (!subscriber) {
			return;
		}

		try {
			const parsed = subscriber.reader.readMessage(messageData.data);

			const { frameId, timestamp } = extractMessageMeta(parsed);

			const convertedMessage = UnifiedConverter.convertToWebapp(
				parsed,
				subscriber.webtype,
				subscriber.schemaName,
			);

			// Handle Image type: convert to ImageBitmap asynchronously
			if (
				subscriber.webtype === "Image" &&
				convertedMessage &&
				typeof convertedMessage === "object"
			) {
				if ("__imageData" in convertedMessage) {
					// Raw image: convert ImageData to ImageBitmap
					createImageBitmap(convertedMessage.__imageData).then(
						(bitmap) => {
							pluginsManager.doAction(
								subscriber.hook,
								bitmap,
								timestamp,
								frameId,
							);
						},
					);
					return;
				} else if ("__compressedData" in convertedMessage) {
					// Compressed image: decode via Blob to ImageBitmap
					const format = convertedMessage.__format || "jpeg";
					let mimeType = "image/jpeg";
					if (format.includes("png")) mimeType = "image/png";
					else if (format.includes("webp")) mimeType = "image/webp";

					const blob = new Blob([convertedMessage.__compressedData], {
						type: mimeType,
					});
					createImageBitmap(blob).then((bitmap) => {
						pluginsManager.doAction(
							subscriber.hook,
							bitmap,
							timestamp,
							frameId,
						);
					});
					return;
				}
			}

			pluginsManager.doAction(
				subscriber.hook,
				convertedMessage,
				timestamp,
				frameId,
			);
		} catch (error) {
			// Handle CDR reading errors gracefully
			console.error(
				`Error parsing message for subscription ${messageData.subscriptionId} (topic: ${subscriber.topic}):`,
				error,
			);

			// Don't spam the console with repeated errors for the same topic
			const errorKey = `${subscriber.topic}_parse_error`;
			if (!(window as any)[errorKey]) {
				(window as any)[errorKey] = true;

				// Show toast for first occurrence only
				if (settings.toasts) {
					toast(
						`Message parsing error on topic ${subscriber.topic}. Check console for details.`,
					);
				}
			}
			return; // Skip this message
		}
	};

	// Keep the coalescer draining through the latest closure. Effect-time
	// assignment is safe: drains only run from timers/socket events, which
	// fire after effects have committed.
	useEffect(() => {
		decodeAndDispatchRef.current = decodeAndDispatch;
	});

	// Handle incoming messages: stash the raw bytes only (O(1), no copy, no
	// decode). The payload's ArrayBuffer is per-WebSocket-event, so holding
	// the view until the drain tick is safe.
	useEffect(() => {
		if (!client) return;

		const handleMessage = (messageData: MessageData) => {
			// Get the subscriber directly by subscriptionId
			const subscriber = subscribersRef.current.get(
				messageData.subscriptionId,
			);

			if (!subscriber) {
				return;
			}

			// Count every raw arrival before coalescing — produced vs
			// delivered (counted at the subscription registry) exposes the
			// coalescing drop ratio in the diagnostics panel.
			metrics.add(subscriber.producedId);

			coalescer.push(
				messageData.subscriptionId,
				messageData,
				subscriber.lossless,
			);
		};

		client.on("message", handleMessage);

		return () => {
			client.off("message", handleMessage);
		};
	}, [client, coalescer]);

	// Register plugin system hooks
	useEffect(() => {
		if (!settings.enable) {
			return;
		}

		// Subscribe action
		pluginsManager.addAction(subscribe_hook, {
			id: subscribe_hook,
			action: async (topic: DatasourceTopic) => {
				// Record the intent first, before any async channel lookup, so
				// the reconcile can recover this subscription even if the
				// connection/channels churn before the direct path completes.
				requestedTopicsRef.current.set(
					topic.topic,
					(requestedTopicsRef.current.get(topic.topic) ?? 0) + 1,
				);

				// Find the channel id
				const channel = Array.from(channelsRef.current.values()).find(
					(channel) => {
						return channel.topic === topic.topic;
					},
				);

				if (!channel) {
					// Topic doesn't exist yet, add to pending subscriptions
					await addPendingSubscription(topic.topic);
					return;
				}

				// Subscribe through the shared helper so the direct path and the
				// reconcile build an identical Subscriber and dedupe per channel.
				await ensureSubscribedToChannel(channel, 1).catch(() => {
					if (settings.toasts) {
						toast(
							"Error: Failed to subscribe to topic " +
								topic.topic,
						);
					}
				});
			},
			priority: 100,
		});

		// Unsubscribe action
		pluginsManager.addAction(unsubscribe_hook, {
			id: unsubscribe_hook,
			action: async (
				topic: DatasourceTopic,
				ignoreCount: boolean = false,
			) => {
				// Drop the recorded intent so the reconcile won't resubscribe a
				// topic the registry no longer wants. ignoreCount removes the
				// request entirely; otherwise decrement and delete at <= 0.
				const requested =
					requestedTopicsRef.current.get(topic.topic) ?? 0;
				if (ignoreCount || requested <= 1) {
					requestedTopicsRef.current.delete(topic.topic);
				} else {
					requestedTopicsRef.current.set(topic.topic, requested - 1);
				}

				// Find the channel id
				const channel = Array.from(channelsRef.current.values()).find(
					(channel) => {
						return channel.topic === topic.topic;
					},
				);

				// First, check if this is a pending subscription
				const pendingId = hashTopicName(topic.topic);
				const pendingSubscription =
					pendingSubscriptionsRef.current.get(pendingId);

				if (pendingSubscription) {
					// Handle unsubscribing from a pending subscription
					if (ignoreCount) {
						// Remove the pending subscription completely
						pendingSubscriptionsRef.current.delete(pendingId);

						if (settings.toasts) {
							toast(
								"Pending Subscription Canceled: " + topic.topic,
							);
						}
						return;
					} else {
						// Decrease the count
						pendingSubscription.count--;

						if (pendingSubscription.count <= 0) {
							// Remove the pending subscription
							pendingSubscriptionsRef.current.delete(pendingId);

							if (settings.toasts) {
								toast(
									"Pending Subscription Canceled: " +
										topic.topic,
								);
							}
						}
						return;
					}
				}

				// If not a pending subscription and channel not found, handle gracefully
				if (!channel) {
					// Try to find and remove any subscriber that might still exist for this topic
					const orphanedSubscriber = Array.from(
						subscribersRef.current.entries(),
					).find(([_, s]) => s.topic === topic.topic);
					if (orphanedSubscriber) {
						const [subscriptionId, subscriber] = orphanedSubscriber;
						subscribersRef.current.delete(subscriptionId);
						coalescer.remove(subscriptionId);
						if (subscribersRef.current.size === 0) {
							coalescer.stop();
						}

						pluginsManager.removeAction(subscriber.hook);
					}

					return; // Exit gracefully instead of throwing
				}

				const channelId = channel.id;

				// Queue the unsubscribe operation
				await enqueueOperation(channelId, async () => {
					// Find the subscriber by channelId since we now key by subscriptionId
					const subscriber = Array.from(
						subscribersRef.current.values(),
					).find((s) => s.channelId === channelId);

					if (!subscriber) {
						return;
					}

					if (ignoreCount) {
						subscriber.count = 0;
					} else {
						subscriber.count--;
					}

					if (subscriber.count <= 0) {
						if (clientRef.current) {
							clientRef.current.unsubscribe(
								subscriber.subscriberId,
							);
						}
						subscribersRef.current.delete(subscriber.subscriberId);
						coalescer.remove(subscriber.subscriberId);
						if (subscribersRef.current.size === 0) {
							coalescer.stop();
						}
					}
				}).catch((error) => {
					if (settings.toasts) {
						toast(
							"Error: Failed to unsubscribe from topic " +
								topic.topic,
						);
					}
				});
			},
			priority: 100,
		});

		// Mark as initialized after successful registration
		setIsInitialized(true);

		// The `-subscribe` action is now live. DATASOURCE_READY was already fired (by the
		// connection) before this manager's effect ran — and child subscribers (e.g. the TF
		// manager, mounted as our child → child effect first) subscribed against the registry
		// when no `-subscribe` action existed yet, leaving those intents parked. Re-fire READY so
		// the registry re-flushes them against the live action. Idempotent for other listeners.
		pluginsManager.doAction(PluginsHooks.DATASOURCE_READY, datasource_id);

		// Cleanup function
		return () => {
			setIsInitialized(false);
			pluginsManager.removeAction(subscribe_hook);
			pluginsManager.removeAction(unsubscribe_hook);
		};
	}, [settings.enable, settings.id, pluginsManager]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			// Clean up all subscriptions
			if (client) {
				subscribersRef.current.forEach((subscriber, subscriptionId) => {
					client.unsubscribe(subscriptionId);
				});
			}
			subscribersRef.current.clear();

			// No subscriptions remain: stop the drain tick and discard any
			// undrained raw payloads (their channels belong to the old client).
			coalescer.stop();

			// Resolve pending subscriptions
			pendingSubscriptionsRef.current.forEach((pending) => {
				for (const resolver of pending.resolvers) {
					resolver(false);
				}
			});
			pendingSubscriptionsRef.current.clear();

			// Clear queues
			queueRef.current.clear();
			processingRef.current.clear();
		};
	}, [client]);

	return <>{isInitialized ? children : null}</>;
};

export { SubscriptionManager };
export type { SubscriptionManagerProps };
