/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect } from "react";
import { usePluginsManager, PluginsManager } from "@workspace/ormi-plugins";
import {
	processTFMessage,
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import {
	isTransientLocalTopic,
	getDatasourceSubscriptionRegistry,
} from "@workspace/utils";
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
 * Wire a Foxglove datasource's transform topics into the shared table through the datasource
 * subscription registry (the shared bookkeeper): it waits for `DATASOURCE_READY`, refcounts,
 * re-subscribes on reconnect, and is StrictMode-safe — so the mount-order race that previously
 * needed a hand-rolled `WaitForActionToExist` is handled centrally. Each message is converted
 * ROS → THREE and pushed via `processTFMessage`. Returns a cleanup that releases the registry
 * intents only — the table is cleared automatically by the core datasource provider when the
 * datasource leaves the dashboard (a transient remount keeps its frames; see
 * `reconcileTransformSources`).
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
	const registry = getDatasourceSubscriptionRegistry(pluginsManager);

	const handles = topics.map((topic) => {
		const isStatic = isTransientLocalTopic(topic);
		// `type`/`rawType` map to no webapp converter, so the source passes the raw ROS
		// `TFMessage` straight through to `onData`.
		const datasourceTopic = {
			topic,
			datasource_id,
			source: settings,
			type: "tf2_msgs/msg/TFMessage",
			rawType: "tf2_msgs/msg/TFMessage",
		};
		return registry.subscribe({
			topic: datasourceTopic,
			onData: (message: any) =>
				applyFoxgloveTransformMessage(datasource_id, message, isStatic),
		});
	});

	// Release the registry intents only. Clearing the table is the core provider's job
	// (reconcileTransformSources) so a transient remount doesn't drop frames.
	return () => handles.forEach((handle) => handle.unsubscribe());
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
