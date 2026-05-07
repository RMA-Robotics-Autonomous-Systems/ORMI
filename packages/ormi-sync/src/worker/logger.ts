import type { Action, WorkerInMessage } from "../types.js";

const PREFIX = "[ormi-sync worker]";

export function log(message: string, details?: unknown): void {
	if (details === undefined) {
		console.info(PREFIX, message);
		return;
	}
	console.info(PREFIX, message, details);
}

export function warn(message: string, details?: unknown): void {
	if (details === undefined) {
		console.warn(PREFIX, message);
		return;
	}
	console.warn(PREFIX, message, details);
}

export function error(message: string, details?: unknown): void {
	if (details === undefined) {
		console.error(PREFIX, message);
		return;
	}
	console.error(PREFIX, message, details);
}

export function summarizeAction(action: Action): Record<string, unknown> {
	return {
		id: action.id,
		resource: action.resource,
		method: action.method,
		dependsOn: action.dependsOn,
		tempIdSlot: action.tempIdSlot,
		status: action.status,
	};
}

export function summarizeMessage(
	message: WorkerInMessage,
): Record<string, unknown> {
	switch (message.type) {
		case "ENQUEUE_ACTION":
			return {
				type: message.type,
				action: summarizeAction(message.action),
			};
		case "LOCAL_READ":
			return {
				type: message.type,
				resource: message.resource,
				query: message.query,
				requestId: message.requestId,
			};
		case "LOCAL_WRITE":
			return {
				type: message.type,
				resource: message.resource,
				requestId: message.requestId,
				isTemp: message.isTemp,
			};
		case "LOCAL_MERGE":
			return {
				type: message.type,
				resource: message.resource,
				id: message.id,
				requestId: message.requestId,
			};
		case "LOCAL_DELETE":
			return {
				type: message.type,
				resource: message.resource,
				id: message.id,
				requestId: message.requestId,
			};
		case "GET_PENDING_CREATES":
			return { type: message.type, requestId: message.requestId };
		case "SET_HEADERS":
			return {
				type: message.type,
				headers: Object.keys(message.headers),
			};
		case "RESOLVE_CONFLICT":
			return {
				type: message.type,
				actionId: message.actionId,
				resolution: message.resolution,
			};
		case "TRIGGER_REPLAY":
			return { type: message.type };
	}
}
