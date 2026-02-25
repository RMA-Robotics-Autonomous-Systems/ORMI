"use client";

import React, { useState, useCallback } from "react";
import { ReadyState } from "react-use-websocket";

// import { WebSocketStatusOverlay } from "@workspace/utils";
import { toast } from "sonner";

import { TransformTreeManager } from "./transform-tree-manager";
import { FoxgloveDataSourceSettings } from "./types";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { FoxgloveDataHandler } from "./foxglove-data-handler";
import { SubscriptionManager } from "./subscription-manager";
import { PublisherManager } from "./publisher-manager";
import { ServiceManager } from "./service-manager";
import { TypeSystemManager } from "./type-system-manager";
import {
	FoxgloveMainThreadConnection,
	FoxgloveWorkerConnection,
} from "./foxglove-connection";

/**
 * Checks if the WebSocket URL is insecure (ws://).
 * @param url - WebSocket URL.
 * @returns True if insecure.
 */
const isInsecureWebSocketUrl = (url: string) =>
	url.trim().toLowerCase().startsWith("ws://");

/**
 * Hook to manage Foxglove connection status.
 * @param toasts - Whether to show toast notifications.
 * @returns Connection status and handlers.
 */
const useConnectionStatus = (toasts: boolean) => {
	const [readyState, setReadyState] = useState(ReadyState.CONNECTING);
	const [reconnectAttempt, setReconnectAttempt] = useState(0);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [showOverlay, setShowOverlay] = useState(true);

	const handleConnectionStatus = useCallback(
		(status: {
			connected: boolean;
			error?: string;
			reconnectAttempt?: number;
		}) => {
			if (status.connected) {
				setReadyState(ReadyState.OPEN);
				setShowOverlay(false);
				setConnectionError(null);
				if (toasts) {
					toast.success("Connected to Foxglove server");
				}
			} else if (status.reconnectAttempt && status.reconnectAttempt > 0) {
				setReadyState(ReadyState.CONNECTING);
				setShowOverlay(true);
				setConnectionError(status.error ?? null);
			} else {
				setReadyState(ReadyState.CLOSED);
				setShowOverlay(true);
				setConnectionError(status.error ?? null);
				if (status.error && toasts) {
					toast.error(status.error);
				}
			}
			setReconnectAttempt(status.reconnectAttempt ?? 0);
		},
		[toasts],
	);

	return {
		readyState,
		reconnectAttempt,
		connectionError,
		showOverlay,
		handleConnectionStatus,
		setReconnectAttempt,
	};
};

const FoxgloveSourceProvider = (props: FoxgloveDataSourceSettings) => {
	const pluginsManager = usePluginsManager();
	const [initialized, setInitialized] = useState(false);

	const handleInitialized = useCallback(
		(isInit: boolean) => {
			setInitialized(isInit);
			if (isInit) {
				pluginsManager.doAction(
					PluginsHooks.DATASOURCE_READY,
					props.id,
				);
			} else {
				pluginsManager.doAction(
					PluginsHooks.DATASOURCE_DISPOSED,
					props.id,
				);
			}
		},
		[pluginsManager, props.id],
	);
	const [webSocket, setWebSocket] = useState<WebSocket | null>(null);
	const {
		// readyState,
		// reconnectAttempt,
		// connectionError,
		// showOverlay,
		handleConnectionStatus,
		setReconnectAttempt,
	} = useConnectionStatus(props.toasts);

	const useMainThread = isInsecureWebSocketUrl(props.url);

	const content = useMainThread
		? initialized &&
			webSocket && (
				<FoxgloveDataHandler settings={props} webSocket={webSocket}>
					<TypeSystemManager settings={props}>
						<PublisherManager settings={props}>
							<ServiceManager settings={props}>
								<SubscriptionManager settings={props}>
									<TransformTreeManager settings={props} />
								</SubscriptionManager>
							</ServiceManager>
						</PublisherManager>
					</TypeSystemManager>
				</FoxgloveDataHandler>
			)
		: initialized && <TransformTreeManager settings={props} />;

	return (
		<>
			{/* TODO: Move WebSocketStatusOverlay to GlobalDataSourcesProvider or dashboard-level solution */}
			{/* <WebSocketStatusOverlay
                readyState={readyState}
                reconnectAttempt={reconnectAttempt}
                maxReconnectAttempts={10}
                error={connectionError}
                isVisible={showOverlay}
            /> */}
			{useMainThread ? (
				<FoxgloveMainThreadConnection
					settings={props}
					onConnectionStatus={handleConnectionStatus}
					onReconnectAttempt={setReconnectAttempt}
					onInitialized={handleInitialized}
					onWebSocket={setWebSocket}
				/>
			) : (
				<FoxgloveWorkerConnection
					settings={props}
					pluginsManager={pluginsManager}
					onConnectionStatus={handleConnectionStatus}
					onInitialized={handleInitialized}
				/>
			)}
			{content}
		</>
	);
};

export { FoxgloveSourceProvider };
export type { FoxgloveDataSourceSettings };

/**
 * Hook to use the Foxglove context (deprecated after worker migration).
 * @returns Throws error.
 */
export const useFoxgloveSource = () => {
	throw new Error("useFoxgloveSource is deprecated after worker migration");
};
