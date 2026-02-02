"use client";

import { useEffect, useRef } from "react";
import { FoxgloveClient } from "@foxglove/ws-protocol";
import type { PluginsManager } from "@workspace/ormi-plugins";
import { toast } from "sonner";

import { FoxgloveWorkerHost } from "./foxglove-worker-host";
import type { FoxgloveDataSourceSettings } from "./types";

interface ConnectionStatusPayload {
	connected: boolean;
	error?: string;
	reconnectAttempt?: number;
}

interface MainThreadConnectionProps {
	settings: FoxgloveDataSourceSettings;
	onConnectionStatus: (status: ConnectionStatusPayload) => void;
	onReconnectAttempt: (attempt: number) => void;
	onInitialized: (ready: boolean) => void;
	onWebSocket: (socket: WebSocket | null) => void;
}

const FoxgloveMainThreadConnection: React.FC<MainThreadConnectionProps> = ({
	settings,
	onConnectionStatus,
	onReconnectAttempt,
	onInitialized,
	onWebSocket,
}) => {
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const reconnectAttemptRef = useRef(0);

	useEffect(() => {
		let disposed = false;
		let socket: WebSocket | null = null;

		const clearReconnectTimer = () => {
			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current);
				reconnectTimerRef.current = null;
			}
		};

		const scheduleReconnect = (error?: string) => {
			const timeoutSeconds = settings.reconnectTimeout ?? 2;
			if (disposed || timeoutSeconds <= 0) {
				onConnectionStatus({
					connected: false,
					error: error ?? "WebSocket connection closed",
					reconnectAttempt: 0,
				});
				return;
			}

			reconnectAttemptRef.current += 1;
			const attempt = reconnectAttemptRef.current;
			onReconnectAttempt(attempt);
			onConnectionStatus({
				connected: false,
				error: error ?? "WebSocket connection lost",
				reconnectAttempt: attempt,
			});

			clearReconnectTimer();
			reconnectTimerRef.current = setTimeout(() => {
				if (!disposed) {
					connect();
				}
			}, timeoutSeconds * 1000);
		};

		const connect = () => {
			clearReconnectTimer();
			if (disposed) return;

			try {
				socket = new WebSocket(settings.url, [
					FoxgloveClient.SUPPORTED_SUBPROTOCOL,
					"foxglove.sdk.v1",
				]);
				onInitialized(true);

				socket.addEventListener("open", () => {
					if (disposed) return;
					reconnectAttemptRef.current = 0;
					onReconnectAttempt(0);
					// Pass the socket only after it's open
					onWebSocket(socket);
					onConnectionStatus({ connected: true });
				});

				socket.addEventListener("close", (event) => {
					if (disposed) return;
					onWebSocket(null);
					if (!event.wasClean) {
						scheduleReconnect(
							event.reason ||
								"WebSocket connection closed unexpectedly",
						);
					} else {
						onConnectionStatus({
							connected: false,
							reconnectAttempt: 0,
						});
					}
				});

				socket.addEventListener("error", () => {
					if (disposed) return;
					onWebSocket(null);
					scheduleReconnect("Foxglove WebSocket error");
				});
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				scheduleReconnect(errorMessage);
			}
		};

		connect();

		return () => {
			disposed = true;
			clearReconnectTimer();
			reconnectAttemptRef.current = 0;
			onReconnectAttempt(0);
			onInitialized(false);
			onWebSocket(null);
			if (socket) {
				socket.close();
				socket = null;
			}
		};
	}, [
		settings.url,
		settings.reconnectTimeout,
		onConnectionStatus,
		onReconnectAttempt,
		onInitialized,
		onWebSocket,
	]);

	return null;
};

interface WorkerConnectionProps {
	settings: FoxgloveDataSourceSettings;
	pluginsManager: PluginsManager;
	onConnectionStatus: (status: ConnectionStatusPayload) => void;
	onInitialized: (ready: boolean) => void;
}

const FoxgloveWorkerConnection: React.FC<WorkerConnectionProps> = ({
	settings,
	pluginsManager,
	onConnectionStatus,
	onInitialized,
}) => {
	useEffect(() => {
		let disposed = false;
		let host: FoxgloveWorkerHost<FoxgloveDataSourceSettings> | null = null;
		let unsubscribe: (() => void) | null = null;

		const worker = new Worker(
			new URL("./foxglove-source.worker.js", import.meta.url),
			{
				type: "module",
				name: `datasource:${settings.id}`,
			},
		);

		host = new FoxgloveWorkerHost({
			worker,
			datasourceId: settings.id,
			settings,
			pluginsManager,
		});

		host.registerHooks();

		unsubscribe = host.onConnectionStatus((status) => {
			if (disposed) return;
			onConnectionStatus(status);
		});

		host.init()
			.then(() => {
				if (!disposed) {
					onInitialized(true);
				}
			})
			.catch((error) => {
				if (!disposed) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					console.error(
						"[Foxglove] Failed to initialize worker:",
						errorMessage,
					);
					onConnectionStatus({
						connected: false,
						error: errorMessage,
						reconnectAttempt: 0,
					});
					onInitialized(false);
					if (settings.toasts) {
						toast.error("Failed to initialize Foxglove datasource");
					}
				}
			});

		return () => {
			disposed = true;
			if (unsubscribe) unsubscribe();
			if (host) host.dispose();
			onInitialized(false);
		};
	}, [settings, pluginsManager, onConnectionStatus, onInitialized]);

	return null;
};

export { FoxgloveMainThreadConnection, FoxgloveWorkerConnection };
export type {
	ConnectionStatusPayload,
	MainThreadConnectionProps,
	WorkerConnectionProps,
};
