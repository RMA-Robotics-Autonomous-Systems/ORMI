/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect } from "react";
import { usePluginsManager, PluginsManager } from "@workspace/ormi-plugins";
import {
	processTFMessage,
	clearTransformsFromDatasource,
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import { isTransientLocalTopic } from "@workspace/utils";
import { FoxgloveDataSourceSettings } from "./types";

interface TransformTreeManagerProps {
	settings: FoxgloveDataSourceSettings;
}

/**
 * Convert a raw ROS `TFMessage` to THREE convention and push it into the shared transform
 * table. Exported so the full pipeline (subscribe → published hook → table) is testable.
 *
 * @param datasourceId - Datasource id (namespaces the frames).
 * @param message - Raw TF message (`{ transforms: [...] }`) as delivered to the published hook.
 * @param isStatic - Whether this came from a latched (`/tf_static`) topic.
 */
export function applyFoxgloveTransformMessage(
	datasourceId: string,
	message: { transforms?: any[] } | null | undefined,
	isStatic: boolean,
): void {
	if (!message?.transforms) return;

	const convertedMessage = {
		...message,
		transforms: message.transforms.map((tf: any) => {
			const translation = tf.transform?.translation ?? {
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
			return {
				...tf,
				transform: {
					...tf.transform,
					translation: convertPosition(translation, "ROS", "THREE"),
					rotation: convertQuaternion(rotation, "ROS", "THREE"),
					convention: "THREE",
				},
			};
		}),
	};

	processTFMessage(datasourceId, convertedMessage, { isStatic });
}

/**
 * Wire a Foxglove datasource's transform topics into the shared table: register a per-topic
 * message handler **before** subscribing (so a fast latched `/tf_static` is never dropped),
 * then subscribe. Returns a cleanup that removes the handlers, unsubscribes, and clears this
 * datasource's transforms — they repopulate on reconnect (`/tf_static` is re-latched, `/tf`
 * on the next message).
 *
 * Exported so the full pipeline can be integration-tested without rendering the component.
 *
 * @param pluginsManager - The plugins manager.
 * @param settings - Foxglove datasource settings (id + `transformTreeTopics`).
 * @returns Cleanup function.
 */
export function setupFoxgloveTransformManager(
	pluginsManager: PluginsManager,
	settings: FoxgloveDataSourceSettings,
): () => void {
	const datasource_id = settings.id;
	const topics = settings.transformTreeTopics || [];

	// 1. Register message handlers (before subscribing).
	const actionIds: string[] = [];
	topics.forEach((topic) => {
		const messageHook = `${datasource_id}-${topic}-published`;
		const actionId = `${datasource_id}-transform-${topic}`;
		const isStatic = isTransientLocalTopic(topic);
		actionIds.push(actionId);

		pluginsManager.addAction(messageHook, {
			id: actionId,
			action: (message: any) =>
				applyFoxgloveTransformMessage(datasource_id, message, isStatic),
			priority: 100,
		});
	});

	// 2. Subscribe to transform topics. The datasource's `*-subscribe` action is registered by a
	//    parent component (SubscriptionManager / worker host). React fires child effects before
	//    parent effects, and the worker path registers the action only after an async handshake —
	//    so on first mount the action does not exist yet. Wait for it (rather than firing a plain
	//    `doAction`, which `console.warn`s "No action found" and silently drops the subscribe,
	//    starving the whole transform table).
	const subscribeHook = `${datasource_id}-subscribe`;
	let disposed = false;
	topics.forEach(async (topic) => {
		const datasourceTopic = {
			topic,
			datasource_id,
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
		actionIds.forEach((actionId) => pluginsManager.removeAction(actionId));

		topics.forEach(async (topic) => {
			const datasourceTopic = {
				topic,
				datasource_id,
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

		// Drop this datasource's dynamic edges (static is retained for remount). They repopulate
		// on reconnect; a real, stable connection only triggers this on genuine disconnect.
		clearTransformsFromDatasource(datasource_id);
	};
}

/**
 * TransformTreeManager - subscribes a Foxglove datasource's `/tf` and `/tf_static` topics and
 * feeds them into the shared transform table; widgets re-render reactively.
 */
const TransformTreeManager: React.FC<TransformTreeManagerProps> = ({
	settings,
}) => {
	const pluginsManager = usePluginsManager();
	const datasource_id = settings.id;
	const enable = settings.enable;
	// Stable signature so the effect re-runs only when the topic set actually changes — not on
	// every parent re-render (e.g. connection-status updates).
	const topicsKey = (settings.transformTreeTopics || []).join("|");

	useEffect(() => {
		if (!enable) {
			return;
		}
		return setupFoxgloveTransformManager(pluginsManager, settings);
		// `settings` is read inside but intentionally excluded; id/enable/topics cover it.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enable, datasource_id, topicsKey, pluginsManager]);

	return null;
};

export { TransformTreeManager };
export type { TransformTreeManagerProps };
