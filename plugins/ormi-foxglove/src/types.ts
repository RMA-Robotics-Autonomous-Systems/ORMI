/* eslint-disable @typescript-eslint/no-explicit-any */

import { MessageReader, MessageWriter } from "@foxglove/rosmsg2-serialization";
import {
	DatasourceProviderSettings,
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import type { CounterId } from "@workspace/utils";

/**
 * Extended settings for Foxglove data source.
 */
export interface FoxgloveDataSourceSettings extends DatasourceProviderSettings {
	url: string;
	reconnectTimeout: number;
	toasts: boolean;
	transformTreeTopics: string[];
}

/**
 * Subscriber for Foxglove topics.
 */
export interface Subscriber {
	subscriberId: number;
	channelId: number;
	topic: string;
	schemaName: string;
	webtype: string;
	count: number;
	hook: string;
	reader: MessageReader;
	/**
	 * True when raw frames must be queued losslessly instead of coalesced
	 * last-wins. Required for TF-like delta streams, where different frame
	 * pairs arrive in different messages.
	 */
	lossless: boolean;
	/** Metrics slot incremented on every raw arrival for this topic. */
	producedId: CounterId;
}

/**
 * Pending subscription awaiting resolution.
 */
export interface PendingSubscription {
	topic: string;
	count: number;
	resolvers: Array<(success: boolean) => void>;
	rejectors: Array<(error: any) => void>;
}

/**
 * Publisher for Foxglove topics.
 */
export interface Publisher {
	channelId: number;
	topic: string;
	schemaName: string;
	webtype: string;
	count: number;
	hook: string;
	writer: MessageWriter;
}

/**
 * Message data for Foxglove protocol.
 */
export interface FoxgloveMessageData {
	subscriptionId: number;
	timestamp: any;
	data: Uint8Array;
}

/**
 * Re-exported types for convenience.
 */
export type { DatasourceTopic, SelectedTopic };
