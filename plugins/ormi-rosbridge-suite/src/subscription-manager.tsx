/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import * as ROSLIB from "roslib";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { toast } from "sonner";
import { useRosbridgeData } from "./rosbridge-data-handler";
import { UnifiedConverter } from "./ros2/unified-converter";
import type { RosBridgeSuiteDataSourceSettings } from "./types";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";

interface SubscriptionManagerProps {
	children: ReactNode;
	settings: RosBridgeSuiteDataSourceSettings;
}

/**
 * SubscriptionManager registers the subscribe/unsubscribe action hooks for a
 * ROSBridge datasource.  Reference counting ensures a ROSLIB.Topic subscriber
 * is only created once regardless of how many widgets consume the same topic.
 */
const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({
	children,
	settings,
}) => {
	const { ros } = useRosbridgeData();
	const pluginsManager = usePluginsManager();

	const subscribersRef = useRef(new Map<string, ROSLIB.Topic<any>>());
	const countsRef = useRef(new Map<string, number>());
	const settingsRef = useRef(settings);
	useLayoutEffect(() => {
		settingsRef.current = settings;
	});

	const datasource_id = settings.id;
	const subscribe_hook = `${datasource_id}-subscribe`;
	const unsubscribe_hook = `${datasource_id}-unsubscribe`;

	useEffect(() => {
		pluginsManager.addAction(subscribe_hook, {
			id: subscribe_hook,
			action: async (topic: DatasourceTopic) => {
				try {
					// Increment ref-count if already subscribed.
					if (subscribersRef.current.has(topic.topic)) {
						countsRef.current.set(
							topic.topic,
							(countsRef.current.get(topic.topic) ?? 0) + 1,
						);
						return;
					}

					const subscriber = new ROSLIB.Topic<any>({
						ros,
						name: topic.topic,
						messageType: topic.rawType,
					});

					subscriber.subscribe((message: any) => {
						const frameId =
							(message as any)?.header?.frame_id ?? "unknown";
						const convertedMessage =
							UnifiedConverter.convertToWebapp(
								message,
								topic.type,
								topic.rawType,
							);

						// Handle Image type: async bitmap conversion.
						if (
							topic.type === "Image" &&
							convertedMessage &&
							typeof convertedMessage === "object"
						) {
							if ("__imageData" in convertedMessage) {
								createImageBitmap(
									convertedMessage.__imageData,
								).then((bitmap) => {
									pluginsManager.doAction(
										`${datasource_id}-${topic.topic}-published`,
										bitmap,
										Date.now(),
										frameId,
									);
								});
								return;
							}
							if ("__compressedData" in convertedMessage) {
								const format =
									convertedMessage.__format || "jpeg";
								let mimeType = "image/jpeg";
								if (format.includes("png"))
									mimeType = "image/png";
								else if (format.includes("webp"))
									mimeType = "image/webp";
								const blob = new Blob(
									[convertedMessage.__compressedData],
									{ type: mimeType },
								);
								createImageBitmap(blob).then((bitmap) => {
									pluginsManager.doAction(
										`${datasource_id}-${topic.topic}-published`,
										bitmap,
										Date.now(),
										frameId,
									);
								});
								return;
							}
						}

						pluginsManager.doAction(
							`${datasource_id}-${topic.topic}-published`,
							convertedMessage,
							Date.now(),
							frameId,
						);
					});

					subscribersRef.current.set(topic.topic, subscriber);
					countsRef.current.set(topic.topic, 1);
				} catch (error) {
					if (settingsRef.current.toasts) {
						toast(
							"Error subscribing to topic " +
								topic.topic +
								": " +
								(error instanceof Error
									? error.message
									: String(error)),
						);
					}
				}
			},
			priority: 100,
		});

		pluginsManager.addAction(unsubscribe_hook, {
			id: unsubscribe_hook,
			action: async (
				topic: DatasourceTopic,
				ignoreCount: boolean = false,
			) => {
				try {
					if (!subscribersRef.current.has(topic.topic)) return;

					const count = countsRef.current.get(topic.topic) ?? 0;
					countsRef.current.set(topic.topic, count - 1);

					if (count <= 1 || ignoreCount) {
						subscribersRef.current.get(topic.topic)!.unsubscribe();
						subscribersRef.current.delete(topic.topic);
						countsRef.current.delete(topic.topic);
					}
				} catch (error) {
					if (settingsRef.current.toasts) {
						toast(
							"Error unsubscribing from topic " +
								topic.topic +
								": " +
								(error instanceof Error
									? error.message
									: String(error)),
						);
					}
				}
			},
			priority: 100,
		});

		const subscribersSnapshot = subscribersRef.current;
		const countsSnapshot = countsRef.current;

		return () => {
			pluginsManager.removeAction(subscribe_hook);
			pluginsManager.removeAction(unsubscribe_hook);

			// Unsubscribe all active ROSLIB.Topic subscribers.
			subscribersSnapshot.forEach((subscriber) => {
				try {
					subscriber.unsubscribe();
				} catch {
					// ignore unsubscribe errors on cleanup
				}
			});
			subscribersSnapshot.clear();
			countsSnapshot.clear();
		};
	}, [ros, datasource_id, subscribe_hook, unsubscribe_hook, pluginsManager]);

	return <>{children}</>;
};

export { SubscriptionManager };
