/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { ReactNode, useEffect, useState } from "react";
import { usePluginsManager } from "@workspace/ormi-plugins";
import {
	processTFMessage,
	clearTransformsFromDatasource,
} from "@workspace/ormi-core/transforms";
import { FoxgloveDataSourceSettings } from "./types";

interface TransformTreeManagerProps {
	children: ReactNode;
	settings: FoxgloveDataSourceSettings;
}

/**
 * TransformTreeManager - Manages transform tree updates for a Foxglove datasource
 *
 * Now uses an event-driven approach with Jotai atoms:
 * - Subscribes to /tf and /tf_static topics
 * - On each message, pushes transforms directly to the global atom
 * - Widgets automatically re-render when atoms update
 */
const TransformTreeManager: React.FC<TransformTreeManagerProps> = ({
	children,
	settings,
}) => {
	const pluginsManager = usePluginsManager();
	const [isInitialized, setIsInitialized] = useState(false);

	const datasource_id = settings.id;

	// Register message handlers and subscribe to transform topics
	useEffect(() => {
		if (!settings.enable) {
			return;
		}

		// Register message handlers for transform tree topics
		const actionIds: string[] = [];
		(settings.transformTreeTopics || []).forEach((topic) => {
			const messageHook = `${datasource_id}-${topic}-published`;
			const actionId = `${datasource_id}-transform-${topic}`;
			actionIds.push(actionId);

			pluginsManager.addAction(messageHook, {
				id: actionId,
				action: (
					message: any,
					_timestamp: number,
					_frameId: string,
				) => {
					// Push transforms directly to the atom
					processTFMessage(datasource_id, message);
				},
				priority: 100,
			});
		});

		// Subscribe to transform tree topics
		(settings.transformTreeTopics || []).forEach(async (topic) => {
			const datasourceTopic = {
				topic: topic,
				datasource_id: datasource_id,
				source: settings,
				type: "tf2_msgs/TFMessage",
				rawType: "tf2_msgs/TFMessage",
			};

			try {
				await pluginsManager.doAction(
					`${datasource_id}-subscribe`,
					datasourceTopic,
				);
			} catch (error) {
				console.error(
					`TransformTreeManager: Failed to subscribe to transform topic ${topic}:`,
					error,
				);
			}
		});

		setIsInitialized(true);

		return () => {
			setIsInitialized(false);

			// Remove message handlers
			actionIds.forEach((actionId) => {
				pluginsManager.removeAction(actionId);
			});

			// Unsubscribe from transform tree topics
			(settings.transformTreeTopics || []).forEach(async (topic) => {
				const datasourceTopic = {
					topic: topic,
					datasource_id: datasource_id,
					source: settings,
					type: "tf2_msgs/TFMessage",
					rawType: "tf2_msgs/TFMessage",
				};

				try {
					await pluginsManager.doAction(
						`${datasource_id}-unsubscribe`,
						datasourceTopic,
						true,
					);
				} catch (error) {
					console.error(
						`TransformTreeManager: Failed to unsubscribe from transform topic ${topic}:`,
						error,
					);
				}
			});

			// Clear transforms from this datasource
			clearTransformsFromDatasource(datasource_id);
		};
	}, [
		settings.enable,
		settings.id,
		settings.transformTreeTopics,
		pluginsManager,
		datasource_id,
	]);

	return <>{isInitialized ? children : null}</>;
};

export { TransformTreeManager };
export type { TransformTreeManagerProps };
