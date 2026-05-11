/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { usePluginsManager } from "@workspace/ormi-plugins";
import {
	processTFMessage,
	clearTransformsFromDatasource,
} from "@workspace/ormi-core/transforms";
import {
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import type { RosBridgeSuiteDataSourceSettings } from "./types";

const DEFAULT_TF_TOPICS = ["/tf", "/tf_static"];
const TF_MESSAGE_TYPE = "tf2_msgs/msg/TFMessage";

interface TransformTreeManagerProps {
	settings: RosBridgeSuiteDataSourceSettings;
}

/**
 * TransformTreeManager subscribes to the configured transform topics (default:
 * /tf and /tf_static) and feeds each message into the global transform atom so
 * that any 3-D widget can query the frame tree without additional wiring.
 */
const TransformTreeManager: React.FC<TransformTreeManagerProps> = ({
	settings,
}) => {
	const pluginsManager = usePluginsManager();
	const datasource_id = settings.id;
	const settingsRef = useRef(settings);
	useLayoutEffect(() => {
		settingsRef.current = settings;
	});

	// Fall back to the known defaults so existing saved datasources that
	// pre-date the transformTreeTopics field still subscribe to /tf and /tf_static.
	const enabled = settings.enable;
	const transformTopicsKey = (
		settings.transformTreeTopics?.length
			? settings.transformTreeTopics
			: DEFAULT_TF_TOPICS
	).join(",");

	useEffect(() => {
		if (!enabled) return;

		// Derive topics inside the effect so transformTopicsKey is the only dep needed.
		const transformTopics = transformTopicsKey
			? transformTopicsKey.split(",")
			: DEFAULT_TF_TOPICS;

		const actionIds: string[] = [];

		transformTopics.forEach((topic) => {
			const messageHook = `${datasource_id}-${topic}-published`;
			const actionId = `${datasource_id}-transform-${topic}`;
			actionIds.push(actionId);

			pluginsManager.addAction(messageHook, {
				id: actionId,
				action: (message: any) => {
					const convertedMessage = {
						...message,
						transforms: (message.transforms ?? []).map(
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
								return {
									...tf,
									transform: {
										...tf.transform,
										translation: convertPosition(
											translation,
											"ROS",
											"THREE",
										),
										rotation: convertQuaternion(
											rotation,
											"ROS",
											"THREE",
										),
										convention: "THREE",
									},
								};
							},
						),
					};
					processTFMessage(datasource_id, convertedMessage);
				},
				priority: 100,
			});
		});

		// Subscribe to each transform topic via the datasource's subscribe hook.
		transformTopics.forEach((topic) => {
			const datasourceTopic = {
				topic,
				datasource_id,
				source: settingsRef.current,
				type: TF_MESSAGE_TYPE,
				rawType: TF_MESSAGE_TYPE,
			};
			pluginsManager.doAction(
				`${datasource_id}-subscribe`,
				datasourceTopic,
			);
		});

		return () => {
			actionIds.forEach((id) => pluginsManager.removeAction(id));

			// Fire unsubscribe requests without awaiting — the action hooks above
			// are already removed so no new TF messages will be processed.
			transformTopics.forEach((topic) => {
				const datasourceTopic = {
					topic,
					datasource_id,
					source: settingsRef.current,
					type: TF_MESSAGE_TYPE,
					rawType: TF_MESSAGE_TYPE,
				};
				pluginsManager.doAction(
					`${datasource_id}-unsubscribe`,
					datasourceTopic,
					true,
				);
			});

			clearTransformsFromDatasource(datasource_id);
		};
	}, [enabled, transformTopicsKey, datasource_id, pluginsManager]);

	return null;
};

export { TransformTreeManager };
