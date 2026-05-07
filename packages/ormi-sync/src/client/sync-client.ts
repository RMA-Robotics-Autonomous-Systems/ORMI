/**
 * SyncClient — main-thread postMessage bridge to the DedicatedWorker.
 *
 * Responsibilities:
 *  - Owns the Worker instance
 *  - Buffers outbound messages until WORKER_READY is received
 *  - Exposes request/response helpers for LOCAL_READ, LOCAL_WRITE_RESULT
 *  - Maintains the in-memory pending-create registry
 *  - Triggers startup replay after _ready resolves
 *  - Propagates TEMP_ID_RESOLVED events to the SyncEventBus
 */

import type {
	Action,
	TempId,
	WorkerInMessage,
	WorkerOutMessage,
} from "../types.js";
import { emitTempIdResolved } from "./sync-event-bus.js";

// ---------------------------------------------------------------------------
// SyncClient options
// ---------------------------------------------------------------------------

export interface SyncClientOptions {
	/**
	 * Headers injected into every fetch call made by the replay worker.
	 * Use for Authorization: Bearer tokens. Cookie-based auth needs no entry here.
	 */
	workerHeaders?: Record<string, string>;
	/** Maximum replay attempts per action before marking it permanently failed. Default: 3. */
	maxRetries?: number;
	/** Base delay in ms for exponential backoff between retries. Default: 1000. */
	backoffBase?: number;
}

// ---------------------------------------------------------------------------
// SyncClient
// ---------------------------------------------------------------------------

type MessageHandler = (msg: WorkerOutMessage) => void;
type RequestResolver = (result: unknown) => void;

export class SyncClient {
	private _worker: Worker;
	private _ready: Promise<void>;
	private _resolveReady!: () => void;
	private _pendingMessages: WorkerInMessage[] = [];
	private _mode: "persistent" | "memory-only" | null = null;

	/** Pending request resolvers keyed by requestId. */
	private _pendingRequests = new Map<string, RequestResolver>();

	/** In-memory pending-create registry: tempId → actionId */
	private _pendingCreates = new Map<TempId, string>();

	/** External message handlers registered via onMessage(). */
	private _handlers: MessageHandler[] = [];

	constructor(worker: Worker, options: SyncClientOptions = {}) {
		this._worker = worker;

		this._ready = new Promise<void>((resolve) => {
			this._resolveReady = resolve;
		});

		this._worker.addEventListener(
			"message",
			(event: MessageEvent<WorkerOutMessage>) => {
				this._handleMessage(event.data, options);
			},
		);

		if (options.workerHeaders) {
			// Will be queued in _pendingMessages until ready
			this._post({ type: "SET_HEADERS", headers: options.workerHeaders });
		}
	}

	// -------------------------------------------------------------------------
	// Static factory (async — re-hydrates pending creates before returning)
	// -------------------------------------------------------------------------

	/** Preferred construction path. Waits for worker ready + registry re-hydration. */
	static async init(
		worker: Worker,
		options: SyncClientOptions = {},
	): Promise<SyncClient> {
		const client = new SyncClient(worker, options);
		await client._ready;
		await client._rehydratePendingCreates();
		if (navigator.onLine) {
			client.triggerReplay();
		}
		return client;
	}

	// -------------------------------------------------------------------------
	// Storage mode
	// -------------------------------------------------------------------------

	get mode(): "persistent" | "memory-only" | null {
		return this._mode;
	}

	// -------------------------------------------------------------------------
	// Outbound message helpers
	// -------------------------------------------------------------------------

	/** Post a message to the worker. Queued until _ready if worker not yet initialised. */
	private _post(msg: WorkerInMessage): void {
		if (this._mode === null) {
			// Worker not ready yet — buffer
			this._pendingMessages.push(msg);
		} else {
			this._worker.postMessage(msg);
		}
	}

	postMessage(msg: WorkerInMessage): void {
		this._post(msg);
	}

	triggerReplay(): void {
		this._post({ type: "TRIGGER_REPLAY" });
	}

	setHeaders(headers: Record<string, string>): void {
		this._post({ type: "SET_HEADERS", headers });
	}

	// -------------------------------------------------------------------------
	// Request/response helpers
	// -------------------------------------------------------------------------

	/**
	 * Post a LOCAL_READ and await the LOCAL_READ_RESULT.
	 * Returns the raw result value from the worker.
	 */
	async read(
		resource: string,
		query: import("../types.js").LocalQuery,
	): Promise<unknown> {
		const requestId = crypto.randomUUID();
		return new Promise<unknown>((resolve) => {
			this._pendingRequests.set(requestId, resolve as RequestResolver);
			this._post({ type: "LOCAL_READ", resource, query, requestId });
		});
	}

	/**
	 * Post a LOCAL_WRITE and optionally await the LOCAL_WRITE_RESULT.
	 * When requestId is provided, waits for confirmation.
	 */
	async write(
		resource: string,
		record: unknown,
		opts: {
			isTemp?: boolean;
			primaryKey?: string;
			versionKey?: string | null;
			awaitConfirm?: boolean;
		} = {},
	): Promise<boolean> {
		if (!opts.awaitConfirm) {
			this._post({
				type: "LOCAL_WRITE",
				resource,
				record,
				isTemp: opts.isTemp,
				primaryKey: opts.primaryKey,
				versionKey: opts.versionKey,
			});
			return true;
		}
		const requestId = crypto.randomUUID();
		return new Promise<boolean>((resolve) => {
			this._pendingRequests.set(requestId, resolve as RequestResolver);
			this._post({
				type: "LOCAL_WRITE",
				resource,
				record,
				isTemp: opts.isTemp,
				primaryKey: opts.primaryKey,
				versionKey: opts.versionKey,
				requestId,
			});
		});
	}

	// -------------------------------------------------------------------------
	// Pending-create registry
	// -------------------------------------------------------------------------

	registerPendingCreate(tempId: TempId, actionId: string): void {
		this._pendingCreates.set(tempId, actionId);
	}

	resolvePendingCreate(tempId: TempId): void {
		this._pendingCreates.delete(tempId);
	}

	getPendingCreateId(tempId: TempId): string | undefined {
		return this._pendingCreates.get(tempId);
	}

	private async _rehydratePendingCreates(): Promise<void> {
		const requestId = crypto.randomUUID();
		const creates = await new Promise<
			Array<{ tempIdSlot: TempId; actionId: string }>
		>((resolve) => {
			this._pendingRequests.set(requestId, resolve as RequestResolver);
			this._post({ type: "GET_PENDING_CREATES", requestId });
		});
		for (const { tempIdSlot, actionId } of creates) {
			this._pendingCreates.set(tempIdSlot, actionId);
		}
	}

	// -------------------------------------------------------------------------
	// External message handlers
	// -------------------------------------------------------------------------

	onMessage(handler: MessageHandler): void {
		this._handlers.push(handler);
	}

	// -------------------------------------------------------------------------
	// Inbound message handler
	// -------------------------------------------------------------------------

	private _handleMessage(
		msg: WorkerOutMessage,
		_options: SyncClientOptions,
	): void {
		switch (msg.type) {
			case "WORKER_READY": {
				this._mode = msg.mode;
				// Flush buffered messages
				for (const pending of this._pendingMessages) {
					this._worker.postMessage(pending);
				}
				this._pendingMessages = [];
				this._resolveReady();
				break;
			}

			case "LOCAL_READ_RESULT": {
				const resolve = this._pendingRequests.get(msg.requestId);
				if (resolve) {
					this._pendingRequests.delete(msg.requestId);
					resolve(msg.result);
				}
				break;
			}

			case "LOCAL_WRITE_RESULT": {
				const resolve = this._pendingRequests.get(msg.requestId);
				if (resolve) {
					this._pendingRequests.delete(msg.requestId);
					resolve(msg.ok);
				}
				break;
			}

			case "PENDING_CREATES_RESULT": {
				const resolve = this._pendingRequests.get(msg.requestId);
				if (resolve) {
					this._pendingRequests.delete(msg.requestId);
					resolve(msg.creates);
				}
				break;
			}

			case "TEMP_ID_RESOLVED": {
				emitTempIdResolved(msg.tempId, msg.realId);
				// Also resolve the pending-create entry
				this.resolvePendingCreate(msg.tempId);
				break;
			}

			default:
				break;
		}

		// Dispatch to external handlers (CONFLICT, REPLAY_DONE, etc.)
		for (const handler of this._handlers) {
			handler(msg);
		}
	}
}
