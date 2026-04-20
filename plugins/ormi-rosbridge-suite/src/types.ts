/* eslint-disable @typescript-eslint/no-explicit-any */

import { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";

/**
 * Settings for the ROSBridge Suite datasource.
 */
export interface RosBridgeSuiteDataSourceSettings extends DatasourceProviderSettings {
	/** WebSocket URL of the ROSBridge server, e.g. ws://localhost:9090 */
	url: string;
	/** Seconds to wait before reconnecting after a disconnect */
	reconnectTimeout: number;
	/** Whether to show toast notifications on connection events */
	toasts: boolean;
	/** Topic names to subscribe for the transform tree (tf/tf_static) */
	transformTreeTopics: string[];
}

/**
 * A single ROS topic along with its message type.
 */
export interface ROSTopic {
	topic: string;
	type: string;
}
