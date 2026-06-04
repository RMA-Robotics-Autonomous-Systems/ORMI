/**
 * withOffline — Proxy factory for offline-first API wrappers.
 *
 * Wraps any API object T and returns an identical T (zero consumer changes).
 * Routes calls to local PGlite or the network depending on connectivity and
 * caches successful server responses in the local DB.
 */

import type { ApiResult, Action, SyncConfig, TempId } from "../types.js";
import { isTempId, makeTempId } from "../types.js";
import type { SyncClient } from "../client/sync-client.js";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Re-export contract type for consumers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiObject = Record<string, (...args: any[]) => Promise<ApiResult<any>>>;

// ---------------------------------------------------------------------------
// Singleton SyncClient reference — set once at app startup
// ---------------------------------------------------------------------------

let _syncClient: SyncClient | null = null;

/** Must be called before any withOffline proxy is used. */
export function setSyncClient(client: SyncClient): void {
	_syncClient = client;
}

function getSyncClient(): SyncClient {
	if (!_syncClient) {
		throw new Error(
			"ormi-sync: SyncClient not initialised. Call setSyncClient() before using withOffline.",
		);
	}
	return _syncClient;
}

// ---------------------------------------------------------------------------
// Read method heuristic
// ---------------------------------------------------------------------------

function isReadMethod(name: string, config: SyncConfig): boolean {
	if (config.mutateMethods) return !config.mutateMethods.includes(name);
	return /^(get|load)/i.test(name);
}

// ---------------------------------------------------------------------------
// Transient failure detection
// ---------------------------------------------------------------------------

function isTransient(result: ApiResult<unknown>): boolean {
	// Network error already produces ok:false with no status — treated as transient
	if (result.ok) return false;
	const details = result.details as { status?: number } | undefined;
	if (!details?.status) return true; // no status = network failure
	const status = details.status;
	return status >= 500 || status === 429;
}

function isPermanent(result: ApiResult<unknown>): boolean {
	if (result.ok) return false;
	const details = result.details as { status?: number } | undefined;
	if (!details?.status) return false;
	const status = details.status;
	return status >= 400 && status < 500 && status !== 409;
}

// ---------------------------------------------------------------------------
// TempId scanner
// ---------------------------------------------------------------------------

function collectTempIds(value: unknown): TempId[] {
	if (isTempId(value)) return [value];
	if (Array.isArray(value)) return value.flatMap(collectTempIds);
	if (value && typeof value === "object") {
		return Object.values(value).flatMap(collectTempIds);
	}
	return [];
}

// ---------------------------------------------------------------------------
// Proxy factory
// ---------------------------------------------------------------------------

/**
 * Wrap an API object with offline-first interception.
 *
 * @param api   - Plain API object whose methods all return Promise<ApiResult<T>>.
 * @param config - Sync configuration: resource name, key fields, action descriptors.
 */
export function withOffline<T extends ApiObject>(
	api: T,
	config: SyncConfig,
): T {
	return new Proxy(api, {
		get(target, prop) {
			const original = target[prop as string];
			if (typeof original !== "function") return original;

			const methodName = prop as string;

			return async (...args: unknown[]): Promise<ApiResult<unknown>> => {
				// If the SyncClient hasn't initialised yet (startup window before
				// the worker sends WORKER_READY), fall through to the original API.
				// We are online during this window so data will be fresh, and the
				// response will be cached once the client is ready.
				if (!_syncClient) {
					return original(...args) as Promise<ApiResult<unknown>>;
				}

				const client = getSyncClient();
				const online = navigator.onLine;
				const pk = config.primaryKey ?? "id";
				const vk =
					config.versionKey !== undefined
						? config.versionKey
						: "updatedAt";

				// ------------------------------------------------------------------
				// READ path
				// ------------------------------------------------------------------
				if (isReadMethod(methodName, config)) {
					const readDescriptor = config.reads?.[methodName];
					if (!online) {
						const query = readDescriptor?.query?.(...args) ?? {};
						const rawResult = await client.read(
							config.resource,
							query,
						);
						const data = readDescriptor?.select
							? readDescriptor.select(rawResult, ...args)
							: rawResult;
						return { ok: true, data };
					}

					// Online read — call original, cache result
					const result = await (
						original as (
							...a: unknown[]
						) => Promise<ApiResult<unknown>>
					)(...args);
					if (result.ok) {
						const data = result.data;
						if (Array.isArray(data)) {
							for (const record of data) {
								const recordId =
									record && typeof record === "object"
										? (record as Record<string, unknown>)[
												pk
											]
										: undefined;

								if (
									readDescriptor?.mergeOnWrite &&
									recordId !== undefined
								) {
									client.postMessage({
										type: "LOCAL_MERGE",
										resource: config.resource,
										id: String(recordId),
										partial: record as Record<
											string,
											unknown
										>,
										primaryKey: pk,
										versionKey: vk,
									});
								} else {
									client.postMessage({
										type: "LOCAL_WRITE",
										resource: config.resource,
										record,
										primaryKey: pk,
										versionKey: vk,
									});
								}
							}
						} else if (data && typeof data === "object") {
							client.postMessage({
								type: "LOCAL_WRITE",
								resource: config.resource,
								record: data,
								primaryKey: pk,
								versionKey: vk,
							});
						}
					}
					return result;
				}

				// ------------------------------------------------------------------
				// MUTATION path — online first
				// ------------------------------------------------------------------

				if (online) {
					const result = await tryMutationOnline(
						original as (
							...a: unknown[]
						) => Promise<ApiResult<unknown>>,
						args,
						methodName,
						config,
						client,
					);
					if (result !== null) return result;
					// transient failure → fall through to offline path
				}

				// ------------------------------------------------------------------
				// OFFLINE path (or online transient fallback)
				// ------------------------------------------------------------------
				return offlineMutation(methodName, args, config, client);
			};
		},
	}) as T;
}

// ---------------------------------------------------------------------------
// Online mutation handler
// Returns null on transient failure (caller falls through to offline path).
// ---------------------------------------------------------------------------

async function tryMutationOnline(
	original: (...args: unknown[]) => Promise<ApiResult<unknown>>,
	args: unknown[],
	methodName: string,
	config: SyncConfig,
	client: SyncClient,
): Promise<ApiResult<unknown> | null> {
	const descriptor = config.actions?.[methodName];
	const pk = config.primaryKey ?? "id";
	const vk =
		config.versionKey !== undefined ? config.versionKey : "updatedAt";

	let result: ApiResult<unknown>;
	try {
		result = await original(...args);
	} catch {
		// Network error — treat as transient
		return null;
	}

	if (isPermanent(result)) return result;
	if (isTransient(result)) return null;

	if (!result.ok) return result;

	// Cache update based on descriptor method kind
	const actionMethod = descriptor?.actionMethod;

	if (actionMethod === "delete") {
		// Delete: LOCAL_DELETE
		const urlParams = descriptor?.urlParams?.(...args) ?? {};
		const id = urlParams[pk];
		if (id !== undefined) {
			client.postMessage({
				type: "LOCAL_DELETE",
				resource: config.resource,
				id: String(id),
				primaryKey: pk,
			});
		}
		return result;
	}

	if (actionMethod === "reorder") {
		// Reorder: only cache if response contains canonical records
		const data = result.data;
		if (Array.isArray(data)) {
			for (const record of data) {
				client.postMessage({
					type: "LOCAL_WRITE",
					resource: config.resource,
					record,
					primaryKey: pk,
					versionKey: vk,
				});
			}
		}
		return result;
	}

	// create / update / patch — cache if response is a canonical record
	const data = result.data;
	if (data && typeof data === "object" && !Array.isArray(data)) {
		if (actionMethod === "patch") {
			// patch may return partial — use LOCAL_MERGE
			const urlParams = descriptor?.urlParams?.(...args) ?? {};
			const id = urlParams[pk];
			if (id !== undefined) {
				client.postMessage({
					type: "LOCAL_MERGE",
					resource: config.resource,
					id: String(id),
					partial: data as Record<string, unknown>,
					primaryKey: pk,
					versionKey: vk,
				});
			}
		} else {
			client.postMessage({
				type: "LOCAL_WRITE",
				resource: config.resource,
				record: data,
				primaryKey: pk,
				versionKey: vk,
			});
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// Offline mutation handler
// ---------------------------------------------------------------------------

async function offlineMutation(
	methodName: string,
	args: unknown[],
	config: SyncConfig,
	client: SyncClient,
): Promise<ApiResult<unknown>> {
	const pk = config.primaryKey ?? "id";
	const vk =
		config.versionKey !== undefined ? config.versionKey : "updatedAt";
	const descriptor = config.actions?.[methodName];

	if (!descriptor) {
		return {
			ok: false,
			error: `Method "${methodName}" is not offline-enabled: no ActionDescriptor registered in SyncConfig.actions`,
		};
	}

	// Step 1–5: build action skeleton
	const action: Partial<Action> & Pick<Action, "dependsOn"> = {
		urlTemplate: descriptor.urlTemplate,
		urlParams: descriptor.urlParams?.(...args) ?? {},
		payload: descriptor.payload?.(...args),
		method: descriptor.actionMethod,
		dependsOn: [],
	};

	// Step 6–7: collect TempId references → dependsOn
	const tempIdsInPayload = collectTempIds(action.payload);
	const tempIdsInParams = collectTempIds(action.urlParams);
	const allTempIds = [...new Set([...tempIdsInPayload, ...tempIdsInParams])];

	for (const tid of allTempIds) {
		const creatorActionId = client.getPendingCreateId(tid);
		if (!creatorActionId) {
			throw new Error(
				`ormi-sync: TempId "${tid}" found in "${methodName}" args but no pending create is registered. ` +
					`Did you forget to await the create action?`,
			);
		}
		action.dependsOn.push(creatorActionId);
	}

	// Step 8: metadata
	action.id = uuidv4();
	action.resource = config.resource;
	action.enqueuedAt = Date.now();
	action.status = "pending";

	// Step 9: baseVersion (update/patch only)
	if (
		descriptor.actionMethod === "update" ||
		descriptor.actionMethod === "patch"
	) {
		const recordId = String(
			(action.urlParams as Record<string, unknown>)[pk],
		);
		const existing = await client.read(config.resource, {
			filter: { [pk]: recordId },
		});
		action.baseVersion = Array.isArray(existing) ? existing[0] : existing;
	}

	// Step 10: tempIdSlot for creates
	let tempId: TempId | undefined;
	if (descriptor.actionMethod === "create") {
		tempId = makeTempId();
		action.tempIdSlot = tempId;
	}

	// Step 11: enqueue
	client.postMessage({ type: "ENQUEUE_ACTION", action: action as Action });

	// Register pending create after enqueue
	if (tempId && action.id) {
		client.registerPendingCreate(tempId, action.id);
	}

	// Optimistic local write
	const optimisticStub = buildOptimisticStub(
		descriptor.actionMethod,
		args,
		action,
		config,
		tempId,
	);

	if (descriptor.actionMethod === "delete") {
		const urlParams = action.urlParams as Record<string, unknown>;
		const id = String(urlParams[pk]);
		client.postMessage({
			type: "LOCAL_DELETE",
			resource: config.resource,
			id,
			primaryKey: pk,
		});
	} else if (descriptor.actionMethod === "reorder") {
		const payload = action.payload;
		if (Array.isArray(payload)) {
			for (const element of payload as Array<Record<string, unknown>>) {
				const id = element[pk];
				if (id !== undefined) {
					client.postMessage({
						type: "LOCAL_MERGE",
						resource: config.resource,
						id: String(id),
						partial: element,
						primaryKey: pk,
						versionKey: vk,
					});
				}
			}
		}
	} else {
		client.postMessage({
			type: "LOCAL_WRITE",
			resource: config.resource,
			record: optimisticStub,
			isTemp: descriptor.actionMethod === "create",
			primaryKey: pk,
			versionKey: vk,
		});
	}

	return { ok: true, data: optimisticStub };
}

// ---------------------------------------------------------------------------
// Optimistic stub builder
// ---------------------------------------------------------------------------

function buildOptimisticStub(
	method: Action["method"],
	_args: unknown[],
	action: Partial<Action>,
	config: SyncConfig,
	tempId?: TempId,
): Record<string, unknown> {
	const pk = config.primaryKey ?? "id";

	if (method === "create") {
		// Minimal stub — schema-agnostic
		return { [pk]: tempId };
	}

	const urlParams = (action.urlParams ?? {}) as Record<string, unknown>;
	return { [pk]: urlParams[pk] };
}
