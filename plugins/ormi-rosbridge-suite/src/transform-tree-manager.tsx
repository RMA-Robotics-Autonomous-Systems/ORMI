/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect } from "react";
import { usePluginsManager } from "@workspace/ormi-plugins";
import {
	processTFMessage,
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import {
	isTransientLocalTopic,
	getDatasourceSubscriptionRegistry,
} from "@workspace/utils";
import type { RosBridgeSuiteDataSourceSettings } from "./rosbridge-suite-source";

interface TransformTreeManagerProps {
	settings: RosBridgeSuiteDataSourceSettings;
}

/**
 * Convert a raw ROS `TFMessage` to THREE convention and push it into the shared transform table.
 *
 * @param datasourceId - Datasource id (namespaces the frames).
 * @param message - Raw TF message (`{ transforms: [...] }`).
 * @param isStatic - Whether this came from a latched (`/tf_static`) topic.
 */
function applyRosbridgeTransformMessage(
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
 * TransformTreeManager — feeds a RosBridge datasource's `/tf` and `/tf_static` topics into the
 * shared transform table through the datasource subscription registry (the shared bookkeeper:
 * READY-waited, refcounted, reconnect re-flush, StrictMode-safe). Each message is converted
 * ROS → THREE at this boundary and pushed via `processTFMessage`. TF topics have no webapp
 * converter, so the source passes the raw `TFMessage` straight through to `onData`.
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

		const registry = getDatasourceSubscriptionRegistry(pluginsManager);
		const handles = (settings.transformTreeTopics || []).map((topic) => {
			const isStatic = isTransientLocalTopic(topic);
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
					applyRosbridgeTransformMessage(
						datasource_id,
						message,
						isStatic,
					),
			});
		});

		// Release the registry intents only. The table is cleared automatically by the core
		// datasource provider when the datasource leaves the dashboard (a transient remount keeps
		// its frames; see `reconcileTransformSources`).
		return () => handles.forEach((handle) => handle.unsubscribe());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enable, datasource_id, topicsKey, pluginsManager]);

	return null;
};

export { TransformTreeManager };
export type { TransformTreeManagerProps };
