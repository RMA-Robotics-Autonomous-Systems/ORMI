/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { ReactNode, useEffect, useRef, useState } from "react";
import { Channel, MessageData } from "@foxglove/ws-protocol";
import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";

import { UnifiedConverter } from "./unified-converter";
import {
	FoxgloveDataSourceSettings,
	Subscriber,
	PendingSubscription,
	DatasourceTopic,
} from "./types";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { useFoxgloveData } from "./foxglove-data-handler";
import { toast } from "sonner";

interface SubscriptionManagerProps {
	children: ReactNode;
	settings: FoxgloveDataSourceSettings;
}

const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({
	children,
	settings,
}) => {
	const { client, channels, addCallback, removeCallback } = useFoxgloveData();
	const pluginsManager = usePluginsManager();

	// Initialization state
	const [isInitialized, setIsInitialized] = useState(false);

	// State management refs
	const subscribersRef = useRef<Map<number, Subscriber>>(new Map());
	const pendingSubscriptionsRef = useRef<Map<number, PendingSubscription>>(
		new Map(),
	);

	// Function queue for ordered processing
	const queueRef = useRef<Map<number, Array<() => Promise<void>>>>(new Map());
	const processingRef = useRef<Map<number, boolean>>(new Map());

	const datasource_id = settings.id;
	const subscribe_hook = `${datasource_id}-subscribe`;
	const unsubscribe_hook = `${datasource_id}-unsubscribe`;

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
							} as Subscriber;

							subscribersRef.current.set(
								subscriptionId,
								subscriber,
							);

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

	// Handle incoming messages
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

			try {
				const parsed = subscriber.reader.readMessage(messageData.data);

				// Enhanced frameId parsing for complex messages
				let frameId = "unknown";

				// Extract timestamp from ROS2 message if available
				let timestamp = Date.now();

				// First, try the standard header.frame_id and header.stamp
				if ((parsed as any)?.header?.frame_id) {
					frameId = (parsed as any).header.frame_id;
				}

				// Extract timestamp from header.stamp if available
				if ((parsed as any)?.header?.stamp) {
					const stamp = (parsed as any).header.stamp;
					if (
						stamp.sec !== undefined &&
						stamp.nanosec !== undefined
					) {
						// Convert ROS2 timestamp (sec + nanosec) to JavaScript timestamp (milliseconds)
						timestamp = stamp.sec * 1000 + stamp.nanosec / 1000000;
					}
				}

				// For TF messages, extract from first transform
				if (
					(parsed as any)?.transforms &&
					Array.isArray((parsed as any).transforms) &&
					(parsed as any).transforms.length > 0
				) {
					const firstTransform = (parsed as any).transforms[0];
					if (firstTransform?.header?.frame_id) {
						frameId = firstTransform.header.frame_id;

						// Also try to get timestamp from first transform if not already found
						if (
							timestamp === Date.now() &&
							firstTransform?.header?.stamp
						) {
							const stamp = firstTransform.header.stamp;
							if (
								stamp.sec !== undefined &&
								stamp.nanosec !== undefined
							) {
								timestamp =
									stamp.sec * 1000 + stamp.nanosec / 1000000;
							}
						}
					} else {
						frameId = "tf_multiple"; // Multiple transforms without clear single frame
					}
				}
				// For other complex messages, try to find any frame_id field
				else if (typeof parsed === "object" && parsed !== null) {
					// Search for frame_id in nested structures
					const findFrameId = (obj: any): string | null => {
						if (obj && typeof obj === "object") {
							if (
								obj.frame_id &&
								typeof obj.frame_id === "string"
							) {
								return obj.frame_id;
							}
							for (const key in obj) {
								if (
									obj.hasOwnProperty &&
									obj.hasOwnProperty(key)
								) {
									const result = findFrameId(obj[key]);
									if (result) return result;
								}
							}
						}
						return null;
					};

					const foundFrameId = findFrameId(parsed);
					if (foundFrameId) {
						frameId = foundFrameId;
					}

					// Also search for timestamp in nested structures if not found yet
					if (timestamp === Date.now()) {
						const findTimestamp = (obj: any): number | null => {
							if (obj && typeof obj === "object") {
								// Look for stamp field with sec and nanosec
								if (
									obj.stamp &&
									obj.stamp.sec !== undefined &&
									obj.stamp.nanosec !== undefined
								) {
									return (
										obj.stamp.sec * 1000 +
										obj.stamp.nanosec / 1000000
									);
								}
								// Look for header with stamp
								if (
									obj.header?.stamp?.sec !== undefined &&
									obj.header?.stamp?.nanosec !== undefined
								) {
									return (
										obj.header.stamp.sec * 1000 +
										obj.header.stamp.nanosec / 1000000
									);
								}
								// Recursively search nested objects
								for (const key in obj) {
									if (
										obj.hasOwnProperty &&
										obj.hasOwnProperty(key)
									) {
										const result = findTimestamp(obj[key]);
										if (result !== null) return result;
									}
								}
							}
							return null;
						};

						const foundTimestamp = findTimestamp(parsed);
						if (foundTimestamp !== null) {
							timestamp = foundTimestamp;
						}
					}
				}

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
						else if (format.includes("webp"))
							mimeType = "image/webp";

						const blob = new Blob(
							[convertedMessage.__compressedData],
							{ type: mimeType },
						);
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
					console.warn(
						`Suppressing further parse errors for topic ${subscriber.topic}. Check message format and schema compatibility.`,
					);

					// Optional: Show toast for first occurrence only
					if (settings.toasts) {
						toast(
							`Message parsing error on topic ${subscriber.topic}. Check console for details.`,
						);
					}
				}
				return; // Skip this message
			}
		};

		client.on("message", handleMessage);

		return () => {
			client.off("message", handleMessage);
		};
	}, [client, pluginsManager]);

	// Register plugin system hooks
	useEffect(() => {
		if (!settings.enable) {
			return;
		}

		// Subscribe action
		pluginsManager.addAction(subscribe_hook, {
			id: subscribe_hook,
			action: async (topic: DatasourceTopic) => {
				// Find the channel id
				const channel = Array.from(channels.values()).find(
					(channel) => {
						return channel.topic === topic.topic;
					},
				);

				if (!channel) {
					// Topic doesn't exist yet, add to pending subscriptions
					await addPendingSubscription(topic.topic);
					return;
				}
				const channelId = channel.id;

				// Queue the subscription operation
				await enqueueOperation(channelId, async () => {
					// Check if the topic is already subscribed by finding subscriber with matching channelId
					const existingSubscriber = Array.from(
						subscribersRef.current.values(),
					).find((s) => s.channelId === channelId);

					if (existingSubscriber) {
						existingSubscriber.count++;
						return;
					}

					// Check if client is available
					if (!client) {
						await addPendingSubscription(topic.topic);
						return;
					}

					// Subscribe to the topic
					const subscriptionId = client.subscribe(channelId);

					if (
						subscriptionId === undefined ||
						subscriptionId === null
					) {
						console.error(
							`Failed to subscribe to topic ${topic.topic}`,
						);
						throw new Error(
							`Failed to subscribe to topic ${topic.topic}`,
						);
					}

					// Add the subscriber to the list
					const subscriber = {
						subscriberId: subscriptionId,
						channelId: channelId,
						topic: topic.topic,
						schemaName: channel.schemaName,
						webtype: UnifiedConverter.getWebappTypeFromROSType(
							channel.schemaName,
						),
						count: 1,
						hook: `${datasource_id}-${topic.topic}-published`,
						reader: new MessageReader(
							parse(channel.schema, { ros2: true }),
						),
					} as Subscriber;

					subscribersRef.current.set(subscriptionId, subscriber);
				}).catch((error) => {
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
				// Find the channel id
				const channel = Array.from(channels.values()).find(
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
					console.warn(
						`Channel not found for topic ${topic.topic}. This can happen during cleanup or if the topic was never advertised.`,
					);

					// Try to find and remove any subscriber that might still exist for this topic
					const orphanedSubscriber = Array.from(
						subscribersRef.current.entries(),
					).find(([_, s]) => s.topic === topic.topic);
					if (orphanedSubscriber) {
						const [subscriptionId, subscriber] = orphanedSubscriber;
						subscribersRef.current.delete(subscriptionId);

						try {
							pluginsManager.removeAction(subscriber.hook);
						} catch (error) {
							console.warn(
								`Error removing action hook for ${topic.topic}:`,
								error,
							);
						}
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
						if (client) {
							client.unsubscribe(subscriber.subscriberId);
						}
						subscribersRef.current.delete(subscriber.subscriberId);
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

		// Cleanup function
		return () => {
			setIsInitialized(false);
			pluginsManager.removeAction(subscribe_hook);
			pluginsManager.removeAction(unsubscribe_hook);
		};
	}, [settings.enable, settings.id, pluginsManager, client, channels]);

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
