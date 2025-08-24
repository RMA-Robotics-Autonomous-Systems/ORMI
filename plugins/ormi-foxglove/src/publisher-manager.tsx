/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { MessageWriter } from '@foxglove/rosmsg2-serialization';
import { parse } from '@foxglove/rosmsg';
import { toast } from 'sonner';

import { usePluginsManager } from '@workspace/ormi-plugins';
import { useFoxgloveData } from './foxglove-data-handler';
import { FoxgloveDataSourceSettings, Publisher, DatasourceTopic } from './types';
import { UnifiedConverter } from './unified-converter';

interface PublisherManagerProps {
    children: ReactNode;
    settings: FoxgloveDataSourceSettings;
}

const PublisherManager: React.FC<PublisherManagerProps> = ({ children, settings }) => {
    const { client, channels } = useFoxgloveData();
    const pluginsManager = usePluginsManager();

    // Initialization state
    const [isInitialized, setIsInitialized] = useState(false);

    // Publisher management - using the same structure as old provider
    const publisherRef = useRef<Map<number, Publisher>>(new Map());
    const pendingPublisherRef = useRef<Map<string, Promise<string>>>(new Map());
    const advertisingPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map());

    // Queue management for ordered operations
    const queueRef = useRef<Map<number, Array<() => Promise<void>>>>(new Map());
    const processingRef = useRef<Map<number, boolean>>(new Map());

    // Track initialization to handle React StrictMode properly
    const initializedRef = useRef<boolean>(false);
    const cleanupFunctionsRef = useRef<Array<() => void>>([]);

    const datasource_id = settings.id;
    const advertise_hook = `${datasource_id}-advertise`;
    const unadvertise_hook = `${datasource_id}-unadvertise`;

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

    // Handle channel advertisements to resolve pending schemas - exactly like old provider
    useEffect(() => {
        const processPendingSchemas = () => {
            Array.from(channels.values()).forEach((channel) => {
                // Check if this channel is in pending publishers and resolve the promise with the actual schema
                if (pendingPublisherRef.current.has(channel.schemaName)) {
                    const pendingPromise = pendingPublisherRef.current.get(channel.schemaName);
                    if (pendingPromise && (pendingPromise as any).resolve) {
                        (pendingPromise as any).resolve(channel.schema);
                        pendingPublisherRef.current.delete(channel.schemaName);
                    }
                }
            });
        };

        processPendingSchemas();
    }, [channels]);

    // Monitor channels for schema resolution
    useEffect(() => {
        const processPendingSchemas = () => {
            Array.from(channels.values()).forEach((channel) => {
                // Check if this channel is in pending publishers and resolve the promise with the actual schema
                if (pendingPublisherRef.current.has(channel.schemaName)) {
                    const pendingPromise = pendingPublisherRef.current.get(channel.schemaName);
                    if (pendingPromise && (pendingPromise as any).resolve) {
                        (pendingPromise as any).resolve(channel.schema);
                        pendingPublisherRef.current.delete(channel.schemaName);
                    }
                }
            });
        };

        processPendingSchemas();
    }, [channels]);

    // Register plugin system hooks
    useEffect(() => {
        if (!settings.enable) {
            return;
        }

        // In StrictMode, prevent double registration while allowing proper cleanup/re-registration
        if (initializedRef.current) {
            // Clean up previous registrations
            cleanupFunctionsRef.current.forEach(cleanup => cleanup());
            cleanupFunctionsRef.current = [];
        }

        initializedRef.current = true;

        // Store cleanup functions for later use
        const localCleanupFunctions: Array<() => void> = [];

        // Advertise filter - following old provider pattern exactly
        const advertiseFilterId = advertise_hook;

        pluginsManager.addFilter(advertise_hook, {
            id: advertise_hook,
            filter: async (topic: any): Promise<boolean> => {
                const topicName = topic.topic;
                const rawType = topic.rawType;

                // Return existing promise if advertising is already in progress
                if (advertisingPromisesRef.current.has(topicName)) {
                    return await advertisingPromisesRef.current.get(topicName)!;
                }

                const advertisePromise = (async (): Promise<boolean> => {
                    try {
                        // Check if client is available
                        if (!client) {
                            return false;
                        }

                        // Check for existing publisher
                        const existingPublisher = Array.from(publisherRef.current.values()).find(
                            p => p.topic === topicName
                        );

                        if (existingPublisher) {
                            console.log(`Advertise for ${topicName}: Publisher already exists on channel ${existingPublisher.channelId}`);
                            await enqueueOperation(existingPublisher.channelId, async () => {
                                const publisher = publisherRef.current.get(existingPublisher.channelId);
                                if (publisher) {
                                    publisher.count++;
                                } else {
                                    console.warn(`Advertise for ${topicName}: Publisher disappeared before count increment on channel ${existingPublisher.channelId}`);
                                }
                            });
                            return true;
                        }

                        // Advertise new channel
                        const newChannelId = client.advertise({
                            topic: topic.topic,
                            encoding: "cdr",
                            schemaName: rawType
                        });

                        console.log(`Advertise for ${topicName}: Initiated advertisement on channel ${newChannelId}`);

                        if (newChannelId === undefined || newChannelId === null) {
                            throw new Error(`Failed to initiate advertisement for topic ${topicName}`);
                        }

                        // Schema resolution - exactly like old provider
                        let schemaPromise: Promise<string>;
                        let schemaTimeout: NodeJS.Timeout | null = null;

                        const existingChannelWithSchema = Array.from(channels.values()).find(
                            ch => ch.schemaName === rawType && ch.schema
                        );

                        if (existingChannelWithSchema) {
                            schemaPromise = Promise.resolve(existingChannelWithSchema.schema);
                        } else if (pendingPublisherRef.current.has(rawType)) {
                            schemaPromise = pendingPublisherRef.current.get(rawType)!;
                        } else {
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
                                schema = await schemaPromise;
                                if (schemaTimeout) clearTimeout(schemaTimeout);

                                // Check if publisher already exists (race condition protection)
                                if (publisherRef.current.has(newChannelId)) {
                                    console.warn(`Advertise for ${topicName}: Publisher for channel ${newChannelId} already exists in enqueueOperation. Incrementing count.`);
                                    const pub = publisherRef.current.get(newChannelId)!;
                                    pub.count++;
                                    return;
                                }

                                // Create publisher - exactly like old provider
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

                                // Create publish action - exactly like old provider
                                const hook = publisher.hook;
                                console.log(`PublisherManager: Creating publish action with hook: ${hook}`);

                                pluginsManager.removeAction(hook);
                                pluginsManager.addAction(hook, {
                                    id: hook,
                                    action: async (selected_topic: any, message: any, webtype: any) => {
                                        const currentPublisher = publisherRef.current.get(newChannelId);
                                        if (!currentPublisher) {
                                            console.warn(`Publish action for ${topicName} (channel ${newChannelId}): Publisher no longer exists.`);
                                            return;
                                        }
                                        try {
                                            const converted = UnifiedConverter.convertToROS2(message, webtype, selected_topic.rawType);
                                            const msg = currentPublisher.writer.writeMessage(converted);
                                            client?.sendMessage(newChannelId, msg);
                                        } catch (error) {
                                            console.error(`Failed to publish message on ${topicName} (channel ${newChannelId}):`, error);
                                        }
                                    },
                                    priority: 100,
                                });

                            } catch (schemaError) {
                                console.error(`Advertise for ${topicName}: Error obtaining schema or setting up publisher for channel ${newChannelId}:`, schemaError);
                                try {
                                    client?.unadvertise(newChannelId);
                                } catch (unadvError) {
                                    console.error(`Advertise for ${topicName}: Failed to unadvertise channel ${newChannelId} after setup error:`, unadvError);
                                }
                                throw schemaError;
                            } finally {
                                if (pendingPublisherRef.current.has(rawType) &&
                                    pendingPublisherRef.current.get(rawType) === schemaPromise) {
                                    pendingPublisherRef.current.delete(rawType);
                                }
                            }
                        });

                        return true;

                    } catch (error) {
                        console.error(`Advertise for ${topicName}: Error during operation:`, error);
                        if (settings.toasts) {
                            toast("Error: Failed to advertise topic " + topicName + ": " + (error instanceof Error ? error.message : String(error)));
                        }
                        return false;
                    } finally {
                        advertisingPromisesRef.current.delete(topicName);
                    }
                })();

                advertisingPromisesRef.current.set(topicName, advertisePromise);
                return await advertisePromise;
            },
            priority: 100,
        });

        // Track cleanup for advertise filter
        localCleanupFunctions.push(() => pluginsManager.removeFilter(advertise_hook));

        // Unadvertise action - following old provider pattern exactly
        const unadvertiseActionId = unadvertise_hook; pluginsManager.addAction(unadvertise_hook, {
            id: unadvertise_hook,
            action: async (topic: DatasourceTopic, ignoreCount: boolean = false) => {
                const topicName = topic.topic;

                try {
                    // Check if client is available
                    if (!client) {
                        console.warn(`Unadvertise for ${topicName}: Client not available`);
                        return;
                    }

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

                        if (currentPublisher.count <= 0) {
                            try {
                                client?.unadvertise(channelId);
                            } catch (unadvError) {
                                console.error(`Unadvertise for ${topicName}: Error calling client.unadvertise for channel ${channelId}:`, unadvError);
                            }

                            publisherRef.current.delete(channelId);
                            pluginsManager.removeAction(currentPublisher.hook);
                        }
                    });

                } catch (error) {
                    console.error(`Unadvertise for ${topicName}: Error:`, error);
                    if (settings.toasts) {
                        toast("Error: Failed to unadvertise topic " + topicName + ": " + (error instanceof Error ? error.message : String(error)));
                    }
                }
            },
            priority: 100,
        });

        // Track cleanup for unadvertise action
        localCleanupFunctions.push(() => pluginsManager.removeAction(unadvertise_hook));

        // Store cleanup functions for React StrictMode handling
        cleanupFunctionsRef.current = localCleanupFunctions;

        // Mark as initialized after successful registration
        setIsInitialized(true);

        return () => {
            console.log(`PublisherManager: Cleaning up hooks for datasource ${settings.id}`);

            // Reset initialization state
            setIsInitialized(false);

            // Reset initialization flag
            initializedRef.current = false;

            // Use tracked cleanup functions
            cleanupFunctionsRef.current.forEach(cleanup => cleanup());
            cleanupFunctionsRef.current = [];

            // Cleanup all publishers - exactly like old provider
            publisherRef.current.forEach((publisher) => {
                pluginsManager.removeAction(publisher.hook);
                if (client) {
                    try {
                        client.unadvertise(publisher.channelId);
                    } catch (error) {
                        console.error(`Error unadvertising channel ${publisher.channelId} during cleanup:`, error);
                    }
                }
            });
            publisherRef.current.clear();

            // Cleanup pending schema promises
            pendingPublisherRef.current.forEach((promise) => {
                if ((promise as any).resolve) {
                    // Resolve with empty schema instead of rejecting
                    (promise as any).resolve("");
                }
            });
            pendingPublisherRef.current.clear();

            advertisingPromisesRef.current.clear();

            // Clear queues
            queueRef.current.clear();
            processingRef.current.clear();
        };
    }, [settings.enable, settings.id, pluginsManager]);

    return <>{isInitialized ? children : null}</>;
};

export { PublisherManager };
export type { PublisherManagerProps };
