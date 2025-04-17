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
import { parse, stringify } from "@foxglove/rosmsg";
import { MessageReader, MessageWriter } from "@foxglove/rosmsg2-serialization";

import { UnifiedConverter } from "ormi-ros-2";
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
                            // Create a resolver function to resolve the pending promise
                            const resolveFunction = (pendingPublisherRef.current.get(channel.schemaName) as any).resolve;
                            if (resolveFunction) {
                                resolveFunction(channel.schema);
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
                                datasource_id: datasource_id,
                                source: props,
                                type: UnifiedConverter.getWebappTypeFromROSType(channel.schemaName) || channel.schemaName,
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
                filter: async (topic: SelectedTopic) => {
                    try {
                        const hook = `${datasource_id}-${topic.topic}-publish`;
                        await connectionRef.current;

                        // find the channel id, in the publishers, to see if we are already publishing
                        const existingPublisher = Array.from(publisherRef.current.values()).find((publisher) => {
                            return publisher.topic === topic.topic;
                        });

                        if (existingPublisher) {
                            // Queue the operation to increase the count
                            await enqueueOperation(existingPublisher.channelId, async () => {
                                const publisher = publisherRef.current.get(existingPublisher.channelId);
                                if (publisher) {
                                    publisher.count++;
                                }
                            });
                            return true;
                        }

                        // Create a new publisher
                        const newChannelId = clientRef.current?.advertise({
                            topic: topic.topic,
                            encoding: "cdr",
                            schemaName: topic.rawType
                        });

                        if (!newChannelId && newChannelId !== 0) {
                            throw new Error(`Failed to advertise topic ${topic.topic}`);
                        }

                        // Create a promise with accessible resolve/reject functions
                        let promiseObj: {
                            promise: Promise<string>;
                            resolve: (schema: string) => void;
                            reject: (error: Error) => void;
                        };

                        promiseObj = {} as any;
                        promiseObj.promise = new Promise<string>((resolve, reject) => {
                            promiseObj.resolve = resolve;
                            promiseObj.reject = reject;
                        });

                        // Store the promise object for later use
                        pendingPublisherRef.current.set(topic.rawType, promiseObj.promise as any);
                        (pendingPublisherRef.current.get(topic.rawType) as any).resolve = promiseObj.resolve;
                        (pendingPublisherRef.current.get(topic.rawType) as any).reject = promiseObj.reject;

                        // Queue the operation to add the publisher
                        await enqueueOperation(newChannelId, async () => {

                            const schema: string = await promiseObj.promise;

                            // add the publisher to the list
                            const publisher = {
                                channelId: newChannelId,
                                topic: topic.topic,
                                schemaName: topic.rawType,
                                webtype: topic.type,
                                count: 1,
                                hook: `${datasource_id}-${topic.topic}-publish`,
                                writer: new MessageWriter(parse(schema, { ros2: true })),
                            } as Publisher;

                            publisherRef.current.set(newChannelId, publisher);

                            pluginsManager.addAction(hook, {
                                id: hook,
                                action: async (selected_topic: SelectedTopic, message: any, webtype: any) => {
                                    try {

                                        const converted = UnifiedConverter.convertToROS2(message, webtype, selected_topic.rawType);

                                        const msg = publisher.writer.writeMessage(converted);
                                        clientRef.current?.sendMessage(newChannelId, msg);
                                    } catch (error) {
                                        console.error("Failed to publish message", error);
                                    }
                                },
                                priority: 100,
                            });
                        });

                        return true;

                    } catch (error) {
                        console.error("Advertise error:", error);
                        if (props.toasts) {
                            toast({
                                title: "Error",
                                description: "Failed to advertise topic",
                                variant: "destructive",
                            });
                        }
                        return false;
                    }
                },
                priority: 100,
            });

            pluginsManager.addAction(unadvertise_hook, {
                id: unadvertise_hook,
                action: async (topic: DatasourceTopic, ignoreCount: boolean = false) => {
                    try {
                        await connectionRef.current;

                        // find the channel id
                        const channelId = Array.from(publisherRef.current.values()).find((publisher) => {
                            return publisher.topic === topic.topic;
                        })?.channelId;

                        if (!channelId) {
                            console.warn(`Not publishing to topic ${topic.topic}`);
                            return;
                        }

                        // Queue the unadvertise operation
                        await enqueueOperation(channelId, async () => {
                            // check if the topic is already published
                            if (!publisherRef.current.has(channelId)) {
                                console.warn(`Not publishing to topic ${topic.topic}`);
                                return;
                            }
                            const publisher = publisherRef.current.get(channelId);
                            if (publisher) {
                                if (ignoreCount) {
                                    publisher.count = 0;
                                } else {
                                    publisher.count--;
                                }

                                if (publisher.count <= 0) {
                                    clientRef.current?.unadvertise(channelId);
                                    publisherRef.current.delete(channelId);
                                    pluginsManager.removeAction(publisher.hook);
                                }
                            } else {
                                console.warn(`Not publishing to topic ${topic.topic}`);
                            }
                        }).catch(error => {
                            console.warn("Unadvertise error:", error);
                            if (props.toasts) {
                                toast({
                                    title: "Error",
                                    description: "Failed to unadvertise topic",
                                    variant: "destructive",
                                });
                            }
                        });

                    } catch (error) {
                        console.error("Unadvertise error:", error);
                        if (props.toasts) {
                            toast({
                                title: "Error",
                                description: "Failed to unadvertise topic",
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

                    // for all channels, get the schemaName
                    const channelsArray = Array.from(channelsRef.current.values());
                    const schemas = channelsArray.map((channel) => {
                        return channel.schemaName;
                    });
                    // remove duplicates
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

        // Function queue implementation
        const enqueueOperation = async (id: number, operation: () => Promise<void>): Promise<void> => {
            // Initialize the queue for this ID if it doesn't exist
            if (!queueRef.current.has(id)) {
                queueRef.current.set(id, []);
                processingRef.current.set(id, false);
            }

            // Create a promise that will resolve when the operation completes
            return new Promise<void>((resolve, reject) => {
                // Add the operation to the queue
                queueRef.current.get(id)?.push(async () => {
                    try {
                        await operation();
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });

                // Process the queue if it's not already being processed
                processQueue(id);
            });
        };

        // Function to add a pending subscription
        const addPendingSubscription = async (topic: string): Promise<boolean> => {
            return new Promise<boolean>((resolve, reject) => {
                // Generate a unique ID for this pending subscription
                // Using a hash of the topic name for simplicity
                const pendingId = hashTopicName(topic);

                // Check if there's already a pending subscription for this topic
                if (pendingSubscriptionsRef.current.has(pendingId)) {
                    // Increment the count for existing subscription
                    const existing = pendingSubscriptionsRef.current.get(pendingId)!;
                    existing.count++;
                    existing.resolvers.push(resolve);
                    existing.rejectors.push(reject);
                } else {
                    // Create a new pending subscription
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

        // Simple hash function for topic names
        const hashTopicName = (topic: string): number => {
            let hash = 0;
            for (let i = 0; i < topic.length; i++) {
                const char = topic.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return Math.abs(hash);
        };

        // Process pending subscriptions when new channels are advertised
        const processPendingSubscriptions = (channel: Channel) => {
            const pendingIds = Array.from(pendingSubscriptionsRef.current.keys());

            for (const pendingId of pendingIds) {
                const pending = pendingSubscriptionsRef.current.get(pendingId);

                if (pending && pending.topic === channel.topic) {
                    // Found a matching topic that's now available
                    // Create a DatasourceTopic for the subscription
                    const topic: DatasourceTopic = {
                        topic: channel.topic,
                        datasource_id: datasource_id,
                        source: props,
                        type: UnifiedConverter.getWebappTypeFromROSType(channel.schemaName) || channel.schemaName,
                        rawType: channel.schemaName
                    };

                    // Attempt to subscribe to the topic
                    enqueueOperation(channel.id, async () => {
                        try {
                            // Similar to regular subscribe but without throwing errors
                            const subscriptionId = clientRef.current?.subscribe(channel.id);

                            if (!subscriptionId && subscriptionId !== 0) {
                                // Subscription failed
                                for (const rejector of pending.rejectors) {
                                    rejector(new Error(`Failed to subscribe to topic ${pending.topic}`));
                                }
                            } else {
                                // Subscription succeeded
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

                                // Resolve all promises for this pending subscription
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

                            // Remove from pending subscriptions
                            pendingSubscriptionsRef.current.delete(pendingId);

                        } catch (error) {
                            console.error(`Failed to subscribe to pending topic ${pending.topic}:`, error);
                            // Reject all promises for this pending subscription
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

        // Process the function queue for a given ID
        const processQueue = async (id: number) => {
            // If already processing, return
            if (processingRef.current.get(id)) {
                return;
            }

            // Mark as processing
            processingRef.current.set(id, true);

            // Process all operations in the queue
            while (queueRef.current.get(id)?.length) {
                const operation = queueRef.current.get(id)?.shift();
                if (operation) {
                    try {
                        await operation();
                    } catch (error) {
                        console.error(`Error processing queue operation for ID ${id}:`, error);
                    }
                }
            }

            // Mark as not processing
            processingRef.current.set(id, false);
        };

        // Clear all queues
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

            // unsubscribe from all topics
            subscribersRef.current.forEach((subscriber) => {
                clientRef.current?.unsubscribe(subscriber.subscriberId);
            });

            subscribersRef.current.clear();
            channelsRef.current.clear();

            // Clear pending subscriptions and reject any outstanding promises
            pendingSubscriptionsRef.current.forEach((pending) => {
                for (const rejector of pending.rejectors) {
                    rejector(new Error("Component unmounted"));
                }
            });
            pendingSubscriptionsRef.current.clear();

            // Clear all operation queues
            clearQueues();

            disconnect();
        }

    }, [retry, props]);


    return (
        <FoxgloveSourceContext.Provider value={null}>
            {clientConnected && children}
            {!clientConnected && <Spinner />}
        </FoxgloveSourceContext.Provider>
    );

}

export { FoxgloveSourceProvider };
export type { FoxgloveDataSourceSettings };