import React from "react";
import { ReadyState } from "react-use-websocket";
import { Spinner } from "@workspace/ui/components/spinner";

interface WebSocketStatusOverlayProps {
	readyState: ReadyState;
	reconnectAttempt?: number;
	maxReconnectAttempts?: number;
	error?: string | null;
	isVisible?: boolean;
}

const WebSocketStatusOverlay: React.FC<WebSocketStatusOverlayProps> = ({
	readyState,
	reconnectAttempt = 0,
	maxReconnectAttempts = 10,
	error,
	isVisible = true,
}) => {
	if (!isVisible || readyState === ReadyState.OPEN) {
		return null;
	}

	const getStatusMessage = () => {
		switch (readyState) {
			case ReadyState.CONNECTING:
				if (reconnectAttempt > 0) {
					return `Reconnecting... (${reconnectAttempt}/${maxReconnectAttempts})`;
				}
				return "Connecting...";
			case ReadyState.CLOSING:
				return "Disconnecting...";
			case ReadyState.CLOSED:
				if (reconnectAttempt > 0) {
					return `Connection lost. Reconnecting... (${reconnectAttempt}/${maxReconnectAttempts})`;
				}
				return "Disconnected from server";
			case ReadyState.UNINSTANTIATED:
				return "Initializing connection...";
			default:
				return error || "Connection error";
		}
	};

	const isError = error !== null && error !== undefined;

	return (
		<div className="inset-0 z-50 flex items-center justify-center bg-background/90">
			<div className="flex flex-col items-center gap-3">
				{isError ? (
					<div className="text-destructive text-2xl">⚠️</div>
				) : (
					<Spinner size={24} />
				)}
				<p className="text-sm font-medium text-foreground">
					{getStatusMessage()}
				</p>
				{isError && error && (
					<p className="text-xs text-destructive max-w-md text-center">
						{error}
					</p>
				)}
			</div>
		</div>
	);
};

export { WebSocketStatusOverlay };
export type { WebSocketStatusOverlayProps };
