/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference lib="webworker" />

// ROSLIB accesses `window` in some internal code paths.
// Provide a fallback so it works inside a Web Worker.
if (typeof window === "undefined") {
	(self as any).window = self;
}

import * as ROSLIB from "roslib";
import { createRpcServer } from "@workspace/ormi-core/datasources/worker";
import { UnifiedConverter } from "./ros2/unified-converter";
import {
	getTopicsList,
	getAllTopicTypes,
	getTopicsAndRawTypes,
} from "./ros-api";
import type {
	DatasourceTopic,
	DatasourceProviderSettings,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import type { JsonSchema } from "@jsonforms/core";
import type { RosBridgeSuiteDataSourceSettings } from "./types";
import type {
	RosbridgeWorkerMethods,
	RosbridgeWorkerEvents,
} from "./rosbridge-worker-protocol";
import { RefCountedSubscriptionRegistry } from "./ref-counted-subscription-registry";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let settings: RosBridgeSuiteDataSourceSettings | null = null;
let ros: ROSLIB.Ros | null = null;
let connected = false;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastError: string | undefined;

/** Cached topic → JsonSchema map, invalidated on reconnect. */
let definitionCache: Map<string, JsonSchema> | null = null;

interface PublisherEntry {
	publisher: ROSLIB.Topic<any>;
	count: number;
	rawType: string;
}

const subscriptions = new RefCountedSubscriptionRegistry<
	ROSLIB.Topic<any>,
	{ webType: string; rawType: string }
>();
const publishers = new Map<string, PublisherEntry>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EmitFn = (
	event: keyof RosbridgeWorkerEvents,
	payload: RosbridgeWorkerEvents[keyof RosbridgeWorkerEvents],
	transfer?: Transferable[],
) => void;

let emit: EmitFn | null = null;

const emitStatus = () => {
	emit?.("connection-status", {
		connected,
		error: lastError,
		reconnectAttempt,
	});
};

const clearReconnectTimer = () => {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
};

const scheduleReconnect = (error?: string) => {
	if (!settings) return;
	clearReconnectTimer();
	lastError = error;
	reconnectAttempt += 1;
	emitStatus();

	const interval = (settings.reconnectTimeout || 3) * 1000;
	reconnectTimer = setTimeout(() => connect(), interval);
};

/** Re-subscribe all tracked topics on a fresh ROSLIB.Ros instance. */
const resubscribeAll = () => {
	if (!ros) return;
	for (const [topicName, entry] of subscriptions.entries()) {
		// Replace the ROSLIB.Topic instance with a new one on the new ros object.
		// The subscriber callback closure still refs `emit` via module scope.
		const oldSubscriber = entry.subscriber;
		try {
			oldSubscriber.unsubscribe();
		} catch {
			// ignore
		}

		const newSubscriber = new ROSLIB.Topic<any>({
			ros,
			name: topicName,
			messageType: entry.metadata.rawType,
		});

		subscriptions.replaceSubscriber(topicName, newSubscriber);
		attachSubscriberCallback(
			topicName,
			newSubscriber,
			entry.metadata.webType,
			entry.metadata.rawType,
		);
	}
};

/** Re-advertise all tracked publishers on a fresh ROSLIB.Ros instance. */
const readvertiseAll = () => {
	if (!ros) return;
	for (const [topicName, entry] of publishers) {
		try {
			entry.publisher.unadvertise();
		} catch {
			// ignore
		}
		const newPublisher = new ROSLIB.Topic<any>({
			ros,
			name: topicName,
			messageType: entry.rawType,
		});
		newPublisher.advertise();
		entry.publisher = newPublisher;
	}
};

/** Attach the message handler to a ROSLIB.Topic subscriber. */
const attachSubscriberCallback = (
	topicName: string,
	subscriber: ROSLIB.Topic<any>,
	webType: string,
	rawType: string,
) => {
	subscriber.subscribe(async (message: any) => {
		const frameId = message?.header?.frame_id ?? "unknown";

		const converted = UnifiedConverter.convertToWebapp(
			message,
			webType,
			rawType,
		);

		// Images: convert ImageData → transferable ImageBitmap in the worker.
		if (webType === "Image" && converted && typeof converted === "object") {
			if ("__imageData" in converted) {
				try {
					const bitmap = await createImageBitmap(
						(converted as any).__imageData,
					);
					emit?.(
						"topic-published",
						{
							topic: topicName,
							data: bitmap,
							time: Date.now(),
							referenceFrameId: frameId,
						},
						[bitmap],
					);
				} catch {
					// fall through to generic publish if createImageBitmap fails
				}
				return;
			}
			if ("__compressedData" in converted) {
				const format = (converted as any).__format ?? "jpeg";
				const mimeType = format.includes("png")
					? "image/png"
					: format.includes("webp")
						? "image/webp"
						: "image/jpeg";
				const blob = new Blob([(converted as any).__compressedData], {
					type: mimeType,
				});
				try {
					const bitmap = await createImageBitmap(blob);
					emit?.(
						"topic-published",
						{
							topic: topicName,
							data: bitmap,
							time: Date.now(),
							referenceFrameId: frameId,
						},
						[bitmap],
					);
				} catch {
					// fall through
				}
				return;
			}
		}

		emit?.("topic-published", {
			topic: topicName,
			data: converted,
			time: Date.now(),
			referenceFrameId: frameId,
		});
	});
};

const connect = () => {
	clearReconnectTimer();
	if (!settings) return;

	// Close previous connection.
	if (ros) {
		try {
			ros.close();
		} catch {
			// ignore
		}
		ros = null;
	}

	definitionCache = null;

	const instance = new ROSLIB.Ros({ url: settings.url });
	ros = instance;

	instance.on("connection", () => {
		connected = true;
		reconnectAttempt = 0;
		lastError = undefined;
		emitStatus();
		// Re-establish subscriptions and publishers after reconnect.
		resubscribeAll();
		readvertiseAll();
	});

	instance.on("error", (error: any) => {
		lastError = error instanceof Error ? error.message : String(error);
		// ROSLIB fires error then close; let close drive the reconnect.
	});

	instance.on("close", () => {
		if (connected) {
			connected = false;
			scheduleReconnect(lastError ?? "Rosbridge connection lost");
		}
	});
};

// ---------------------------------------------------------------------------
// RPC server
// ---------------------------------------------------------------------------

const server = createRpcServer<RosbridgeWorkerMethods, RosbridgeWorkerEvents>(
	self as unknown as {
		postMessage: DedicatedWorkerGlobalScope["postMessage"];
		addEventListener: DedicatedWorkerGlobalScope["addEventListener"];
		removeEventListener: DedicatedWorkerGlobalScope["removeEventListener"];
	},
	{
		// ------------------------------------------------------------------
		// Base DatasourceWorkerMethods
		// ------------------------------------------------------------------

		init: async (s: DatasourceProviderSettings) => {
			const typed = s as RosBridgeSuiteDataSourceSettings;
			settings = typed;
			reconnectAttempt = 0;
			lastError = undefined;
			connect();
		},

		listTopics: async (): Promise<DatasourceTopic[]> => {
			if (!ros || !settings) return [];
			try {
				const rosTopics = await getTopicsList(ros);
				return rosTopics.map((t) => ({
					topic: t.topic,
					datasource_id: settings!.id,
					source: settings!,
					type:
						UnifiedConverter.getWebappTypeFromROSType(t.type) ?? "",
					rawType: t.type,
				}));
			} catch {
				return [];
			}
		},

		subscribe: async (topic: SelectedTopic) => {
			if (!ros) return;
			const activeRos = ros;

			subscriptions.subscribe(topic.topic, () => {
				const subscriber = new ROSLIB.Topic<any>({
					ros: activeRos,
					name: topic.topic,
					messageType: topic.rawType,
				});
				attachSubscriberCallback(
					topic.topic,
					subscriber,
					topic.type,
					topic.rawType,
				);
				return {
					subscriber,
					metadata: {
						webType: topic.type,
						rawType: topic.rawType,
					},
				};
			});
		},

		unsubscribe: async (topic: SelectedTopic, ignoreCount = false) => {
			subscriptions.unsubscribe(topic.topic, ignoreCount);
		},

		// No services in rosbridge plugin for now.
		executeRemoteCall: async () => ({
			callId: "unsupported",
			status: "failed" as const,
		}),

		cancelRemoteCall: async () => false,

		shutdown: () => {
			clearReconnectTimer();
			connected = false;
			if (ros) {
				try {
					ros.close();
				} catch {
					// ignore
				}
				ros = null;
			}
			subscriptions.clear();
			publishers.clear();
			definitionCache = null;
			emitStatus();
		},

		// ------------------------------------------------------------------
		// Extended RosbridgeWorkerMethods
		// ------------------------------------------------------------------

		listTypes: async (webtypes?: string[]) => {
			if (!ros) return [];
			try {
				const allTypes = await getAllTopicTypes(ros);
				if (!webtypes || webtypes.length === 0) return allTypes;

				const compatible = new Set<string>();
				webtypes.forEach((webtype) => {
					const entry = UnifiedConverter.converters[webtype];
					if (entry) {
						Object.keys(entry.conversions).forEach((t) =>
							compatible.add(t),
						);
					}
				});
				return allTypes.filter((t) => compatible.has(t));
			} catch {
				return [];
			}
		},

		getDefinition: async (topic: DatasourceTopic) => {
			if (!ros) return null;

			// Check if it's a primitive type that needs no schema.
			const converter = UnifiedConverter.converters[topic.type];
			if (converter?.isPrimitive) return null;

			try {
				if (!definitionCache) {
					definitionCache = await getTopicsAndRawTypes(ros);
				}
				return definitionCache.get(topic.topic) ?? null;
			} catch {
				return null;
			}
		},

		advertise: async (topic: DatasourceTopic): Promise<boolean> => {
			if (!ros) return false;

			const existing = publishers.get(topic.topic);
			if (existing) {
				existing.count++;
				return true;
			}

			try {
				const publisher = new ROSLIB.Topic<any>({
					ros,
					name: topic.topic,
					messageType: topic.rawType,
				});
				publisher.advertise();
				publishers.set(topic.topic, {
					publisher,
					count: 1,
					rawType: topic.rawType,
				});
				return true;
			} catch {
				return false;
			}
		},

		unadvertise: async (topic: DatasourceTopic, ignoreCount = false) => {
			const entry = publishers.get(topic.topic);
			if (!entry) return;

			if (ignoreCount) {
				entry.count = 0;
			} else {
				entry.count -= 1;
			}

			if (entry.count <= 0) {
				try {
					entry.publisher.unadvertise();
				} catch {
					// ignore
				}
				publishers.delete(topic.topic);
			}
		},

		publish: async (
			topic: DatasourceTopic,
			message: unknown,
			webtype: string,
		) => {
			const entry = publishers.get(topic.topic);
			if (!entry || !connected) return;

			try {
				const converted = UnifiedConverter.convertToROS2(
					message,
					webtype,
					topic.rawType,
				);
				entry.publisher.publish(converted as Record<string, unknown>);
			} catch (error) {
				console.error(
					`[Rosbridge Worker] Failed to publish on ${topic.topic}:`,
					error,
				);
			}
		},

		getConnectionStatus: () => ({
			connected,
			error: lastError,
			reconnectAttempt,
		}),
	},
);

// Capture the emit function so event helpers can use it.
emit = server.emit;
