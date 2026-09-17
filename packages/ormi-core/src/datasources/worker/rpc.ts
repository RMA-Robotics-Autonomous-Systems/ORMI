import { metrics } from "@workspace/utils";

/**
 * RPC client metric ids, registered once per JS runtime (cold path).
 * `rpc.calls` counts every outgoing request; `rpc.inflight` is a gauge of
 * currently pending requests; `rpc.rttMs` samples round-trip times while the
 * heavy tier is on. This module is shared by the main thread and workers —
 * each runtime has its own metrics singleton, and a worker's registry simply
 * has no reporter attached, so the writes are harmless there.
 */
const rpcCallsId = metrics.counter("rpc.calls");
const rpcInflightId = metrics.counter("rpc.inflight");
const rpcRttRing = metrics.ring("rpc.rttMs");

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
		{
			resolve: (value: any) => void;
			reject: (reason?: any) => void;
			/** Heavy-tier RTT start time (`Date.now()`); 0 when not sampling. */
			t0: number;
		}
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
			metrics.set(rpcInflightId, pending.size);
			if (entry.t0) metrics.observe(rpcRttRing, Date.now() - entry.t0);

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

		metrics.add(rpcCallsId);
		const t0 = metrics.heavy ? Date.now() : 0;

		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject, t0 });
			metrics.set(rpcInflightId, pending.size);
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
		// Reject, never drop. A dropped pending entry is a promise that can
		// never settle, and callers await these inside hooks that are applied
		// sequentially across every datasource — `AVAILABLE_TOPICS` is one — so
		// a single never-settling call stalls the whole chain for as long as the
		// page is open, with nothing logged and no way back. A rejection is
		// something the caller can see and fall back from.
		const abandoned = Array.from(pending.values());
		pending.clear();
		metrics.set(rpcInflightId, pending.size);
		for (const entry of abandoned) {
			entry.reject(new Error("RPC client disposed"));
		}
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

/**
 * Resolve `promise`, or give up after `ms` and resolve `fallback` instead.
 *
 * For calls whose blast radius is wider than the datasource making them.
 * `AVAILABLE_TOPICS` is the case that matters: it is applied sequentially
 * across every configured datasource with no per-contributor isolation, so a
 * worker that never answers — one that died before `init`, for instance, which
 * is invisible in development and only happens in a production build — leaves
 * the whole topic list empty for every datasource, with nothing logged.
 * Bounding the wait turns that into "this datasource lists nothing", which is
 * both true and local.
 *
 * Nothing is cancelled: the underlying call is left to settle (or not) on its
 * own, because an RPC request already sent cannot be recalled. A caller that
 * polls simply asks again.
 *
 * @param promise - The call to bound.
 * @param ms - How long to wait before giving up.
 * @param fallback - Value to resolve with on timeout.
 * @returns The call's value, or `fallback`.
 */
export function withRpcTimeout<T>(
	promise: Promise<T>,
	ms: number,
	fallback: T,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => resolve(fallback), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}
