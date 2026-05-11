/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { toast } from "sonner";
import { useRosbridgeData } from "./rosbridge-data-handler";
import { SubscriberService } from "./subscriber-service";
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

	const serviceRef = useRef<SubscriberService | null>(null);
	const settingsRef = useRef(settings);
	useLayoutEffect(() => {
		settingsRef.current = settings;
	});

	const datasource_id = settings.id;
	const subscribe_hook = `${datasource_id}-subscribe`;
	const unsubscribe_hook = `${datasource_id}-unsubscribe`;

	useEffect(() => {
		const service = new SubscriberService();
		serviceRef.current = service;

		pluginsManager.addAction(subscribe_hook, {
			id: subscribe_hook,
			action: async (topic: DatasourceTopic) => {
				try {
					service.subscribe(ros, topic, (message: any) => {
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
					service.unsubscribe(topic, ignoreCount);
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

		return () => {
			pluginsManager.removeAction(subscribe_hook);
			pluginsManager.removeAction(unsubscribe_hook);
			service.cleanup();
			serviceRef.current = null;
		};
	}, [ros, datasource_id, subscribe_hook, unsubscribe_hook, pluginsManager]);

	return <>{children}</>;
};

export { SubscriptionManager };
