/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { Channel, FoxgloveClient, MessageData } from "@foxglove/ws-protocol";
import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";
import { WebSocketLike } from "react-use-websocket/dist/lib/types";

import { createAvailableTopicsFilter } from "./available-topics-filter";
import {
	FoxgloveDataSourceSettings,
	Subscriber,
	FoxgloveMessageData,
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

	// Drop back to "no connection" without minting a fresh Map identity when
	// there are already no channels: an empty `new Map()` is a new object every
	// time, and these two paths run on every re-render that arrives before the
	// socket is open, waking every consumer of `channels` for nothing.
	const clearConnection = useCallback(() => {
		setClient(null);
		setChannels((prev) => (prev.size === 0 ? prev : new Map()));
		setIsConnected(false);
	}, []);

	useEffect(() => {
		if (!webSocket || !(webSocket instanceof WebSocket)) {
			clearConnection();
			return;
		}

		// Only create the client if the socket is actually open
		if (webSocket.readyState !== WebSocket.OPEN) {
			clearConnection();
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
	}, [webSocket, callbacks, clearConnection]);

	// `AVAILABLE_TOPICS` is a PULL filter — it runs when a consumer asks — so
	// the answer is built from whatever the datasource looks like at call time.
	// Reading `settings` and `channels` out of the effect's closure instead made
	// every listed topic carry the settings of the render the effect last ran
	// in, which is why renaming a datasource left every topic row showing the
	// old title until the dashboard was reloaded. Re-registering the filter on
	// each settings change is not the answer either: that churns
	// addFilter/removeFilter through an edit, and channels change on every
	// advertise. Both are therefore read through refs the filter dereferences
	// when it is invoked.
	const settingsRef = useRef(settings);
	const channelsRef = useRef(channels);

	// Synced in effects rather than during render: a render-phase ref write is
	// what the React Compiler's lint rules reject, and silencing them would opt
	// this component out of compilation entirely.
	useEffect(() => {
		settingsRef.current = settings;
	}, [settings]);

	useEffect(() => {
		channelsRef.current = channels;
	}, [channels]);

	// Keyed on the datasource's instance id, not the settings object: the id is
	// what the hook names are built from and it never changes for the lifetime
	// of the instance, so an edit re-points the refs above without tearing the
	// registration down.
	const datasource_id = settings.id;

	useEffect(() => {
		if (!client) return;

		const available_topics_handler = `${datasource_id}-available-topics`;
		const connection_client_filter = `${datasource_id}-foxglove-connection-client`;

		pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: available_topics_handler,
			filter: createAvailableTopicsFilter({
				getSettings: () => settingsRef.current,
				getChannels: () => channelsRef.current,
			}),
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
	}, [client, datasource_id, pluginsManager]);

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
