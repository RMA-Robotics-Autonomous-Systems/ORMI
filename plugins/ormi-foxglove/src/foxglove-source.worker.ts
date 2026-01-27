/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference lib="webworker" />

import {
    FoxgloveClient,
    Channel,
    MessageData,
    Service,
    ServiceCallResponse,
    ServiceCallFailure,
} from "@foxglove/ws-protocol";
import { parse } from "@foxglove/rosmsg";
import { MessageReader, MessageWriter } from "@foxglove/rosmsg2-serialization";

import type {
    DatasourceTopic,
    SelectedTopic,
    RemoteCallDefinition,
    RemoteCallOptions,
    RemoteCallResult,
    RemoteCallStatus,
} from "@workspace/ormi-core/datasources";
import { createRpcServer } from "@workspace/ormi-core/datasources/worker";
import {
    DatasourceErrorHandler,
    ErrorCategory,
    ErrorSeverity,
    createConnectionError,
    createConversionError,
    createSerializationError,
} from "@workspace/ormi-core/datasources/worker";

import { UnifiedConverter } from "./unified-converter";
import { foxgloveIdlToJsonSchema } from "./foxglove-idl-to-jsonschema";
import { interfaceList } from "./interface-list";
import type { FoxgloveDataSourceSettings } from "./types";
import type {
    FoxgloveWorkerEvents,
    FoxgloveWorkerMethods,
} from "./foxglove-worker-protocol";

interface SubscriberEntry {
    subscriptionId: number;
    channelId: number;
    topic: string;
    schemaName: string;
    webtype: string;
    count: number;
    reader: MessageReader;
}

interface PendingSubscriptionEntry {
    topic: string;
    count: number;
}

interface PublisherEntry {
    channelId: number;
    topic: string;
    schemaName: string;
    webtype: string;
    count: number;
    writer: MessageWriter;
}

interface PendingServiceCall {
    callId: number;
    serviceId: number;
    serviceName: string;
    startTime: number;
    resolve: (result: RemoteCallResult) => void;
    reject: (error: Error) => void;
    reader: MessageReader;
    timeoutId?: ReturnType<typeof setTimeout>;
}

let settings: FoxgloveDataSourceSettings | null = null;
let ws: WebSocket | null = null;
let client: FoxgloveClient | null = null;
let connected = false;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastError: string | undefined;
let errorHandler: DatasourceErrorHandler | null = null;

const channels = new Map<number, Channel>();
const subscribersById = new Map<number, SubscriberEntry>();
const subscribersByTopic = new Map<string, SubscriberEntry>();
const pendingSubscriptions = new Map<string, PendingSubscriptionEntry>();

const publishersByTopic = new Map<string, PublisherEntry>();
const schemaResolvers = new Map<
    string,
    {
        resolve: (schema: string) => void;
        reject: (error: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
    }
>();

// Pending operations queue for operations attempted while disconnected
const pendingAdvertiseOps = new Map<string, { topic: DatasourceTopic; resolve: (success: boolean) => void }>();
const pendingPublishOps: Array<{ topic: DatasourceTopic; message: unknown; webtype: string }> = [];
const MAX_PENDING_OPS = 100;

const services = new Map<number, Service>();
const writersByServiceId = new Map<number, MessageWriter>();
const readersByServiceId = new Map<number, MessageReader>();
const pendingCalls = new Map<number, PendingServiceCall>();
let callIdCounter = 1;

const emitStatus = (
    emit: (
        event: keyof FoxgloveWorkerEvents,
        payload: FoxgloveWorkerEvents[keyof FoxgloveWorkerEvents],
    ) => void,
) => {
    emit("connection-status", {
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

const scheduleReconnect = (
    emit: (
        event: keyof FoxgloveWorkerEvents,
        payload: FoxgloveWorkerEvents[keyof FoxgloveWorkerEvents],
    ) => void,
) => {
    if (!settings) return;
    clearReconnectTimer();

    reconnectAttempt += 1;
    emitStatus(emit);

    const interval = (settings.reconnectTimeout || 3) * 1000;
    reconnectTimer = setTimeout(() => {
        if (!settings) return;
        connect(emit);
    }, interval);
};

const teardownClient = () => {
    if (client) {
        try {
            client.off("advertise", handleAdvertise);
            client.off("unadvertise", handleUnadvertise);
            client.off("message", handleMessage);
            client.off("advertiseServices", handleAdvertiseServices);
            client.off("unadvertiseServices", handleUnadvertiseServices);
            client.off("serviceCallResponse", handleServiceCallResponse);
            client.off("serviceCallFailure", handleServiceCallFailure);
        } catch {
            // ignore
        }
    }

    client = null;
    channels.clear();
    services.clear();
    writersByServiceId.clear();
    readersByServiceId.clear();
    
    // Clean up schema resolvers to prevent memory leaks
    schemaResolvers.forEach((resolver) => {
        clearTimeout(resolver.timeout);
        resolver.reject(new Error("Connection teardown"));
    });
    schemaResolvers.clear();
    
    // Note: We intentionally keep subscribers/publishers to re-establish on reconnect
};

const connect = (
    emit: (
        event: keyof FoxgloveWorkerEvents,
        payload: FoxgloveWorkerEvents[keyof FoxgloveWorkerEvents],
    ) => void,
) => {
    if (!settings) return;

    teardownClient();

    ws = new WebSocket(settings.url, [
        FoxgloveClient.SUPPORTED_SUBPROTOCOL,
        "foxglove.sdk.v1",
    ]);

    ws.addEventListener("open", () => {
        connected = true;
        lastError = undefined;
        reconnectAttempt = 0;
        emitStatus(emit);
        
        // Process pending operations after connection is established
        processPendingOperations();
    });

    ws.addEventListener("close", (event) => {
        connected = false;
        if (!event.wasClean && errorHandler) {
            errorHandler.handle(
                createConnectionError(
                    "WebSocket connection closed unexpectedly",
                    settings?.id,
                    { code: event.code, reason: event.reason },
                ),
            );
        }
        emitStatus(emit);
        if (!event.wasClean) {
            scheduleReconnect(emit);
        }
    });

    ws.addEventListener("error", () => {
        connected = false;
        lastError = "Foxglove WebSocket error";
        if (errorHandler) {
            errorHandler.handle(
                createConnectionError(
                    "Foxglove WebSocket error",
                    settings?.id,
                    { url: settings?.url },
                ),
            );
        }
        emitStatus(emit);
        scheduleReconnect(emit);
    });

    client = new FoxgloveClient({ ws });

    client.on("advertise", handleAdvertise);
    client.on("unadvertise", handleUnadvertise);
    client.on("message", handleMessage);
    client.on("advertiseServices", handleAdvertiseServices);
    client.on("unadvertiseServices", handleUnadvertiseServices);
    client.on("serviceCallResponse", handleServiceCallResponse);
    client.on("serviceCallFailure", handleServiceCallFailure);
};

const handleAdvertise = (newChannels: Channel[]) => {
    newChannels.forEach((channel) => {
        channels.set(channel.id, channel);
        if (channel.schema) {
            const resolver = schemaResolvers.get(channel.schemaName);
            if (resolver) {
                clearTimeout(resolver.timeout);
                resolver.resolve(channel.schema);
                schemaResolvers.delete(channel.schemaName);
            }
        }
    });

    processPendingSubscriptions();
};

const handleUnadvertise = (removedChannelIds: number[]) => {
    removedChannelIds.forEach((id) => channels.delete(id));
};

const processPendingSubscriptions = () => {
    const currentClient = client;
    if (!currentClient || !connected) return;

    pendingSubscriptions.forEach((pending, topic) => {
        const channel = Array.from(channels.values()).find(
            (ch) => ch.topic === topic,
        );
        if (!channel) return;

        const subscriptionId = currentClient.subscribe(channel.id);
        if (subscriptionId === undefined || subscriptionId === null) return;

        const webtype =
            UnifiedConverter.getWebappTypeFromROSType(channel.schemaName) ||
            channel.schemaName;
        const reader = new MessageReader(parse(channel.schema, { ros2: true }));

        const subscriber: SubscriberEntry = {
            subscriptionId,
            channelId: channel.id,
            topic: channel.topic,
            schemaName: channel.schemaName,
            webtype,
            count: pending.count,
            reader,
        };

        subscribersById.set(subscriptionId, subscriber);
        subscribersByTopic.set(channel.topic, subscriber);
        pendingSubscriptions.delete(topic);
    });
};

const processPendingOperations = () => {
    if (!client || !connected) return;
    
    // Re-subscribe existing subscribers
    const existingSubscribers = Array.from(subscribersByTopic.values());
    subscribersById.clear();
    subscribersByTopic.clear();
    
    existingSubscribers.forEach((sub) => {
        const channel = Array.from(channels.values()).find(
            (ch) => ch.topic === sub.topic,
        );
        if (channel) {
            const subscriptionId = client!.subscribe(channel.id);
            if (subscriptionId !== undefined && subscriptionId !== null) {
                const newSub: SubscriberEntry = {
                    ...sub,
                    subscriptionId,
                    channelId: channel.id,
                };
                subscribersById.set(subscriptionId, newSub);
                subscribersByTopic.set(sub.topic, newSub);
            }
        }
    });
    
    // Process pending subscriptions
    processPendingSubscriptions();
    
    // Re-advertise existing publishers
    const existingPublishers = Array.from(publishersByTopic.entries());
    publishersByTopic.clear();
    
    existingPublishers.forEach(async ([topic, pub]) => {
        try {
            const channelId = client!.advertise({
                topic: pub.topic,
                encoding: "cdr",
                schemaName: pub.schemaName,
            });
            
            if (channelId !== undefined && channelId !== null) {
                const schema = await resolveSchema(pub.schemaName, channelId);
                if (schema) {
                    const parsed = parse(schema, { ros2: true });
                    const writer = new MessageWriter(parsed);
                    publishersByTopic.set(topic, {
                        ...pub,
                        channelId,
                        writer,
                    });
                }
            }
        } catch (error) {
            console.error(`Failed to re-advertise ${topic} on reconnect:`, error);
        }
    });
    
    // Process pending advertise operations
    pendingAdvertiseOps.forEach((op, topic) => {
        // Will be handled by the advertise method when called again
        op.resolve(false); // Signal retry needed
    });
    pendingAdvertiseOps.clear();
};

const handleMessage = (messageData: MessageData) => {
    const subscriber = subscribersById.get(messageData.subscriptionId);
    if (!subscriber) return;

    try {
        const parsed = subscriber.reader.readMessage(messageData.data);

        let frameId = "unknown";
        let timestamp = Date.now();

        if ((parsed as any)?.header?.frame_id) {
            frameId = (parsed as any).header.frame_id;
        }

        if ((parsed as any)?.header?.stamp) {
            const stamp = (parsed as any).header.stamp;
            if (stamp.sec !== undefined && stamp.nanosec !== undefined) {
                timestamp = stamp.sec * 1000 + stamp.nanosec / 1000000;
            }
        }

        let converted = parsed;
        try {
            converted = UnifiedConverter.convertToWebapp(
                parsed,
                subscriber.webtype,
                subscriber.schemaName,
            );
        } catch (error) {
            if (errorHandler) {
                errorHandler.handleRaw(error, {
                    severity: ErrorSeverity.WARNING,
                    category: ErrorCategory.CONVERSION,
                    context: {
                        topic: subscriber.topic,
                        schemaName: subscriber.schemaName,
                        webtype: subscriber.webtype,
                    },
                    message: `Failed to convert message for topic ${subscriber.topic}`,
                });
            }
            // Fall back to raw parsed data
            converted = parsed;
        }

        server.emit("topic-published", {
            topic: subscriber.topic,
            data: converted,
            time: timestamp,
            referenceFrameId: frameId,
        });
    } catch (error) {
        // ignore parse errors
    }
};

const handleAdvertiseServices = (newServices: Service[]) => {
    newServices.forEach((service) => {
        services.set(service.id, service);
        if (service.request?.schema) {
            try {
                const parsedRequest = parse(service.request.schema, {
                    ros2: true,
                });
                writersByServiceId.set(
                    service.id,
                    new MessageWriter(parsedRequest),
                );
            } catch {
                // ignore
            }
        }
        if (service.response?.schema) {
            try {
                const parsedResponse = parse(service.response.schema, {
                    ros2: true,
                });
                readersByServiceId.set(
                    service.id,
                    new MessageReader(parsedResponse),
                );
            } catch {
                // ignore
            }
        }
    });

    server.emit("remote-calls", { calls: getRemoteCallDefinitions() });
};

const handleUnadvertiseServices = (removedServiceIds: number[]) => {
    removedServiceIds.forEach((id) => {
        services.delete(id);
        writersByServiceId.delete(id);
        readersByServiceId.delete(id);
    });

    server.emit("remote-calls", { calls: getRemoteCallDefinitions() });
};

const handleServiceCallResponse = (response: ServiceCallResponse) => {
    const pending = pendingCalls.get(response.callId);
    if (!pending) return;

    if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
    }

    const duration = Date.now() - pending.startTime;

    try {
        const reader = pending.reader;
        const decoded = reader.readMessage(response.data);
        const result: RemoteCallResult = {
            success: true,
            data: decoded,
            duration,
            status: "succeeded",
        };
        pending.resolve(result);
        server.emit("remote-call-result", {
            callId: String(pending.callId),
            result,
        });
    } catch (error) {
        const result: RemoteCallResult = {
            success: false,
            error: `Failed to decode response: ${error instanceof Error ? error.message : String(error)}`,
            duration,
            status: "failed",
        };
        pending.resolve(result);
        server.emit("remote-call-result", {
            callId: String(pending.callId),
            result,
        });
    }

    pendingCalls.delete(response.callId);
};

const handleServiceCallFailure = (failure: ServiceCallFailure) => {
    const pending = pendingCalls.get(failure.callId);
    if (!pending) return;

    if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
    }

    const duration = Date.now() - pending.startTime;
    const result: RemoteCallResult = {
        success: false,
        error: failure.message,
        duration,
        status: "failed",
    };

    pending.resolve(result);
    server.emit("remote-call-result", {
        callId: String(pending.callId),
        result,
    });
    pendingCalls.delete(failure.callId);
};

const getRemoteCallDefinitions = (): RemoteCallDefinition[] => {
    if (!settings) return [];
    const currentSettings = settings;

    return Array.from(services.values()).map((service) => {
        let requestSchema;
        let responseSchema;

        if (service.request?.schema) {
            try {
                const parsedRequest = parse(service.request.schema, {
                    ros2: true,
                });
                requestSchema = foxgloveIdlToJsonSchema(parsedRequest);
            } catch {
                // ignore
            }
        }

        if (service.response?.schema) {
            try {
                const parsedResponse = parse(service.response.schema, {
                    ros2: true,
                });
                responseSchema = foxgloveIdlToJsonSchema(parsedResponse);
            } catch {
                // ignore
            }
        }

        return {
            name: service.name,
            datasource_id: currentSettings.id,
            source: currentSettings,
            requestType:
                service.request?.schemaName || `${service.type}_Request`,
            rawRequestType:
                service.request?.schemaName || `${service.type}_Request`,
            requestSchema,
            responseType:
                service.response?.schemaName || `${service.type}_Response`,
            rawResponseType:
                service.response?.schemaName || `${service.type}_Response`,
            responseSchema,
            cancelable: false,
            description: `Service type: ${service.type}`,
        } as RemoteCallDefinition;
    });
};

const resolveSchema = async (
    schemaName: string,
    channelId?: number,
): Promise<string> => {
    if (channelId !== undefined) {
        const specific = channels.get(channelId);
        if (specific?.schema && specific.schemaName === schemaName) {
            return specific.schema;
        }
    }

    const existing = Array.from(channels.values()).find(
        (ch) => ch.schemaName === schemaName && ch.schema,
    );
    if (existing?.schema) return existing.schema;

    if (schemaResolvers.has(schemaName)) {
        return new Promise((resolve, reject) => {
            const current = schemaResolvers.get(schemaName);
            if (!current) {
                reject(new Error("Schema resolver not found"));
                return;
            }
            const originalResolve = current.resolve;
            const originalReject = current.reject;
            current.resolve = (schema) => {
                originalResolve(schema);
                resolve(schema);
            };
            current.reject = (error) => {
                originalReject(error);
                reject(error);
            };
        });
    }

    let resolve!: (schema: string) => void;
    let reject!: (error: Error) => void;

    const promise = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    const timeout = setTimeout(() => {
        const resolver = schemaResolvers.get(schemaName);
        if (resolver) {
            resolver.reject(
                new Error(`Schema resolution timeout for ${schemaName}`),
            );
            schemaResolvers.delete(schemaName);
        }
    }, 10000);

    schemaResolvers.set(schemaName, { resolve, reject, timeout });

    return promise;
};

const server = createRpcServer<
    FoxgloveWorkerMethods<FoxgloveDataSourceSettings>,
    FoxgloveWorkerEvents
>(
    self as unknown as {
        postMessage: DedicatedWorkerGlobalScope["postMessage"];
        addEventListener: DedicatedWorkerGlobalScope["addEventListener"];
        removeEventListener: DedicatedWorkerGlobalScope["removeEventListener"];
    },
    {
        init: async (newSettings) => {
            settings = newSettings;
            errorHandler = new DatasourceErrorHandler(newSettings.id);
            
            // Wait for connection to be established before resolving
            return new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Connection timeout to ${newSettings.url}`));
                }, 10000);
                
                const checkConnection = () => {
                    if (connected) {
                        clearTimeout(timeout);
                        server.emit("remote-calls", { calls: [] });
                        resolve();
                    } else if (lastError) {
                        clearTimeout(timeout);
                        reject(new Error(lastError));
                    } else {
                        // Check again in 100ms
                        setTimeout(checkConnection, 100);
                    }
                };
                
                connect(server.emit);
                setTimeout(checkConnection, 100);
            });
        },
        listTopics: async () => {
            if (!settings) return [];
            const currentSettings = settings;
            return Array.from(channels.values()).map((channel) => ({
                topic: channel.topic,
                datasource_id: currentSettings.id,
                source: currentSettings,
                type:
                    UnifiedConverter.getWebappTypeFromROSType(
                        channel.schemaName,
                    ) || channel.schemaName,
                rawType: channel.schemaName,
            }));
        },
        subscribe: async (topic: SelectedTopic) => {
            if (!client || !connected) {
                pendingSubscriptions.set(topic.topic, {
                    topic: topic.topic,
                    count:
                        (pendingSubscriptions.get(topic.topic)?.count ?? 0) + 1,
                });
                return;
            }

            const channel = Array.from(channels.values()).find(
                (ch) => ch.topic === topic.topic,
            );
            if (!channel) {
                pendingSubscriptions.set(topic.topic, {
                    topic: topic.topic,
                    count:
                        (pendingSubscriptions.get(topic.topic)?.count ?? 0) + 1,
                });
                return;
            }

            const existing = subscribersByTopic.get(topic.topic);
            if (existing) {
                existing.count += 1;
                return;
            }

            const subscriptionId = client.subscribe(channel.id);
            if (subscriptionId === undefined || subscriptionId === null) return;

            const webtype =
                UnifiedConverter.getWebappTypeFromROSType(channel.schemaName) ||
                channel.schemaName;
            const reader = new MessageReader(
                parse(channel.schema, { ros2: true }),
            );

            const subscriber: SubscriberEntry = {
                subscriptionId,
                channelId: channel.id,
                topic: channel.topic,
                schemaName: channel.schemaName,
                webtype,
                count: 1,
                reader,
            };

            subscribersById.set(subscriptionId, subscriber);
            subscribersByTopic.set(channel.topic, subscriber);
        },
        unsubscribe: async (topic: SelectedTopic, ignoreCount = false) => {
            const pending = pendingSubscriptions.get(topic.topic);
            if (pending) {
                if (ignoreCount) {
                    pendingSubscriptions.delete(topic.topic);
                } else {
                    pending.count -= 1;
                    if (pending.count <= 0) {
                        pendingSubscriptions.delete(topic.topic);
                    }
                }
            }

            const subscriber = subscribersByTopic.get(topic.topic);
            if (!subscriber) return;

            if (ignoreCount) {
                subscriber.count = 0;
            } else {
                subscriber.count -= 1;
            }

            if (subscriber.count <= 0 && client) {
                client.unsubscribe(subscriber.subscriptionId);
                subscribersById.delete(subscriber.subscriptionId);
                subscribersByTopic.delete(topic.topic);
            }
        },
        executeRemoteCall: async (
            definition: RemoteCallDefinition,
            request: unknown,
            options?: RemoteCallOptions,
        ) => {
            if (!client) {
                return {
                    callId: "error",
                    status: "failed" as RemoteCallStatus,
                };
            }

            const service = Array.from(services.values()).find(
                (s) => s.name === definition.name,
            );
            if (!service) {
                return {
                    callId: "error",
                    status: "failed" as RemoteCallStatus,
                };
            }

            const writer = writersByServiceId.get(service.id);
            const reader = readersByServiceId.get(service.id);
            if (!writer || !reader) {
                return {
                    callId: "error",
                    status: "failed" as RemoteCallStatus,
                };
            }

            const callId = callIdCounter++;
            const startTime = Date.now();

            const resultPromise = new Promise<RemoteCallResult>(
                (resolve, reject) => {
                    let encoded: Uint8Array;
                    try {
                        encoded = writer.writeMessage(request);
                    } catch (error) {
                        const result: RemoteCallResult = {
                            success: false,
                            error: `Failed to encode request: ${error instanceof Error ? error.message : String(error)}`,
                            duration: 0,
                            status: "failed",
                        };
                        resolve(result);
                        return;
                    }

                    const pendingCall: PendingServiceCall = {
                        callId,
                        serviceId: service.id,
                        serviceName: service.name,
                        startTime,
                        resolve: (result) => resolve(result),
                        reject,
                        reader,
                    };

                    if (options?.timeout && options.timeout > 0) {
                        pendingCall.timeoutId = setTimeout(() => {
                            const duration = Date.now() - startTime;
                            const result: RemoteCallResult = {
                                success: false,
                                error: `Service call timed out after ${options.timeout}ms`,
                                duration,
                                status: "failed",
                            };
                            resolve(result);
                            pendingCalls.delete(callId);
                        }, options.timeout);
                    }

                    pendingCalls.set(callId, pendingCall);

                    if (!client) {
                        resolve({
                            success: false,
                            error: "Foxglove client not connected",
                            duration: 0,
                            status: "failed",
                        });
                        return;
                    }
                    client.sendServiceCallRequest({
                        serviceId: service.id,
                        callId,
                        encoding: service.request?.encoding || "cdr",
                        data: encoded,
                    });
                },
            );

            resultPromise.then((result) => {
                server.emit("remote-call-result", {
                    callId: String(callId),
                    result,
                });
            });

            return {
                callId: String(callId),
                status: "executing" as RemoteCallStatus,
            };
        },
        cancelRemoteCall: async () => false,
        shutdown: async () => {
            clearReconnectTimer();
            if (ws) {
                ws.close();
                ws = null;
            }
            teardownClient();
            subscribersById.clear();
            subscribersByTopic.clear();
            pendingSubscriptions.clear();
            publishersByTopic.clear();
            pendingCalls.clear();
            
            // Clear pending operations
            pendingAdvertiseOps.forEach((op) => op.resolve(false));
            pendingAdvertiseOps.clear();
            pendingPublishOps.length = 0;
            
            connected = false;
            emitStatus(server.emit);
        },
        listTypes: async (webtypes?: string[]) => {
            const schemas = Array.from(channels.values()).map(
                (channel) => channel.schemaName,
            );
            let uniqueSchemas = Array.from(
                new Set([...schemas, ...interfaceList]),
            );

            if (webtypes && webtypes.length > 0) {
                const compatibleTypes = new Set<string>();
                webtypes.forEach((webtype) => {
                    const rosType =
                        UnifiedConverter.getROSTypeFromWebappType(webtype);
                    if (rosType) {
                        compatibleTypes.add(rosType);
                    }
                    if (uniqueSchemas.includes(webtype)) {
                        compatibleTypes.add(webtype);
                    }
                });
                uniqueSchemas = uniqueSchemas.filter((schema) =>
                    compatibleTypes.has(schema),
                );
            }

            uniqueSchemas.sort((a, b) => {
                const aParts = a.split("/");
                const bParts = b.split("/");
                if (aParts[0]! < bParts[0]!) return -1;
                if (aParts[0]! > bParts[0]!) return 1;
                return a.localeCompare(b);
            });

            return uniqueSchemas;
        },
        getDefinition: async (topic: DatasourceTopic) => {
            const channel = Array.from(channels.values()).find(
                (ch) => ch.topic === topic.topic,
            );
            if (!channel?.schema) {
                return null;
            }
            try {
                const parsed = parse(channel.schema, { ros2: true });
                return foxgloveIdlToJsonSchema(parsed);
            } catch {
                return null;
            }
        },
        advertise: async (topic: DatasourceTopic) => {
            if (!client || !connected) {
                // Queue operation for when connection is established
                if (pendingAdvertiseOps.size < MAX_PENDING_OPS) {
                    return new Promise<boolean>((resolve) => {
                        pendingAdvertiseOps.set(topic.topic, { topic, resolve });
                    });
                }
                return false;
            }
            
            const existing = publishersByTopic.get(topic.topic);
            if (existing) {
                existing.count += 1;
                return true;
            }

            try {
                const channelId = client.advertise({
                    topic: topic.topic,
                    encoding: "cdr",
                    schemaName: topic.rawType,
                });

                if (channelId === undefined || channelId === null) {
                    if (errorHandler) {
                        errorHandler.handle(
                            createConnectionError(
                                `Failed to advertise topic ${topic.topic}`,
                                settings?.id,
                                { topic: topic.topic, schemaName: topic.rawType },
                            ),
                        );
                    }
                    return false;
                }

                const schema = await resolveSchema(topic.rawType, channelId);
                if (!schema) {
                    if (errorHandler) {
                        errorHandler.handle(
                            createSerializationError(
                                `Schema resolution failed for ${topic.rawType}`,
                                settings?.id,
                                { topic: topic.topic, schemaName: topic.rawType },
                            ),
                        );
                    }
                    return false;
                }

                const parsed = parse(schema, { ros2: true });
                const writer = new MessageWriter(parsed);

                publishersByTopic.set(topic.topic, {
                    channelId,
                    topic: topic.topic,
                    schemaName: topic.rawType,
                    webtype: topic.type,
                    count: 1,
                    writer,
                });

                return true;
            } catch (error) {
                if (errorHandler) {
                    errorHandler.handleRaw(error, {
                        severity: ErrorSeverity.ERROR,
                        category: ErrorCategory.CONNECTION,
                        context: { topic: topic.topic, schemaName: topic.rawType },
                        message: `Failed to advertise ${topic.topic}`,
                    });
                }
                return false;
            }
        },
        unadvertise: async (topic: DatasourceTopic, ignoreCount = false) => {
            const publisher = publishersByTopic.get(topic.topic);
            if (!publisher || !client) return;

            if (ignoreCount) {
                publisher.count = 0;
            } else {
                publisher.count -= 1;
            }

            if (publisher.count <= 0) {
                client.unadvertise(publisher.channelId);
                publishersByTopic.delete(topic.topic);
            }
        },
        publish: async (
            topic: DatasourceTopic,
            message: unknown,
            webtype: string,
        ) => {
            if (!client || !connected) {
                // Drop if not connected - publishing old data after reconnect rarely makes sense
                if (errorHandler) {
                    errorHandler.handle(
                        createConnectionError(
                            `Cannot publish on ${topic.topic}: not connected`,
                            settings?.id,
                            { topic: topic.topic },
                        ),
                    );
                }
                return;
            }
            
            const publisher = publishersByTopic.get(topic.topic);
            if (!publisher) {
                if (errorHandler) {
                    errorHandler.handle(
                        createConnectionError(
                            `Publisher not found for ${topic.topic}`,
                            settings?.id,
                            { topic: topic.topic },
                        ),
                    );
                }
                return;
            }

            try {
                const converted = UnifiedConverter.convertToROS2(
                    message,
                    webtype,
                    topic.rawType,
                );
                const serialized = publisher.writer.writeMessage(converted);
                if (!serialized || serialized.byteLength === 0) {
                    if (errorHandler) {
                        errorHandler.handle(
                            createSerializationError(
                                `Serialization failed for ${topic.topic}`,
                                settings?.id,
                                { topic: topic.topic },
                            ),
                        );
                    }
                    return;
                }

                client.sendMessage(publisher.channelId, serialized);
            } catch (error) {
                if (errorHandler) {
                    errorHandler.handleRaw(error, {
                        severity: ErrorSeverity.ERROR,
                        category: ErrorCategory.SERIALIZATION,
                        context: { topic: topic.topic },
                        message: `Failed to publish on ${topic.topic}`,
                    });
                }
            }
        },
        getConnectionStatus: () => ({
            connected,
            error: lastError,
            reconnectAttempt,
        }),
    },
);
