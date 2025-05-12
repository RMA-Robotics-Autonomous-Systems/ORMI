"use client"
/*
    Provider that creates a datasets with random data

    data -> 
        [source] -> {
            label: 'current_time',
            data: [random data]    
        },
        [source] -> {
            label: 'current_time',
            data: [random data]    
        },
*/

import React, { createContext, ReactNode, useEffect, useRef, useState } from 'react';

import { usePluginsManager } from 'ormi-core/plugins';
import { PluginsHooks } from 'ormi-core/plugins';

import { DatasourceProviderSettings, DatasourceTopic, SelectedTopic } from 'ormi-core/datasources';
import { toast, Spinner } from 'ormi-core/components';
import { JsonSchema } from '@jsonforms/core';

import { Channel, FoxgloveClient } from '@foxglove/ws-protocol';
import { parse } from "@foxglove/rosmsg"; // Import parse function explicitly
import { MessageReader, MessageWriter } from "@foxglove/rosmsg2-serialization";

import { UnifiedConverter } from "./unified-converter";
// import { convertMessageDefinitionsToJsonSchema } from "./message-to-jsonschema";

const FoxgloveSourceContext = createContext(null);

// time to wait before trying to connect to the ROSBridge Suite
const WAIT_FOR_CONNECTION = 500;

interface FoxgloveDataSourceSettings extends DatasourceProviderSettings {
    url: string;
    reconnectTimeout: number;
    toasts: boolean;
}

interface Subscriber {
    subscriberId: number;
    channelId: number;
    topic: string;
    schemaName: string;
    webtype: string;
    count: number;
    hook: string;
    reader: MessageReader;
}

interface PendingSubscription {
    topic: string;
    count: number;
    resolvers: Array<(success: boolean) => void>;
    rejectors: Array<(error: any) => void>;
}

interface Publisher {
    channelId: number;
    topic: string;
    schemaName: string;
    webtype: string;
    count: number;
    hook: string;
    writer: MessageWriter;
}
// Create a provider component
const FoxgloveSourceProvider = (children: ReactNode, props: FoxgloveDataSourceSettings) => {
    const pluginsManager = usePluginsManager();

    // constant for the datasource
    const datasource_id = props.id;
    const available_topics_handler = `${datasource_id}-available-topics`;
    const subscribe_hook = `${datasource_id}-subscribe`;
    const unsubscribe_hook = `${datasource_id}-unsubscribe`;
    const definition_hook = `${datasource_id}-definition`;
    const advertise_hook = `${datasource_id}-advertise`;
    const unadvertise_hook = `${datasource_id}-unadvertise`;
    const available_types = `${datasource_id}-available-types`;

    const connectionRef = useRef<Promise<boolean> | null>(null);
    const clientRef = useRef<FoxgloveClient | null>(null);
    const [clientConnected, setClientConnected] = React.useState(false);

    // channels
    const channelsRef = useRef<Map<number, Channel>>(new Map<number, Channel>());

    // subscribers, channel id, subscriber count
    const subscribersRef = useRef<Map<number, Subscriber>>(new Map<number, Subscriber>());

    // pending subscriptions for topics that don't exist yet
    const pendingSubscriptionsRef = useRef<Map<number, PendingSubscription>>(new Map<number, PendingSubscription>());

    // Function queue for ordered processing
    const queueRef = useRef<Map<number, Array<() => Promise<void>>>>(new Map<number, Array<() => Promise<void>>>());
    const processingRef = useRef<Map<number, boolean>>(new Map<number, boolean>());


    // Publisher
    const publisherRef = useRef<Map<number, Publisher>>(new Map<number, Publisher>());
    const pendingPublisherRef = useRef<Map<string, Promise<string>>>(new Map<string, Promise<string>>());   // raw_type, promise (schema)
    const advertisingPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map()); // Topic name -> Promise<success>

    const [retry, setRetry] = React.useState(0);    // force re-render to re-connect

    useEffect(() => {

        if (!props.enable) {
            setClientConnected(true);     // allow to render children
            return;
        }

        const waitTimeOut = setTimeout(() => {
            connectionRef.current = new Promise<boolean>((resolve, reject) => {

                const websocket = new WebSocket(props.url, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]);

                const client = new FoxgloveClient({
                    ws: websocket,
                });

                client.on("open", () => {
                    clientRef.current = client;
                    setClientConnected(true);
                    // client.subscribeConnectionGraph();

                    resolve(true);
                });

                client.on('error', (error) => {
                    console.error("Connection error:", error);
                    setClientConnected(false);
                    clientRef.current = null;
                    reject(false);
                });

                client.on("close", () => {
                    setClientConnected(false);
                    clientRef.current = null;
                    reject(false);
                });

                client.on("advertise", (channelsList: Channel[]) => {

                    console.log("Advertised channels:", channelsList);

                    channelsList.forEach((channel) => {
                        if (!channelsRef.current.has(channel.id)) {
                            channelsRef.current.set(channel.id, channel);

                            processPendingSubscriptions(channel);
                        }

                        // Check if this channel id is in pending publishers
                        // and resolve the promise with the actual schema
                        if (pendingPublisherRef.current.has(channel.schemaName)) {
                            const pendingPromise = pendingPublisherRef.current.get(channel.schemaName);
                            if (pendingPromise && (pendingPromise as any).resolve) {
                                console.log(`Resolving pending schema for type ${channel.schemaName} via advertised channel ${channel.id}`);
                                (pendingPromise as any).resolve(channel.schema);
                            }
                        }
                    });
                });

                client.on("unadvertise", (ids: number[]) => {
                    ids.forEach((id) => {
                        if (channelsRef.current.has(id)) {
                            channelsRef.current.delete(id);
                        }
                    });

                });

                client.on("message", ({ subscriptionId, timestamp, data }) => {

                    // get the subscriber
                    const subscriber = Array.from(subscribersRef.current.values()).find((subscriber) => {
                        return subscriber.subscriberId === subscriptionId;
                    });

                    if (!subscriber) {
                        console.warn(`Subscriber not found for subscriptionId ${subscriptionId}`);
                        return;
                    }

                    const parsed = subscriber.reader.readMessage(data);
                    const convertedMessage = UnifiedConverter.convertToWebapp(parsed, subscriber.webtype, subscriber.schemaName);

                    pluginsManager.doAction(
                        subscriber.hook,
                        convertedMessage,
                        Date.now(),
                    );

                });

            });

            pluginsManager.addFilter(`${datasource_id}-foxglove-connection-client`, {
                id: `${datasource_id}-foxglove-connection-client`,
                filter: (_obj = {}) => {
                    return clientRef.current;
                },
                priority: 1,
            });

            // Register plugin handlers
            pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
                id: available_topics_handler,
                filter: async (topics) => {

                    await connectionRef.current;

                    try {
                        // using the channels convert to DatasourceTopic
                        const channelsArray = Array.from(channelsRef.current.values());
                        const newTopics = channelsArray.map((channel) => {

                            return {
                                topic: channel.topic,
                                datasource_id: "foxglove-source",
                                source: props,
                                type: UnifiedConverter.getWebappTypeFromROSType(channel.schemaName) || "",
                                rawType: channel.schemaName,
                                // bufferSize: 1000,
                            } as DatasourceTopic;
                        });

                        // add the new topics to the existing ones
                        const allTopics = [...topics, ...newTopics];

                        return allTopics;

                    } catch (error) {
                        return topics;
                    }
                },
                priority: 100,
            });

            pluginsManager.addAction(subscribe_hook, {
                id: subscribe_hook,
                action: async (topic: DatasourceTopic) => {

                    // find the channel id
                    const channel = Array.from(channelsRef.current.values()).find((channel) => {
                        return channel.topic === topic.topic;
                    });

                    if (!channel) {
                        // Topic doesn't exist yet, add to pending subscriptions
                        await addPendingSubscription(topic.topic);
                        return;
                    }
                    const channelId = channel.id;

                    // Queue the subscription operation
                    await enqueueOperation(channelId, async () => {
                        // check if the topic is already subscribed
                        if (subscribersRef.current.has(channelId)) {
                            const subscriber = subscribersRef.current.get(channelId);
                            if (subscriber) {
                                subscriber.count++;
                                return;
                            }
                        }

                        // subscribe to the topic
                        const subscriptionId = clientRef.current?.subscribe(channelId);

                        if (!subscriptionId && subscriptionId !== 0) {
                            console.error(`Failed to subscribe to topic ${topic.topic}`);
                            throw new Error(`Failed to subscribe to topic ${topic.topic}`);
                        }


                        // add the subscriber to the list
                        const subscriber = {
                            subscriberId: subscriptionId,
                            channelId: channelId,
                            topic: topic.topic,
                            schemaName: channel.schemaName,
                            webtype: UnifiedConverter.getWebappTypeFromROSType(channel.schemaName),
                            count: 1,
                            hook: `${datasource_id}-${topic.topic}-published`,
                            reader: new MessageReader(parse(channel.schema, { ros2: true })),
                        } as Subscriber;

                        subscribersRef.current.set(channelId, subscriber);

                    }).catch(error => {
                        console.warn("Subscribe error:", error);
                        if (props.toasts) {
                            toast({
                                title: "Error",
                                description: "Failed to subscribe to topic",
                                variant: "destructive",
                            });
                        }
                    });
                },
                priority: 100,
            });

            pluginsManager.addAction(unsubscribe_hook, {
                id: unsubscribe_hook,
                action: async (topic: DatasourceTopic, ignoreCount: boolean = false) => {
                    // find the channel id
                    const channel = Array.from(channelsRef.current.values()).find((channel) => {
                        return channel.topic === topic.topic;
                    });

                    // First, check if this is a pending subscription
                    const pendingId = hashTopicName(topic.topic);
                    const pendingSubscription = pendingSubscriptionsRef.current.get(pendingId);

                    if (pendingSubscription) {
                        // Handle unsubscribing from a pending subscription
                        if (ignoreCount) {
                            // Remove the pending subscription completely
                            pendingSubscriptionsRef.current.delete(pendingId);

                            if (props.toasts) {
                                toast({
                                    title: "Pending Subscription Canceled",
                                    description: `Canceled subscription to pending topic ${topic.topic}`,
                                });
                            }
                            return;
                        } else {
                            // Decrease the count
                            pendingSubscription.count--;

                            if (pendingSubscription.count <= 0) {
                                // Remove the pending subscription
                                pendingSubscriptionsRef.current.delete(pendingId);

                                if (props.toasts) {
                                    toast({
                                        title: "Pending Subscription Canceled",
                                        description: `Canceled subscription to pending topic ${topic.topic}`,
                                    });
                                }
                            }
                            return;
                        }
                    }

                    // If not a pending subscription and channel not found, throw error
                    if (!channel) {
                        throw new Error(`Channel not found for topic ${topic.topic}`);
                    }

                    const channelId = channel.id;

                    // Queue the unsubscribe operation
                    await enqueueOperation(channelId, async () => {
                        // check if the topic is already subscribed
                        if (!subscribersRef.current.has(channelId)) {
                            console.warn(`Not subscribed to topic ${topic.topic}`);
                        }

                        const subscriber = subscribersRef.current.get(channelId);

                        if (subscriber) {
                            if (ignoreCount) {
                                subscriber.count = 0;
                            } else {
                                subscriber.count--;
                            }

                            if (subscriber.count <= 0) {
                                clientRef.current?.unsubscribe(subscriber.subscriberId);
                                subscribersRef.current.delete(channelId);
                            }
                        } else {
                            console.warn(`Not subscribed to topic ${topic.topic}`);
                        }
                    }).catch(error => {
                        console.warn("Unsubscribe error:", error);
                        if (props.toasts) {
                            toast({
                                title: "Error",
                                description: "Failed to unsubscribe from topic",
                                variant: "destructive",
                            });
                        }
                    });
                },
                priority: 100,
            });

            pluginsManager.addFilter(definition_hook, {
                id: definition_hook,
                priority: 10,
                filter: async (definition: JsonSchema, topic: DatasourceTopic) => {

                    await connectionRef.current;

                    // find the channel id
                    const channel = Array.from(channelsRef.current.values()).find((channel) => {
                        return channel.topic === topic.topic;
                    });

                    if (!channel) {
                        throw new Error(`Channel not found for topic ${topic.topic}`);
                    }

                    const channelId = channel.id;
                    const channelSchema = channelsRef.current.get(channelId)?.schema;

                    if (!channelSchema) {
                        throw new Error(`Channel schema not found for topic ${topic.topic}`);
                    }

                    const parsedIDL = parse(channelSchema, { ros2: true });

                    return definition;
                }
            });

            pluginsManager.addFilter(advertise_hook, {
                id: advertise_hook,
                filter: async (topic: SelectedTopic): Promise<boolean> => {
                    const topicName = topic.topic;
                    const rawType = topic.rawType;

                    if (advertisingPromisesRef.current.has(topicName)) {
                        console.log(`Advertise for ${topicName}: Operation already in progress, awaiting...`);
                        return await advertisingPromisesRef.current.get(topicName)!;
                    }

                    const advertisePromise = (async (): Promise<boolean> => {
                        try {
                            console.log(`Advertise for ${topicName}: Starting operation...`);
                            await connectionRef.current;

                            const existingPublisher = Array.from(publisherRef.current.values()).find(p => p.topic === topicName);

                            if (existingPublisher) {
                                console.log(`Advertise for ${topicName}: Publisher already exists (channel ${existingPublisher.channelId}), incrementing count.`);
                                await enqueueOperation(existingPublisher.channelId, async () => {
                                    const publisher = publisherRef.current.get(existingPublisher.channelId);
                                    if (publisher) {
                                        publisher.count++;
                                        console.log(`Advertise for ${topicName}: Count incremented to ${publisher.count} for channel ${existingPublisher.channelId}`);
                                    } else {
                                        console.warn(`Advertise for ${topicName}: Publisher disappeared before count increment on channel ${existingPublisher.channelId}?`);
                                    }
                                });
                                return true;
                            }

                            console.log(`Advertise for ${topicName}: No existing publisher, advertising with type ${rawType}...`);
                            const newChannelId = clientRef.current?.advertise({
                                topic: topic.topic,
                                encoding: "cdr",
                                schemaName: rawType
                            });

                            if (newChannelId === undefined || newChannelId === null) {
                                throw new Error(`Failed to initiate advertisement for topic ${topicName}`);
                            }
                            console.log(`Advertise for ${topicName}: Advertise call sent, assigned channelId ${newChannelId}. Waiting for schema...`);

                            let schemaPromise: Promise<string>;
                            let schemaTimeout: number | null = null;

                            const existingChannelWithSchema = Array.from(channelsRef.current.values()).find(
                                ch => ch.schemaName === rawType && ch.schema
                            );

                            if (existingChannelWithSchema) {
                                console.log(`Advertise for ${topicName}: Schema for ${rawType} found in existing channel ${existingChannelWithSchema.id}`);
                                schemaPromise = Promise.resolve(existingChannelWithSchema.schema);
                            } else if (pendingPublisherRef.current.has(rawType)) {
                                console.log(`Advertise for ${topicName}: Awaiting pending schema for type ${rawType}`);
                                schemaPromise = pendingPublisherRef.current.get(rawType)!;
                            } else {
                                console.log(`Advertise for ${topicName}: Setting up pending schema for type ${rawType}`);
                                const promiseObj = {} as any;
                                schemaPromise = new Promise<string>((resolve, reject) => {
                                    promiseObj.resolve = resolve;
                                    promiseObj.reject = reject;
                                });
                                pendingPublisherRef.current.set(rawType, schemaPromise);
                                (pendingPublisherRef.current.get(rawType) as any).resolve = promiseObj.resolve;
                                (pendingPublisherRef.current.get(rawType) as any).reject = promiseObj.reject;

                                schemaTimeout = setTimeout(() => {
                                    if (pendingPublisherRef.current.has(rawType)) {
                                        const pendingPromise = pendingPublisherRef.current.get(rawType);
                                        console.error(`Advertise for ${topicName}: Schema resolution timed out for type ${rawType}`);
                                        if (pendingPromise && (pendingPromise as any).reject) {
                                            (pendingPromise as any).reject(new Error(`Schema resolution timed out for ${rawType}`));
                                        }
                                        pendingPublisherRef.current.delete(rawType);
                                    }
                                }, 10000);
                            }

                            await enqueueOperation(newChannelId, async () => {
                                let schema: string | null = null;
                                try {
                                    console.log(`Advertise for ${topicName}: Enqueued operation for channel ${newChannelId} starting.`);
                                    schema = await schemaPromise;
                                    if (schemaTimeout) clearTimeout(schemaTimeout);
                                    console.log(`Advertise for ${topicName}: Schema received for channel ${newChannelId}.`);

                                    if (publisherRef.current.has(newChannelId)) {
                                        console.warn(`Advertise for ${topicName}: Publisher for channel ${newChannelId} already exists in enqueueOperation. Incrementing count.`);
                                        const pub = publisherRef.current.get(newChannelId)!;
                                        pub.count++;
                                        return;
                                    }

                                    const publisher = {
                                        channelId: newChannelId,
                                        topic: topic.topic,
                                        schemaName: rawType,
                                        webtype: topic.type,
                                        count: 1,
                                        hook: `${datasource_id}-${topic.topic}-publish`,
                                        writer: new MessageWriter(parse(schema, { ros2: true })),
                                    } as Publisher;

                                    publisherRef.current.set(newChannelId, publisher);
                                    console.log(`Advertise for ${topicName}: Publisher added for channel ${newChannelId}.`);

                                    const hook = publisher.hook;
                                    pluginsManager.removeAction(hook);
                                    pluginsManager.addAction(hook, {
                                        id: hook,
                                        action: async (selected_topic: SelectedTopic, message: any, webtype: any) => {
                                            const currentPublisher = publisherRef.current.get(newChannelId);
                                            if (!currentPublisher) {
                                                console.warn(`Publish action for ${topicName} (channel ${newChannelId}): Publisher no longer exists.`);
                                                return;
                                            }
                                            try {
                                                const converted = UnifiedConverter.convertToROS2(message, webtype, selected_topic.rawType);
                                                const msg = currentPublisher.writer.writeMessage(converted);
                                                clientRef.current?.sendMessage(newChannelId, msg);
                                            } catch (error) {
                                                console.error(`Failed to publish message on ${topicName} (channel ${newChannelId}):`, error);
                                            }
                                        },
                                        priority: 100,
                                    });
                                    console.log(`Advertise for ${topicName}: Publish action registered for hook ${hook}.`);

                                } catch (schemaError) {
                                    console.error(`Advertise for ${topicName}: Error obtaining schema or setting up publisher for channel ${newChannelId}:`, schemaError);
                                    try {
                                        clientRef.current?.unadvertise(newChannelId);
                                        console.log(`Advertise for ${topicName}: Cleaned up channel ${newChannelId} due to setup error.`);
                                    } catch (unadvError) {
                                        console.error(`Advertise for ${topicName}: Failed to unadvertise channel ${newChannelId} after setup error:`, unadvError);
                                    }
                                    throw schemaError;
                                } finally {
                                    if (pendingPublisherRef.current.has(rawType) && pendingPublisherRef.current.get(rawType) === schemaPromise) {
                                        pendingPublisherRef.current.delete(rawType);
                                        console.log(`Advertise for ${topicName}: Cleaned up pending schema promise for type ${rawType}.`);
                                    }
                                }
                            });

                            console.log(`Advertise for ${topicName}: Operation setup complete, returning true.`);
                            return true;

                        } catch (error) {
                            console.error(`Advertise for ${topicName}: Error during operation:`, error);
                            if (props.toasts) {
                                toast({
                                    title: "Error",
                                    description: `Failed to advertise topic ${topicName}: ${error instanceof Error ? error.message : String(error)}`,
                                    variant: "destructive",
                                });
                            }
                            return false;
                        } finally {
                            advertisingPromisesRef.current.delete(topicName);
                            console.log(`Advertise for ${topicName}: Operation finished, removed promise.`);
                        }
                    })();

                    advertisingPromisesRef.current.set(topicName, advertisePromise);
                    return await advertisePromise;
                },
                priority: 100,
            });

            pluginsManager.addAction(unadvertise_hook, {
                id: unadvertise_hook,
                action: async (topic: DatasourceTopic, ignoreCount: boolean = false) => {
                    const topicName = topic.topic;
                    console.log(`Unadvertise for ${topicName}: Starting (ignoreCount: ${ignoreCount}).`);

                    try {
                        await connectionRef.current;

                        const publisherEntry = Array.from(publisherRef.current.entries()).find(
                            ([_, pub]) => pub.topic === topicName
                        );

                        if (!publisherEntry) {
                            console.warn(`Unadvertise for ${topicName}: Publisher not found.`);
                            if (advertisingPromisesRef.current.has(topicName)) {
                                console.warn(`Unadvertise for ${topicName}: Advertise operation still in progress. Cannot unadvertise yet.`);
                            }
                            return;
                        }

                        const [channelId, publisher] = publisherEntry;

                        await enqueueOperation(channelId, async () => {
                            console.log(`Unadvertise for ${topicName}: Enqueued operation for channel ${channelId}.`);
                            const currentPublisher = publisherRef.current.get(channelId);

                            if (!currentPublisher) {
                                console.warn(`Unadvertise for ${topicName}: Publisher for channel ${channelId} disappeared before unadvertise operation.`);
                                pluginsManager.removeAction(`${datasource_id}-${topicName}-publish`);
                                return;
                            }

                            if (ignoreCount) {
                                currentPublisher.count = 0;
                            } else {
                                currentPublisher.count--;
                            }
                            console.log(`Unadvertise for ${topicName}: Count updated to ${currentPublisher.count}.`);

                            if (currentPublisher.count <= 0) {
                                console.log(`Unadvertise for ${topicName}: Count is zero or less, proceeding with unadvertise for channel ${channelId}.`);
                                try {
                                    clientRef.current?.unadvertise(channelId);
                                    console.log(`Unadvertise for ${topicName}: Unadvertise call sent for channel ${channelId}.`);
                                } catch (unadvError) {
                                    console.error(`Unadvertise for ${topicName}: Error calling client.unadvertise for channel ${channelId}:`, unadvError);
                                }

                                publisherRef.current.delete(channelId);
                                pluginsManager.removeAction(currentPublisher.hook);
                                console.log(`Unadvertise for ${topicName}: Publisher state removed for channel ${channelId}, action hook ${currentPublisher.hook} removed.`);

                            } else {
                                console.log(`Unadvertise for ${topicName}: Count is ${currentPublisher.count}, publisher remains active.`);
                            }
                        });

                    } catch (error) {
                        console.error(`Unadvertise for ${topicName}: Error:`, error);
                        if (props.toasts) {
                            toast({
                                title: "Error",
                                description: `Failed to unadvertise topic ${topicName}: ${error instanceof Error ? error.message : String(error)}`,
                                variant: "destructive",
                            });
                        }
                    }
                },
                priority: 100,
            });

            pluginsManager.addFilter(available_types, {
                id: available_types,
                filter: async (types: string[]) => {

                    await connectionRef.current;

                    const channelsArray = Array.from(channelsRef.current.values());
                    const schemas = channelsArray.map((channel) => {
                        return channel.schemaName;
                    });
                    const uniqueSchemas = Array.from(new Set(schemas));

                    return uniqueSchemas;
                },
                priority: 100,
            });

        }, WAIT_FOR_CONNECTION);

        const disconnect = async () => {
            if (clientRef.current) {
                clientRef.current.close();
                clientRef.current = null;
            }
        }

        const enqueueOperation = async (id: number, operation: () => Promise<void>): Promise<void> => {
            if (!queueRef.current.has(id)) {
                queueRef.current.set(id, []);
                processingRef.current.set(id, false);
            }

            return new Promise<void>((resolve, reject) => {
                queueRef.current.get(id)?.push(async () => {
                    try {
                        await operation();
                        resolve();
                    } catch (error) {
                        reject(error);
                        console.error(`Error in enqueued operation for ID ${id}:`, error);
                    }
                });

                processQueue(id);
            });
        };

        const addPendingSubscription = async (topic: string): Promise<boolean> => {
            return new Promise<boolean>((resolve, reject) => {
                const pendingId = hashTopicName(topic);

                if (pendingSubscriptionsRef.current.has(pendingId)) {
                    const existing = pendingSubscriptionsRef.current.get(pendingId)!;
                    existing.count++;
                    existing.resolvers.push(resolve);
                    existing.rejectors.push(reject);
                } else {
                    pendingSubscriptionsRef.current.set(pendingId, {
                        topic,
                        count: 1,
                        resolvers: [resolve],
                        rejectors: [reject]
                    });

                    if (props.toasts) {
                        toast({
                            title: "Pending Subscription",
                            description: `Waiting for topic ${topic} to become available`,
                        });
                    }
                }
            });
        };

        const hashTopicName = (topic: string): number => {
            let hash = 0;
            for (let i = 0; i < topic.length; i++) {
                const char = topic.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash);
        };

        const processPendingSubscriptions = (channel: Channel) => {
            const pendingIds = Array.from(pendingSubscriptionsRef.current.keys());

            for (const pendingId of pendingIds) {
                const pending = pendingSubscriptionsRef.current.get(pendingId);

                if (pending && pending.topic === channel.topic) {
                    const topic: DatasourceTopic = {
                        topic: channel.topic,
                        datasource_id: datasource_id,
                        source: props,
                        type: UnifiedConverter.getWebappTypeFromROSType(channel.schemaName) || channel.schemaName,
                        rawType: channel.schemaName
                    };

                    enqueueOperation(channel.id, async () => {
                        try {
                            const subscriptionId = clientRef.current?.subscribe(channel.id);

                            if (!subscriptionId && subscriptionId !== 0) {
                                for (const rejector of pending.rejectors) {
                                    rejector(new Error(`Failed to subscribe to topic ${pending.topic}`));
                                }
                            } else {
                                const subscriber = {
                                    subscriberId: subscriptionId,
                                    channelId: channel.id,
                                    topic: channel.topic,
                                    schemaName: channel.schemaName,
                                    webtype: UnifiedConverter.getWebappTypeFromROSType(channel.schemaName),
                                    count: pending.count,
                                    hook: `${datasource_id}-${channel.topic}-published`,
                                    reader: new MessageReader(parse(channel.schema, { ros2: true })),
                                } as Subscriber;

                                subscribersRef.current.set(channel.id, subscriber);

                                for (const resolver of pending.resolvers) {
                                    resolver(true);
                                }

                                if (props.toasts) {
                                    toast({
                                        title: "Subscription Resolved",
                                        description: `Successfully subscribed to topic ${pending.topic}`,
                                    });
                                }
                            }

                            pendingSubscriptionsRef.current.delete(pendingId);

                        } catch (error) {
                            console.error(`Failed to subscribe to pending topic ${pending.topic}:`, error);
                            for (const rejector of pending.rejectors) {
                                rejector(error);
                            }
                            pendingSubscriptionsRef.current.delete(pendingId);
                        }
                    }).catch(error => {
                        console.error(`Error processing pending subscription for ${pending.topic}:`, error);
                    });
                }
            }
        };

        const processQueue = async (id: number) => {
            if (processingRef.current.get(id)) {
                return;
            }

            processingRef.current.set(id, true);

            while (queueRef.current.has(id) && queueRef.current.get(id)!.length > 0) {
                const operation = queueRef.current.get(id)?.shift();
                if (operation) {
                    try {
                        await operation();
                    } catch (error) {
                        console.error(`Unexpected error awaiting queued operation for ID ${id}:`, error);
                    }
                }
            }

            processingRef.current.set(id, false);

            if (!queueRef.current.get(id)?.length) {
                queueRef.current.delete(id);
                processingRef.current.delete(id);
            }
        };

        const clearQueues = () => {
            queueRef.current.clear();
            processingRef.current.clear();
        };

        return () => {
            clearTimeout(waitTimeOut);

            if (!connectionRef.current) {
                return;
            }

            pluginsManager.removeFilter(`${datasource_id}-foxglove-connection-client`);
            pluginsManager.removeFilter(`${datasource_id}-foxglove-connection-server`);

            pluginsManager.removeFilter(available_topics_handler);
            pluginsManager.removeAction(subscribe_hook);
            pluginsManager.removeAction(unsubscribe_hook);
            pluginsManager.removeFilter(definition_hook);
            pluginsManager.removeFilter(advertise_hook);
            pluginsManager.removeAction(unadvertise_hook);
            pluginsManager.removeFilter(available_types);

            subscribersRef.current.forEach((subscriber) => {
                clientRef.current?.unsubscribe(subscriber.subscriberId);
            });

            subscribersRef.current.clear();
            channelsRef.current.clear();

            pendingSubscriptionsRef.current.forEach((pending) => {
                for (const rejector of pending.rejectors) {
                    rejector(new Error("Component unmounted"));
                }
            });

            publisherRef.current.forEach((publisher) => {
                pluginsManager.doAction(unadvertise_hook, { topic: publisher.topic } as DatasourceTopic, true);
                pluginsManager.removeAction(publisher.hook);
            });
            publisherRef.current.clear();

            pendingPublisherRef.current.forEach((promise) => {
                if ((promise as any).reject) {
                    (promise as any).reject(new Error("Component unmounted"));
                }
            });
            pendingPublisherRef.current.clear();

            advertisingPromisesRef.current.clear();

            clearQueues();

            disconnect();
        }

    }, [retry, props, pluginsManager]);

    return (
        <FoxgloveSourceContext.Provider value={null}>
            {clientConnected && children}
            {!clientConnected && <Spinner />}
        </FoxgloveSourceContext.Provider>
    );

}

export { FoxgloveSourceProvider };
export type { FoxgloveDataSourceSettings };