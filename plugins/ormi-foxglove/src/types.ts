/* eslint-disable @typescript-eslint/no-explicit-any */

import { MessageReader, MessageWriter } from "@foxglove/rosmsg2-serialization";
import {
  DatasourceProviderSettings,
  DatasourceTopic,
  SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { TransformTree } from "@workspace/ormi-core/types";

// Extended settings for Foxglove data source
export interface FoxgloveDataSourceSettings extends DatasourceProviderSettings {
  url: string;
  reconnectTimeout: number;
  toasts: boolean;
  transformTreeTopics: string[];
}

// Subscriber interface
export interface Subscriber {
  subscriberId: number;
  channelId: number;
  topic: string;
  schemaName: string;
  webtype: string;
  count: number;
  hook: string;
  reader: MessageReader;
}

// Pending subscription interface
export interface PendingSubscription {
  topic: string;
  count: number;
  resolvers: Array<(success: boolean) => void>;
  rejectors: Array<(error: any) => void>;
}

// Publisher interface
export interface Publisher {
  channelId: number;
  topic: string;
  schemaName: string;
  webtype: string;
  count: number;
  hook: string;
  writer: MessageWriter;
}

// Message data interface for Foxglove protocol
export interface FoxgloveMessageData {
  subscriptionId: number;
  timestamp: any;
  data: Uint8Array;
}

// Re-export commonly used types
export type { DatasourceTopic, SelectedTopic, TransformTree };
