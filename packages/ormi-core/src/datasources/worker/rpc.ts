/** Map of RPC method names to functions. */
export type RpcMethodMap = Record<string, (...args: any[]) => any>;
/** Map of RPC event names to payloads. */
export type RpcEventMap = Record<string, any>;

/** RPC request message. */
export interface RpcRequest<M extends RpcMethodMap = RpcMethodMap> {
	type: "rpc/request";
	id: string;
	method: keyof M & string;
	params: Parameters<M[keyof M]>;
}

/** RPC response message. */
export interface RpcResponse {
	type: "rpc/response";
	id: string;
	ok: boolean;
	result?: unknown;
	error?: RpcError;
}

/** RPC event message. */
export interface RpcEvent<E extends RpcEventMap = RpcEventMap> {
	type: "rpc/event";
	event: keyof E & string;
	payload: E[keyof E];
}

/** Union of RPC wire messages. */
export type RpcMessage<
	M extends RpcMethodMap = RpcMethodMap,
	E extends RpcEventMap = RpcEventMap,
> = RpcRequest<M> | RpcResponse | RpcEvent<E>;

/** RPC error payload. */
export interface RpcError {
	message: string;
	code?: string;
	data?: unknown;
}

/** RPC client interface. */
export interface RpcClient<M extends RpcMethodMap, E extends RpcEventMap> {
	call<K extends keyof M>(
		method: K,
		...params: Parameters<M[K]>
	): Promise<Awaited<ReturnType<M[K]>>>;
	onEvent<K extends keyof E>(
		event: K,
		handler: (payload: E[K]) => void,
	): () => void;
	dispose(): void;
}

/** RPC server interface. */
export interface RpcServer<E extends RpcEventMap> {
	emit<K extends keyof E>(
		event: K,
		payload: E[K],
		transfer?: Transferable[],
	): void;
	dispose(): void;
}

/** Minimal message target used by the RPC client/server. */
export interface RpcTarget {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	addEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void;
	removeEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void;
}

/**
 * Create an RPC client bound to a message target.
 * @param target - Message target (worker or window).
 * @returns RPC client instance.
 */
export function createRpcClient<M extends RpcMethodMap, E extends RpcEventMap>(
	target: RpcTarget,
): RpcClient<M, E> {
	let counter = 0;
	const pending = new Map<
		string,
		{ resolve: (value: any) => void; reject: (reason?: any) => void }
	>();
	const eventHandlers = new Map<
		keyof E & string,
		Set<(payload: E[keyof E]) => void>
	>();

	const onMessage = (event: MessageEvent) => {
		const message = event.data as RpcMessage<M, E>;

		if (!message || typeof message !== "object") return;

		if (message.type === "rpc/response") {
			const entry = pending.get(message.id);
			if (!entry) return;
			pending.delete(message.id);

			if (message.ok) {
				entry.resolve(message.result);
			} else {
				const error = message.error ?? { message: "Unknown RPC error" };
				entry.reject(error);
			}
			return;
		}

		if (message.type === "rpc/event") {
			const handlers = eventHandlers.get(
				message.event as keyof E & string,
			);
			if (!handlers) return;
			handlers.forEach((handler) => handler(message.payload));
		}
	};

	target.addEventListener("message", onMessage);

	const call: RpcClient<M, E>["call"] = (method, ...params) => {
		const id = `${Date.now()}-${counter++}`;
		const request: RpcRequest<M> = {
			type: "rpc/request",
			id,
			method: method as keyof M & string,
			params,
		};

		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			target.postMessage(request);
		}) as Promise<Awaited<ReturnType<M[typeof method]>>>;
	};

	const onEvent: RpcClient<M, E>["onEvent"] = (event, handler) => {
		const key = event as keyof E & string;
		const current = eventHandlers.get(key) ?? new Set();
		current.add(handler as (payload: E[keyof E]) => void);
		eventHandlers.set(key, current);

		return () => {
			const handlers = eventHandlers.get(key);
			if (!handlers) return;
			handlers.delete(handler as (payload: E[keyof E]) => void);
			if (handlers.size === 0) {
				eventHandlers.delete(key);
			}
		};
	};

	const dispose = () => {
		target.removeEventListener("message", onMessage);
		pending.clear();
		eventHandlers.clear();
	};

	return { call, onEvent, dispose };
}

/**
 * Create an RPC server bound to a message target.
 * @param target - Message target (worker or window).
 * @param methods - Method map exposed by the server.
 * @returns RPC server instance.
 */
export function createRpcServer<M extends RpcMethodMap, E extends RpcEventMap>(
	target: RpcTarget,
	methods: M,
): RpcServer<E> {
	const onMessage = async (event: MessageEvent) => {
		const message = event.data as RpcMessage<M, E>;
		if (!message || typeof message !== "object") return;
		if (message.type !== "rpc/request") return;

		const { id, method, params } = message;
		const handler = methods[method];

		if (!handler) {
			const response: RpcResponse = {
				type: "rpc/response",
				id,
				ok: false,
				error: {
					message: `Unknown RPC method: ${String(method)}`,
					code: "RPC_METHOD_NOT_FOUND",
				},
			};
			target.postMessage(response);
			return;
		}

		try {
			const result = await handler(...(params as Parameters<M[keyof M]>));
			const response: RpcResponse = {
				type: "rpc/response",
				id,
				ok: true,
				result,
			};
			target.postMessage(response);
		} catch (error) {
			const err =
				error instanceof Error ? error : new Error(String(error));
			const response: RpcResponse = {
				type: "rpc/response",
				id,
				ok: false,
				error: {
					message: err.message,
					code: "RPC_METHOD_ERROR",
				},
			};
			target.postMessage(response);
		}
	};

	target.addEventListener("message", onMessage);

	const emit: RpcServer<E>["emit"] = (event, payload, transfer) => {
		const message: RpcEvent<E> = {
			type: "rpc/event",
			event: event as keyof E & string,
			payload,
		};
		target.postMessage(message, transfer ?? []);
	};

	const dispose = () => {
		target.removeEventListener("message", onMessage);
	};

	return { emit, dispose };
}
