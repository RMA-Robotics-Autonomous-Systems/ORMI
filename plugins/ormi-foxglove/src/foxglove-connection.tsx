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
	// `onConnectionStatus` is re-created upstream whenever `toasts` changes;
	// read through a ref so toggling toasts does not reconnect the socket.
	const onConnectionStatusRef = useRef(onConnectionStatus);
	useEffect(() => {
		onConnectionStatusRef.current = onConnectionStatus;
	}, [onConnectionStatus]);

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
				onConnectionStatusRef.current({
					connected: false,
					error: error ?? "WebSocket connection closed",
					reconnectAttempt: 0,
				});
				return;
			}

			reconnectAttemptRef.current += 1;
			const attempt = reconnectAttemptRef.current;
			onReconnectAttempt(attempt);
			onConnectionStatusRef.current({
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

				socket.addEventListener("open", () => {
					if (disposed) return;
					reconnectAttemptRef.current = 0;
					onReconnectAttempt(0);
					// Pass the socket only after it's open
					onWebSocket(socket);
					onInitialized(true);
					onConnectionStatusRef.current({ connected: true });
				});

				socket.addEventListener("close", (event) => {
					if (disposed) return;
					onWebSocket(null);
					onInitialized(false);
					if (!event.wasClean) {
						scheduleReconnect(
							event.reason ||
								"WebSocket connection closed unexpectedly",
						);
					} else {
						onConnectionStatusRef.current({
							connected: false,
							reconnectAttempt: 0,
						});
					}
				});

				socket.addEventListener("error", () => {
					if (disposed) return;
					onWebSocket(null);
					onInitialized(false);
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
		onReconnectAttempt,
		onInitialized,
		onWebSocket,
	]);

	return null;
};

/**
 * Settings that never reach the worker connection: `title` is display-only
 * (pushed to the host instead), `toasts` only decides whether a failure is
 * also toasted, and `enable` is core's: a disabled datasource's provider is
 * never mounted.
 */
const NON_CONNECTION_SETTINGS = new Set(["title", "toasts", "enable"]);

/**
 * Content key for the worker connection effect: every setting except the ones
 * that cannot change what the worker connects to or how it decodes. A denylist
 * on purpose, so a connection field added later restarts the worker by default.
 *
 * @param settings - Current provider settings.
 * @returns A string that changes only when a restart is warranted.
 */
function foxgloveWorkerConnectionKey(
	settings: FoxgloveDataSourceSettings,
): string {
	return JSON.stringify(
		Object.entries(settings)
			.filter(([key]) => !NON_CONNECTION_SETTINGS.has(key))
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	);
}

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
	// `GlobalDataSourcesProvider` renders `<Provider {...datasource.settings} />`,
	// so the settings object is a NEW object on every one of its renders; the
	// effect is keyed on content instead. And only on the content the worker
	// connection consumes: a rename or a toasts toggle used to terminate the
	// worker and reconnect the robot. Those reach the host through
	// `updateSettings`, and the callbacks through refs, so a `toasts` change
	// (which re-creates `onConnectionStatus` upstream) does not restart it either.
	const connectionKey = foxgloveWorkerConnectionKey(settings);
	const settingsRef = useRef(settings);
	const hostRef =
		useRef<FoxgloveWorkerHost<FoxgloveDataSourceSettings> | null>(null);
	const onConnectionStatusRef = useRef(onConnectionStatus);
	const onInitializedRef = useRef(onInitialized);

	// Synced in an effect, never during render: a render-phase ref write is what
	// the React Compiler's lint rules reject.
	useEffect(() => {
		settingsRef.current = settings;
		hostRef.current?.updateSettings(settings);
	}, [settings]);

	useEffect(() => {
		onConnectionStatusRef.current = onConnectionStatus;
		onInitializedRef.current = onInitialized;
	}, [onConnectionStatus, onInitialized]);

	useEffect(() => {
		const settings = settingsRef.current;
		let disposed = false;
		let host: FoxgloveWorkerHost<FoxgloveDataSourceSettings> | null = null;
		let unsubscribe: (() => void) | null = null;

		const worker = new Worker(
			new URL("./foxglove-source.worker", import.meta.url),
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
		hostRef.current = host;

		unsubscribe = host.onConnectionStatus((status) => {
			if (disposed) return;
			onConnectionStatusRef.current(status);
		});

		host.init()
			.then(() => {
				if (!disposed) {
					onInitializedRef.current(true);
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
					onConnectionStatusRef.current({
						connected: false,
						error: errorMessage,
						reconnectAttempt: 0,
					});
					onInitializedRef.current(false);
					if (settingsRef.current.toasts) {
						toast.error("Failed to initialize Foxglove datasource");
					}
				}
			});

		return () => {
			disposed = true;
			if (unsubscribe) unsubscribe();
			if (host) host.dispose();
			if (hostRef.current === host) hostRef.current = null;
			onInitializedRef.current(false);
		};
	}, [connectionKey, pluginsManager]);

	return null;
};

export {
	FoxgloveMainThreadConnection,
	FoxgloveWorkerConnection,
	foxgloveWorkerConnectionKey,
};
export type {
	ConnectionStatusPayload,
	MainThreadConnectionProps,
	WorkerConnectionProps,
};
