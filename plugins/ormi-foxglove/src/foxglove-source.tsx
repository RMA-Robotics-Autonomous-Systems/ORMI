"use client";

import React, { ReactNode, useState, useCallback } from "react";
import { ReadyState } from "react-use-websocket";

import { WebSocketStatusOverlay } from "@workspace/utils";
import { toast } from "sonner";

import { TransformTreeManager } from "./transform-tree-manager";
import { FoxgloveDataSourceSettings } from "./types";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { FoxgloveDataHandler } from "./foxglove-data-handler";
import { SubscriptionManager } from "./subscription-manager";
import { PublisherManager } from "./publisher-manager";
import { ServiceManager } from "./service-manager";
import { TypeSystemManager } from "./type-system-manager";
import {
	FoxgloveMainThreadConnection,
	FoxgloveWorkerConnection,
} from "./foxglove-connection";

const isInsecureWebSocketUrl = (url: string) =>
	url.trim().toLowerCase().startsWith("ws://");

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

const FoxgloveSourceProvider = (
	children: ReactNode,
	props: FoxgloveDataSourceSettings,
) => {
	const pluginsManager = usePluginsManager();
	const [initialized, setInitialized] = useState(false);
	const [webSocket, setWebSocket] = useState<WebSocket | null>(null);
	const {
		readyState,
		reconnectAttempt,
		connectionError,
		showOverlay,
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
									<TransformTreeManager settings={props}>
										{children}
									</TransformTreeManager>
								</SubscriptionManager>
							</ServiceManager>
						</PublisherManager>
					</TypeSystemManager>
				</FoxgloveDataHandler>
			)
		: initialized && (
				<TransformTreeManager settings={props}>
					{children}
				</TransformTreeManager>
			);

	return (
		<>
			<WebSocketStatusOverlay
				readyState={readyState}
				reconnectAttempt={reconnectAttempt}
				maxReconnectAttempts={10}
				error={connectionError}
				isVisible={showOverlay}
			/>
			{useMainThread ? (
				<FoxgloveMainThreadConnection
					settings={props}
					onConnectionStatus={handleConnectionStatus}
					onReconnectAttempt={setReconnectAttempt}
					onInitialized={setInitialized}
					onWebSocket={setWebSocket}
				/>
			) : (
				<FoxgloveWorkerConnection
					settings={props}
					pluginsManager={pluginsManager}
					onConnectionStatus={handleConnectionStatus}
					onInitialized={setInitialized}
				/>
			)}
			{content}
		</>
	);
};

export { FoxgloveSourceProvider };
export type { FoxgloveDataSourceSettings };

// Hook to use the Foxglove context (deprecated)
export const useFoxgloveSource = () => {
	throw new Error("useFoxgloveSource is deprecated after worker migration");
};
