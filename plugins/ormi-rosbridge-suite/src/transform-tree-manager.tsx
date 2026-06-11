/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect } from "react";
import { usePluginsManager } from "@workspace/ormi-plugins";
import {
	processTFMessage,
	clearTransformsFromDatasource,
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import { isTransientLocalTopic } from "@workspace/utils";
import type { RosBridgeSuiteDataSourceSettings } from "./rosbridge-suite-source";

interface TransformTreeManagerProps {
	settings: RosBridgeSuiteDataSourceSettings;
}

/**
 * TransformTreeManager — feeds a RosBridge datasource's `/tf` and `/tf_static` topics into the
 * shared transform table.
 *
 * Mirrors the Foxglove manager: it subscribes through the datasource's `*-subscribe` action,
 * receives the raw ROS `TFMessage` (TF topics have no webapp converter, so the source passes
 * them through unchanged), converts each transform ROS → THREE at this boundary, and pushes it
 * via `processTFMessage`. Message handlers are registered *before* subscribing so a fast
 * latched `/tf_static` delivery is never dropped.
 */
const TransformTreeManager: React.FC<TransformTreeManagerProps> = ({
	settings,
}) => {
	const pluginsManager = usePluginsManager();

	const datasource_id = settings.id;
	const enable = settings.enable;
	// Stable signature so the effect re-runs only when the topic set actually changes — not on
	// every parent re-render. Re-running tears down + clears this datasource's transforms.
	const topicsKey = (settings.transformTreeTopics || []).join("|");

	useEffect(() => {
		if (!enable) {
			return;
		}

		// 1. Register message handlers (before subscribing — R4 ordering invariant).
		const actionIds: string[] = [];
		(settings.transformTreeTopics || []).forEach((topic) => {
			const messageHook = `${datasource_id}-${topic}-published`;
			const actionId = `${datasource_id}-transform-${topic}`;
			const isStatic = isTransientLocalTopic(topic);
			actionIds.push(actionId);

			pluginsManager.addAction(messageHook, {
				id: actionId,
				action: (
					message: any,
					_timestamp: number,
					_frameId: string,
				) => {
					if (!message?.transforms) return;

					// Convert TF to THREE convention once at the datasource boundary.
					const convertedMessage = {
						...message,
						transforms: (message.transforms || []).map(
							(tf: any) => {
								const translation = tf.transform
									?.translation ?? {
									x: 0,
									y: 0,
									z: 0,
								};
								const rotation = tf.transform?.rotation ?? {
									x: 0,
									y: 0,
									z: 0,
									w: 1,
								};

								const convertedTranslation = convertPosition(
									translation,
									"ROS",
									"THREE",
								);
								const convertedRotation = convertQuaternion(
									rotation,
									"ROS",
									"THREE",
								);

								return {
									...tf,
									transform: {
										...tf.transform,
										translation: convertedTranslation,
										rotation: convertedRotation,
										convention: "THREE",
									},
								};
							},
						),
					};

					processTFMessage(datasource_id, convertedMessage, {
						isStatic,
					});
				},
				priority: 100,
			});
		});

		// 2. Subscribe to transform topics. `type`/`rawType` map to no webapp converter, so the
		//    source passes the raw ROS TFMessage through to our handler. The `*-subscribe` action
		//    is registered by the source provider, which may not have mounted/registered it yet on
		//    first effect run — wait for it instead of firing a plain `doAction` (which would
		//    `console.warn` "No action found" and silently drop the subscribe, starving the table).
		const subscribeHook = `${datasource_id}-subscribe`;
		let disposed = false;
		(settings.transformTreeTopics || []).forEach(async (topic) => {
			const datasourceTopic = {
				topic: topic,
				datasource_id: datasource_id,
				source: settings,
				type: "tf2_msgs/msg/TFMessage",
				rawType: "tf2_msgs/msg/TFMessage",
			};

			try {
				const ready =
					await pluginsManager.WaitForActionToExist(subscribeHook);
				if (!ready) {
					console.error(
						`TransformTreeManager: subscribe action never registered for ${topic} — TF not subscribed.`,
					);
					return;
				}
				// Unmounted while waiting → abort so a pending subscribe can't land after the
				// cleanup's unsubscribe (idempotency guardrail).
				if (disposed) return;
				await pluginsManager.doAction(subscribeHook, datasourceTopic);
			} catch (error) {
				console.error(
					`TransformTreeManager: Failed to subscribe to transform topic ${topic}:`,
					error,
				);
			}
		});

		return () => {
			disposed = true;
			actionIds.forEach((actionId) => {
				pluginsManager.removeAction(actionId);
			});

			(settings.transformTreeTopics || []).forEach(async (topic) => {
				const datasourceTopic = {
					topic: topic,
					datasource_id: datasource_id,
					source: settings,
					type: "tf2_msgs/msg/TFMessage",
					rawType: "tf2_msgs/msg/TFMessage",
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

			// Drop this datasource's dynamic edges; static (/tf_static) edges are retained by
			// default so a remount keeps latched frames.
			clearTransformsFromDatasource(datasource_id);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enable, datasource_id, topicsKey, pluginsManager]);

	return null;
};

export { TransformTreeManager };
export type { TransformTreeManagerProps };
