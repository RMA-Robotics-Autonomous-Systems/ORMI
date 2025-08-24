/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Channel, FoxgloveClient } from '@foxglove/ws-protocol';
import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";

import { UnifiedConverter } from "./unified-converter";
import { FoxgloveDataSourceSettings, Subscriber, FoxgloveMessageData, DatasourceTopic } from './types';
import { usePluginsManager, PluginsHooks } from '@workspace/ormi-plugins';
import { useWebSocket } from '@workspace/utils';
import { toast } from 'sonner';

// Context for sharing Foxglove client and data across components
const FoxgloveDataContext = createContext<{
    client: FoxgloveClient | null;
    isConnected: boolean;
    channels: Map<number, Channel>;
    onChannelAdvertised: (callback: (channel: Channel) => void) => void;
    onChannelUnadvertised: (callback: (channelIds: number[]) => void) => void;
    onMessage: (callback: (data: FoxgloveMessageData) => void) => void;
} | null>(null);

interface FoxgloveDataHandlerProps {
    children: ReactNode;
    settings: FoxgloveDataSourceSettings;
}

const FoxgloveDataHandler: React.FC<FoxgloveDataHandlerProps> = ({ children, settings }) => {
    const { socket, isConnected } = useWebSocket();
    const pluginsManager = usePluginsManager();

    const [client, setClient] = useState<FoxgloveClient | null>(null);
    const [channels, setChannels] = useState<Map<number, Channel>>(new Map());
    const initializingRef = useRef<boolean>(false); // Track initialization state

    // Event callback refs
    const channelAdvertisedCallbacksRef = useRef<Array<(channel: Channel) => void>>([]);
    const channelUnadvertisedCallbacksRef = useRef<Array<(channelIds: number[]) => void>>([]);
    const messageCallbacksRef = useRef<Array<(data: { subscriptionId: number; timestamp: any; data: Uint8Array }) => void>>([]);

    // Initialize UnifiedConverter with plugins manager
    useEffect(() => {
        UnifiedConverter.pluginManager = pluginsManager;
    }, [pluginsManager]);

    // Register plugin system hooks
    useEffect(() => {
        if (!settings.enable) {
            return;
        }

        const datasource_id = settings.id;
        const available_topics_handler = `${datasource_id}-available-topics`;
        const connection_client_filter = `${datasource_id}-foxglove-connection-client`;

        // Register available topics filter
        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: available_topics_handler,
            filter: async (topics) => {
                try {
                    // Convert channels to DatasourceTopic objects
                    const channelsArray = Array.from(channels.values());

                    const newTopics = channelsArray.map((channel) => {
                        return {
                            topic: channel.topic,
                            datasource_id: datasource_id,
                            source: settings,
                            type: UnifiedConverter.getWebappTypeFromROSType(channel.schemaName) || "",
                            rawType: channel.schemaName,
                        } as DatasourceTopic;
                    });

                    // Add the new topics to the existing ones
                    const allTopics = [...topics, ...newTopics];
                    return allTopics;
                } catch (error) {
                    console.error("Error in available topics filter:", error);
                    return topics;
                }
            },
            priority: 100,
        });

        // Register connection client filter (allows other components to access the client)
        pluginsManager.addFilter(connection_client_filter, {
            id: connection_client_filter,
            filter: (_obj = {}) => {
                return client;
            },
            priority: 1,
        });

        // Cleanup function
        return () => {
            pluginsManager.removeFilter(available_topics_handler);
            pluginsManager.removeFilter(connection_client_filter);
        };
    }, [settings.enable, settings.id, pluginsManager, channels]);

    // Initialize Foxglove client when WebSocket is connected
    useEffect(() => {
        if (!isConnected || !socket || !settings.enable) {
            // Clean up client if disconnected
            if (client) {
                setClient(null);
                setChannels(new Map());
                initializingRef.current = false;
            }
            return;
        }

        // Prevent duplicate initialization in StrictMode
        if (client || initializingRef.current) {
            return;
        }

        initializingRef.current = true;

        // Create Foxglove client
        const foxgloveClient = new FoxgloveClient({
            ws: socket,
        });

        // Since the socket is externally managed and already connected,
        // we don't need to wait for the "open" event - set the client immediately
        setClient(foxgloveClient);
        initializingRef.current = false;

        if (settings.toasts) {
            toast('Foxglove client ready');
        }

        // Set up event handlers for protocol events
        foxgloveClient.on("open", () => {
            // This event may not fire with externally managed sockets
        });

        foxgloveClient.on('error', (error) => {
            console.error("Foxglove client error:", error);
            initializingRef.current = false;
            if (settings.toasts) {
                toast(`Foxglove client error: ${error.message}`);
            }
        });

        foxgloveClient.on("close", () => {
            setClient(null);
            setChannels(new Map());
            initializingRef.current = false;
        });

        // Handle channel advertisements
        foxgloveClient.on("advertise", (channelsList: Channel[]) => {
            setChannels(prevChannels => {
                const newChannels = new Map(prevChannels);
                channelsList.forEach((channel) => {
                    if (!newChannels.has(channel.id)) {
                        newChannels.set(channel.id, channel);

                        // Notify all registered callbacks
                        channelAdvertisedCallbacksRef.current.forEach(callback => {
                            try {
                                callback(channel);
                            } catch (error) {
                                console.error("Error in channel advertised callback:", error);
                            }
                        });
                    }
                });

                // If we're getting channels but the client isn't set yet, set it now
                // This shouldn't happen with immediate client setting, but kept as safeguard
                if (!client && newChannels.size > 0) {
                    setClient(foxgloveClient);
                    initializingRef.current = false;
                }

                return newChannels;
            });
        });

        // Handle channel unadvertisements
        foxgloveClient.on("unadvertise", (ids: number[]) => {
            setChannels(prevChannels => {
                const newChannels = new Map(prevChannels);
                ids.forEach((id) => {
                    if (newChannels.has(id)) {
                        newChannels.delete(id);
                    }
                });
                return newChannels;
            });

            // Notify all registered callbacks
            channelUnadvertisedCallbacksRef.current.forEach(callback => {
                try {
                    callback(ids);
                } catch (error) {
                    console.error("Error in channel unadvertised callback:", error);
                }
            });
        });

        // Handle incoming messages
        foxgloveClient.on("message", (messageData: any) => {
            // Convert to our expected format
            const foxgloveMessage: FoxgloveMessageData = {
                subscriptionId: messageData.subscriptionId,
                timestamp: messageData.timestamp,
                data: messageData.data instanceof Uint8Array
                    ? messageData.data
                    : new Uint8Array(messageData.data.buffer, messageData.data.byteOffset, messageData.data.byteLength)
            };

            // Notify all registered callbacks
            messageCallbacksRef.current.forEach(callback => {
                try {
                    callback(foxgloveMessage);
                } catch (error) {
                    console.error("Error in message callback:", error);
                }
            });
        });

        return () => {
            // Only clean up client state, don't close the socket
            // Socket closure is handled by the WebSocket provider
            setClient(null);
            setChannels(new Map());
            initializingRef.current = false;
        };
    }, [isConnected, socket, settings.enable, settings.toasts]);

    // Register callback functions
    const onChannelAdvertised = (callback: (channel: Channel) => void) => {
        channelAdvertisedCallbacksRef.current.push(callback);

        // Return cleanup function
        return () => {
            const index = channelAdvertisedCallbacksRef.current.indexOf(callback);
            if (index > -1) {
                channelAdvertisedCallbacksRef.current.splice(index, 1);
            }
        };
    };

    const onChannelUnadvertised = (callback: (channelIds: number[]) => void) => {
        channelUnadvertisedCallbacksRef.current.push(callback);

        return () => {
            const index = channelUnadvertisedCallbacksRef.current.indexOf(callback);
            if (index > -1) {
                channelUnadvertisedCallbacksRef.current.splice(index, 1);
            }
        };
    };

    const onMessage = (callback: (data: FoxgloveMessageData) => void) => {
        messageCallbacksRef.current.push(callback);

        return () => {
            const index = messageCallbacksRef.current.indexOf(callback);
            if (index > -1) {
                messageCallbacksRef.current.splice(index, 1);
            }
        };
    };

    const contextValue = {
        client,
        isConnected,
        channels,
        onChannelAdvertised,
        onChannelUnadvertised,
        onMessage,
    };

    return (
        <FoxgloveDataContext.Provider value={contextValue}>
            {client && children}
        </FoxgloveDataContext.Provider>
    );
};

// Hook to use the Foxglove data context
export const useFoxgloveData = () => {
    const context = useContext(FoxgloveDataContext);
    if (!context) {
        throw new Error('useFoxgloveData must be used within a FoxgloveDataHandler');
    }
    return context;
};

export { FoxgloveDataHandler };
export type { FoxgloveDataHandlerProps };
