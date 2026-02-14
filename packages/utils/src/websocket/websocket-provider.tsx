import { useRef, useState, useEffect, useCallback } from "react";
import { Spinner } from "@workspace/ui/components/spinner";
import { createSafeContext } from "../create-safe-context";

const [WebSocketContextProvider, useWebSocketContext] =
	createSafeContext<WebSocketContextValue>("WebSocket");

/**
 * Enum representing WebSocket connection status.
 */
export enum WebSocketStatus {
	CONNECTING = "connecting",
	CONNECTED = "connected",
	DISCONNECTED = "disconnected",
	RECONNECTING = "reconnecting",
	ERROR = "error",
}

/**
 * Interface for WebSocket error data.
 */
export interface WebSocketError {
	type: "connection" | "timeout" | "message" | "unknown";
	message: string;
	event?: Event;
	reconnectAttempt?: number;
}

interface WebSocketProviderProps {
	children: React.ReactNode;
	url: string;
	protocols?: string | string[];
	timeout?: number;
	reconnectAttempts?: number;
	reconnectInterval?: number;
	onMessage?: (event: MessageEvent) => void;
	onError?: (error: WebSocketError) => void;
	onOpen?: (event: Event) => void;
	onClose?: (event: CloseEvent) => void;
}

interface WebSocketContextValue {
	socket: WebSocket | null;
	status: WebSocketStatus;
	isConnected: boolean;
	isConnecting: boolean;
	isReconnecting: boolean;
	error: WebSocketError | null;
	reconnectAttempt: number;
	maxReconnectAttempts: number;
	sendMessage: (
		data: string | ArrayBufferLike | Blob | ArrayBufferView,
	) => void;
	connect: () => void;
	disconnect: () => void;
	clearError: () => void;
}

/**
 * WebSocket provider component.
 *
 * @param props - Provider props including URL, callbacks, and configuration
 */
export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
	children,
	url,
	protocols,
	timeout = 5000,
	reconnectAttempts = 5,
	reconnectInterval = 3000,
	onMessage,
	onError,
	onOpen,
	onClose,
}) => {
	const socketRef = useRef<WebSocket | null>(null);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttemptRef = useRef<number>(0);
	const isMountedRef = useRef<boolean>(true);

	const [status, setStatus] = useState<WebSocketStatus>(
		WebSocketStatus.DISCONNECTED,
	);
	const [error, setError] = useState<WebSocketError | null>(null);
	const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);

	const clearTimeouts = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
	}, []);

	const handleError = useCallback(
		(errorData: WebSocketError) => {
			if (!isMountedRef.current) return;

			setError(errorData);
			setStatus(WebSocketStatus.ERROR);
			onError?.(errorData);
		},
		[onError],
	);

	const closeSocket = useCallback(() => {
		if (socketRef.current) {
			socketRef.current.close();
			socketRef.current = null;
		}
		clearTimeouts();
	}, [clearTimeouts]);

	const scheduleReconnection = useCallback(() => {
		if (!isMountedRef.current) return;

		if (reconnectAttemptRef.current >= reconnectAttempts) {
			setStatus(WebSocketStatus.DISCONNECTED);
			handleError({
				type: "connection",
				message: `Failed to reconnect after ${reconnectAttempts} attempts`,
				reconnectAttempt: reconnectAttemptRef.current,
			});
			return;
		}

		reconnectAttemptRef.current += 1;
		setReconnectAttempt(reconnectAttemptRef.current); // Update state for UI
		setStatus(WebSocketStatus.RECONNECTING);

		// Always use the reconnection interval for any reconnection attempt
		reconnectTimeoutRef.current = setTimeout(() => {
			if (isMountedRef.current) {
				connect();
			}
		}, reconnectInterval);
	}, [reconnectAttempts, reconnectInterval, handleError]);

	const connect = useCallback(() => {
		if (!isMountedRef.current) return;

		closeSocket();
		setError(null);

		const isReconnection = reconnectAttemptRef.current > 0;
		setStatus(
			isReconnection
				? WebSocketStatus.RECONNECTING
				: WebSocketStatus.CONNECTING,
		);

		try {
			const socket = new WebSocket(url, protocols);
			socketRef.current = socket;

			// Set connection timeout
			timeoutRef.current = setTimeout(() => {
				if (socket.readyState === WebSocket.CONNECTING) {
					socket.close();
					// Use centralized reconnection for timeout errors
					onError?.({
						type: "timeout",
						message: `Connection timeout after ${timeout}ms`,
						reconnectAttempt: reconnectAttemptRef.current,
					});
					scheduleReconnection();
				}
			}, timeout);

			socket.onopen = (event) => {
				if (!isMountedRef.current) return;

				clearTimeouts();
				reconnectAttemptRef.current = 0;
				setReconnectAttempt(0); // Reset state for UI
				setStatus(WebSocketStatus.CONNECTED);
				setError(null);
				onOpen?.(event);
			};

			socket.onmessage = (event) => {
				if (!isMountedRef.current) return;
				onMessage?.(event);
			};

			socket.onerror = (event) => {
				if (!isMountedRef.current) return;
				// Don't handle error here immediately - let onclose handle reconnection
				// This prevents duplicate error handling and rapid reconnection attempts
				console.warn(
					"WebSocket error occurred, will handle in onclose:",
					event,
				);
			};

			socket.onclose = (event) => {
				if (!isMountedRef.current) return;

				clearTimeouts();
				onClose?.(event);

				// Don't reconnect if it was a clean close
				if (event.wasClean) {
					setStatus(WebSocketStatus.DISCONNECTED);
					return;
				}

				// Report the connection error
				if (onError) {
					onError({
						type: "connection",
						message: "WebSocket connection error",
						reconnectAttempt: reconnectAttemptRef.current,
					});
				}

				// Use centralized reconnection scheduling
				scheduleReconnection();
			};
		} catch (err) {
			// Use centralized reconnection for connection creation errors
			onError?.({
				type: "connection",
				message:
					err instanceof Error
						? err.message
						: "Failed to create WebSocket connection",
				reconnectAttempt: reconnectAttemptRef.current,
			});
			scheduleReconnection();
		}
	}, [
		url,
		protocols,
		timeout,
		reconnectAttempts,
		reconnectInterval,
		onMessage,
		onError,
		onOpen,
		onClose,
		closeSocket,
		scheduleReconnection,
	]);

	const disconnect = useCallback(() => {
		reconnectAttemptRef.current = reconnectAttempts; // Prevent reconnection
		closeSocket();
		setStatus(WebSocketStatus.DISCONNECTED);
		setError(null);
	}, [reconnectAttempts, closeSocket]);

	const sendMessage = useCallback(
		(data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
			if (
				socketRef.current &&
				socketRef.current.readyState === WebSocket.OPEN
			) {
				try {
					socketRef.current.send(data);
				} catch (err) {
					handleError({
						type: "message",
						message:
							err instanceof Error
								? err.message
								: "Failed to send message",
					});
				}
			} else {
				handleError({
					type: "message",
					message: "WebSocket is not connected",
				});
			}
		},
		[handleError],
	);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	// Auto-connect on mount with delay to handle strict mode
	useEffect(() => {
		isMountedRef.current = true; // Reset to true on mount

		// Small delay to handle React strict mode double mounting
		const connectTimer = setTimeout(() => {
			if (isMountedRef.current) {
				connect();
			}
		}, 100);

		return () => {
			isMountedRef.current = false;
			clearTimeout(connectTimer);
			closeSocket();
		};
	}, [url]); // Only depend on URL, not the functions

	const contextValue: WebSocketContextValue = {
		socket: socketRef.current,
		status,
		isConnected: status === WebSocketStatus.CONNECTED,
		isConnecting: status === WebSocketStatus.CONNECTING,
		isReconnecting: status === WebSocketStatus.RECONNECTING,
		error,
		reconnectAttempt: reconnectAttempt,
		maxReconnectAttempts: reconnectAttempts,
		sendMessage,
		connect,
		disconnect,
		clearError,
	};

	return (
		<WebSocketContextProvider value={contextValue}>
			<WebSocketStatusOverlay
				status={status}
				error={error}
				reconnectAttempt={reconnectAttempt}
				maxReconnectAttempts={reconnectAttempts}
			/>
			{status === WebSocketStatus.CONNECTED && children}
		</WebSocketContextProvider>
	);
};

// Status overlay component for displaying connection status
interface WebSocketStatusOverlayProps {
	status: WebSocketStatus;
	error: WebSocketError | null;
	reconnectAttempt: number;
	maxReconnectAttempts: number;
}

const WebSocketStatusOverlay: React.FC<WebSocketStatusOverlayProps> = ({
	status,
	error,
	reconnectAttempt,
	maxReconnectAttempts,
}) => {
	if (
		status === WebSocketStatus.CONNECTED ||
		status === WebSocketStatus.DISCONNECTED
	) {
		return null;
	}

	const getStatusMessage = () => {
		switch (status) {
			case WebSocketStatus.CONNECTING:
				return "Connecting...";
			case WebSocketStatus.RECONNECTING:
				return `Reconnecting... (${reconnectAttempt}/${maxReconnectAttempts})`;
			case WebSocketStatus.ERROR:
				return error?.message || "Connection error";
			default:
				return "Connecting...";
		}
	};

	const isError = status === WebSocketStatus.ERROR;

	return (
		<div className="inset-0 z-50 flex items-center justify-center bg-white/90">
			<div className="flex flex-col items-center gap-3">
				{isError ? (
					<div className="text-red-500 text-2xl">⚠️</div>
				) : (
					<Spinner size={24} />
				)}
				<p className="text-sm font-medium text-gray-700">
					{getStatusMessage()}
				</p>
			</div>
		</div>
	);
};

/**
 * Hook to access WebSocket context.
 *
 * @returns WebSocket context value
 */
export const useWebSocket = () => {
	return useWebSocketContext();
};

/**
 * Utility hook for easier message handling with typed messages.
 *
 * @returns WebSocket context with typed message sender
 */
export const useWebSocketMessages = <T = any,>() => {
	const { sendMessage, ...rest } = useWebSocket();

	const sendTypedMessage = useCallback(
		(message: T) => {
			sendMessage(JSON.stringify(message));
		},
		[sendMessage],
	);

	const sendRawMessage = useCallback(
		(message: string) => {
			sendMessage(message);
		},
		[sendMessage],
	);

	return {
		...rest,
		sendMessage: sendRawMessage,
		sendTypedMessage,
		sendRawMessage,
	};
};

// Export types for external use
export type { WebSocketProviderProps, WebSocketContextValue };
