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
import { MessageReader } from "@foxglove/rosmsg2-serialization";

import { UnifiedConverter } from "ormi-ros-2";

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

    const serverConnectionRef = useRef<Promise<boolean> | null>(null);

    // channels
    const channelsRef = useRef<Map<number, Channel>>(new Map<number, Channel>());

    // subscribers, channel id, subscriber count
    const subscribersRef = useRef<Map<number, Subscriber>>(new Map<number, Subscriber>());

    // Function queue for ordered processing
    const queueRef = useRef<Map<number, Array<() => Promise<void>>>>(new Map<number, Array<() => Promise<void>>>());
    const processingRef = useRef<Map<number, boolean>>(new Map<number, boolean>());

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
                    channelsList.forEach((channel) => {
                        if (!channelsRef.current.has(channel.id)) {
                            channelsRef.current.set(channel.id, channel);
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
                                type: UnifiedConverter.getWebappTypeFromROSType(channel.schemaName),
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
                        throw new Error(`Channel not found for topic ${topic.topic}`);
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
                    return null;
                }
            });

            pluginsManager.addFilter(advertise_hook, {
                id: advertise_hook,
                filter: async (topic: SelectedTopic) => {
                    try {
                        const hook = `${datasource_id}-${topic.topic}-publish`;

                        pluginsManager.addAction(hook, {
                            id: hook,
                            action: async (selected_topic: SelectedTopic, message: any, webtype: any) => {
                                try {


                                } catch (error) {
                                    console.error("Failed to publish message", error);
                                }
                            },
                            priority: 100,
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