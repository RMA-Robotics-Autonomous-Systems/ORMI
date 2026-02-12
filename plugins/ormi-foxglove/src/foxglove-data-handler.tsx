/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, {
	createContext,
	ReactNode,
	use,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { Channel, FoxgloveClient, MessageData } from "@foxglove/ws-protocol";
import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";
import { WebSocketLike } from "react-use-websocket/dist/lib/types";

import { UnifiedConverter } from "./unified-converter";
import {
	FoxgloveDataSourceSettings,
	Subscriber,
	FoxgloveMessageData,
	DatasourceTopic,
} from "./types";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { toast } from "sonner";

/**
 * Context for sharing Foxglove client and data across components.
 */
const FoxgloveDataContext = createContext<{
	client: FoxgloveClient | null;
	isConnected: boolean;
	channels: Map<number, Channel>;
	addCallback?: (eventType: string, callback: () => void) => void;
	removeCallback?: (eventType: string, callback: () => void) => void;
} | null>(null);

/**
 * Props for FoxgloveDataHandler.
 */
interface FoxgloveDataHandlerProps {
	children: ReactNode;
	settings: FoxgloveDataSourceSettings;
	webSocket: WebSocketLike | null;
}

const FoxgloveDataHandler: React.FC<FoxgloveDataHandlerProps> = ({
	children,
	settings,
	webSocket,
}) => {
	const pluginsManager = usePluginsManager();

	const [client, setClient] = useState<FoxgloveClient | null>(null);
	const [channels, setChannels] = useState<Map<number, Channel>>(new Map());
	const [callbacks, setCallbacks] = useState<Map<string, (() => void)[]>>(
		new Map(),
	); // event_type -> callbacks[]
	const [isConnected, setIsConnected] = useState<boolean>(false);

	const addCallback = (eventType: string, callback: () => void) => {
		setCallbacks((prev) => {
			const updated = new Map(prev);
			if (!updated.has(eventType)) {
				updated.set(eventType, []);
			}
			updated.get(eventType)!.push(callback);
			return updated;
		});
	};

	const removeCallback = (eventType: string, callback: () => void) => {
		setCallbacks((prev) => {
			const updated = new Map(prev);
			if (updated.has(eventType)) {
				const filtered = updated
					.get(eventType)!
					.filter((cb) => cb !== callback);
				updated.set(eventType, filtered);
			}
			return updated;
		});
	};

	useEffect(() => {
		if (!webSocket || !(webSocket instanceof WebSocket)) {
			setClient(null);
			setChannels(new Map());
			setIsConnected(false);
			return;
		}

		// Only create the client if the socket is actually open
		if (webSocket.readyState !== WebSocket.OPEN) {
			setClient(null);
			setChannels(new Map());
			setIsConnected(false);
			return;
		}

		setIsConnected(true);

		const newClient = new FoxgloveClient({ ws: webSocket });

		const handleAdvertise = (newChannels: Channel[]) => {
			setChannels((prev) => {
				const updated = new Map(prev);
				for (const channel of newChannels) {
					updated.set(channel.id, channel);
				}

				return updated;
			});
		};

		const handleUnadvertise = (removedChannelIds: number[]) => {
			setChannels((prev) => {
				const updated = new Map(prev);
				for (const id of removedChannelIds) {
					updated.delete(id);
				}
				return updated;
			});
		};

		newClient.on("advertise", handleAdvertise);
		newClient.on("unadvertise", handleUnadvertise);

		for (const [eventType, cbs] of callbacks.entries()) {
			for (const cb of cbs) {
				newClient.on(eventType as any, cb as any);
			}
		}

		setClient(newClient);

		return () => {
			newClient.off("advertise", handleAdvertise);
			newClient.off("unadvertise", handleUnadvertise);

			for (const [eventType, cbs] of callbacks.entries()) {
				for (const cb of cbs) {
					newClient.off(eventType as any, cb as any);
				}
			}

			setClient(null);
		};
	}, [webSocket, callbacks]);

	useEffect(() => {
		if (!client) return;

		const datasource_id = settings.id;
		const available_topics_handler = `${datasource_id}-available-topics`;
		const connection_client_filter = `${datasource_id}-foxglove-connection-client`;

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
							type:
								UnifiedConverter.getWebappTypeFromROSType(
									channel.schemaName,
								) || "",
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

		return () => {
			pluginsManager.removeFilter(available_topics_handler);
			pluginsManager.removeFilter(connection_client_filter);
		};
	}, [channels]);

	/*
        type EventTypes = {
        open: () => void;
        error: (error: Error) => void;
        close: (event: CloseEvent) => void;

        serverInfo: (event: ServerInfo) => void;
        status: (event: StatusMessage) => void;
        removeStatus: (event: RemoveStatusMessages) => void;
        message: (event: MessageData) => void;
        time: (event: Time) => void;
        advertise: (newChannels: Channel[]) => void;
        unadvertise: (removedChannels: ChannelId[]) => void;
        advertiseServices: (newServices: Service[]) => void;
        unadvertiseServices: (removedServices: ServiceId[]) => void;
        parameterValues: (event: ParameterValues) => void;
        serviceCallResponse: (event: ServiceCallResponse) => void;
        connectionGraphUpdate: (event: ConnectionGraphUpdate) => void;
        fetchAssetResponse: (event: FetchAssetResponse) => void;
        serviceCallFailure: (event: ServiceCallFailure) => void;
        };
    */

	const contextValue = {
		client,
		isConnected,
		channels,
		addCallback,
		removeCallback,
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
		throw new Error(
			"useFoxgloveData must be used within a FoxgloveDataHandler",
		);
	}
	return context;
};

export { FoxgloveDataHandler };
export type { FoxgloveDataHandlerProps };
