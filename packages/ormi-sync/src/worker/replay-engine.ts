/**
 * Replay engine — runs inside the DedicatedWorker.
 *
 * Responsible for:
 *  - Temp-ID rewriting
 *  - Pre-flight conflict detection (local + remote)
 *  - Dispatching actions to the server via raw fetch
 *  - Updating local DB on success
 *  - Retry with exponential backoff
 *  - Marking permanent failures
 */

import type { Action, TempId } from "../types.js";
import { isTempId } from "../types.js";
import { upsert, findById, withDbLock } from "./local-db.js";
import { setStatus, setResolvedRealId } from "./action-queue.js";

// ---------------------------------------------------------------------------
// Config (injected by sync-worker at init)
// ---------------------------------------------------------------------------

let _workerHeaders: Record<string, string> = {};
let _maxRetries = 3;
let _backoffBase = 1000;

export function configureReplayEngine(opts: {
	workerHeaders: Record<string, string>;
	maxRetries: number;
	backoffBase: number;
}): void {
	_workerHeaders = opts.workerHeaders;
	_maxRetries = opts.maxRetries;
	_backoffBase = opts.backoffBase;
}

export function updateHeaders(headers: Record<string, string>): void {
	_workerHeaders = { ..._workerHeaders, ...headers };
}

// ---------------------------------------------------------------------------
// Replay result
// ---------------------------------------------------------------------------

export interface ReplayResult {
	resolved: number;
	failed: number;
	permanentFailures: Action[];
}

// ---------------------------------------------------------------------------
// Conflict resolution — the worker pauses until the main thread responds.
// We use a promise that sync-worker.ts resolves when it receives RESOLVE_CONFLICT.
// ---------------------------------------------------------------------------

type ConflictResolution = "keep-local" | "use-server";

let _pendingConflict: {
	resolve: (resolution: ConflictResolution) => void;
} | null = null;

export function resolveConflict(resolution: ConflictResolution): void {
	_pendingConflict?.resolve(resolution);
	_pendingConflict = null;
}

// ---------------------------------------------------------------------------
// Main replay entry point
// ---------------------------------------------------------------------------

/**
 * Run the replay loop over the provided (already sorted + collapsed) actions.
 * resolvedIds is pre-seeded by sync-worker.ts before calling runReplay.
 */
export async function runReplay(
	actions: Action[],
	resolvedIds: Map<TempId, string | number>,
	versionKey: string | null | undefined,
	primaryKey: string,
	onPostMessage: (msg: unknown) => void,
): Promise<ReplayResult> {
	let resolved = 0;
	let failed = 0;
	const permanentFailures: Action[] = [];

	// Track which action IDs have permanently failed so dependents are skipped
	const permanentFailedIds = new Set<string>();

	for (const action of actions) {
		// Skip if any dependency permanently failed
		if (action.dependsOn.some((d) => permanentFailedIds.has(d))) {
			await setStatus(action.id, "failed");
			permanentFailedIds.add(action.id);
			permanentFailures.push(action);
			failed++;
			continue;
		}

		await setStatus(action.id, "replaying");

		// Rewrite TempId references
		const rewrittenPayload = rewriteReferences(action.payload, resolvedIds);
		const rewrittenParams = rewriteReferences(
			action.urlParams ?? {},
			resolvedIds,
		) as Record<string, string | number>;

		// Resolve URL
		let url: string;
		try {
			url = resolveUrl(action.urlTemplate, rewrittenParams);
		} catch (err) {
			console.error(
				`ormi-sync: URL resolution failed for action ${action.id}:`,
				err,
			);
			await setStatus(action.id, "failed");
			permanentFailedIds.add(action.id);
			permanentFailures.push(action);
			failed++;
			continue;
		}

		// Pre-flight conflict check (update/patch only)
		const effectiveVk = versionKey !== undefined ? versionKey : "updatedAt";
		if (
			action.baseVersion &&
			effectiveVk !== null &&
			(action.method === "update" || action.method === "patch")
		) {
			const baseVer = (action.baseVersion as Record<string, unknown>)[
				effectiveVk
			];

			// Check local DB version first
			const localRecord = await findById(
				action.resource,
				url.split("/").pop() ?? "",
			);
			const localVer =
				localRecord && typeof localRecord === "object"
					? (localRecord as Record<string, unknown>)[effectiveVk]
					: undefined;

			if (localVer !== baseVer) {
				// Local diverged — conflict without network round-trip
				const conflictResolution = await pauseForConflict(
					action,
					null,
					localRecord,
					onPostMessage,
				);
				if (
					await handleConflictResolution(
						conflictResolution,
						action,
						null,
						action.resource,
						primaryKey,
						effectiveVk,
					)
				) {
					await setStatus(action.id, "done");
					resolved++;
					continue;
				}
				// keep-local: fall through to dispatch
			} else {
				// Check server version
				const serverRecord = await fetchServerRecord(url);
				if (serverRecord) {
					const serverVer = (serverRecord as Record<string, unknown>)[
						effectiveVk
					];
					if (serverVer !== baseVer) {
						const conflictResolution = await pauseForConflict(
							action,
							serverRecord,
							localRecord,
							onPostMessage,
						);
						if (
							await handleConflictResolution(
								conflictResolution,
								action,
								serverRecord,
								action.resource,
								primaryKey,
								effectiveVk,
							)
						) {
							await setStatus(action.id, "done");
							resolved++;
							continue;
						}
						// keep-local: fall through to dispatch
					}
				}
			}
		}

		// Dispatch with retry
		const dispatchResult = await dispatchWithRetry(
			action,
			url,
			rewrittenPayload,
		);

		if (dispatchResult.ok) {
			const serverRecord = dispatchResult.data as Record<string, unknown>;

			// Write to local DB
			await upsert(action.resource, serverRecord, {
				primaryKey,
				versionKey,
			});

			// Resolve tempIdSlot
			if (action.tempIdSlot) {
				const realId = serverRecord[primaryKey] as string | number;
				resolvedIds.set(action.tempIdSlot, realId);
				await setResolvedRealId(action.id, realId);
				onPostMessage({
					type: "TEMP_ID_RESOLVED",
					tempId: action.tempIdSlot,
					realId,
				});
			}

			await setStatus(action.id, "done");
			resolved++;
		} else {
			await setStatus(action.id, "failed");
			permanentFailedIds.add(action.id);
			permanentFailures.push(action);
			failed++;
		}
	}

	return { resolved, failed, permanentFailures };
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchServerRecord(url: string): Promise<unknown | null> {
	try {
		const res = await fetch(url, {
			method: "GET",
			headers: { ..._workerHeaders },
		});
		if (!res.ok) return null;
		return (await res.json()) as unknown;
	} catch {
		return null;
	}
}

interface DispatchResult {
	ok: boolean;
	data?: unknown;
	status?: number;
}

async function dispatchWithRetry(
	action: Action,
	url: string,
	payload: unknown,
): Promise<DispatchResult> {
	const httpMethod = actionMethodToHttp(action.method);
	let attempt = 0;

	while (attempt <= _maxRetries) {
		if (attempt > 0) {
			await sleep(_backoffBase * Math.pow(2, attempt - 1));
		}
		attempt++;

		let res: Response;
		try {
			res = await fetch(url, {
				method: httpMethod,
				headers: {
					"Content-Type": "application/json",
					"Idempotency-Key": action.id,
					..._workerHeaders,
				},
				body:
					payload !== undefined ? JSON.stringify(payload) : undefined,
			});
		} catch {
			// Network error — retry if retries remain
			if (attempt > _maxRetries) {
				return { ok: false };
			}
			continue;
		}

		if (res.ok) {
			let data: unknown = null;
			try {
				data = await res.json();
			} catch {
				// 204 No Content or similar — fine
			}
			return { ok: true, data: data ?? {} };
		}

		// Permanent 4xx (not 409)
		if (res.status >= 400 && res.status < 500 && res.status !== 409) {
			return { ok: false, status: res.status };
		}

		// 409 conflict — caller handles separately (shouldn't reach here normally)
		if (res.status === 409) {
			return { ok: false, status: 409 };
		}

		// Transient — retry
		if (attempt > _maxRetries) {
			return { ok: false, status: res.status };
		}
	}

	return { ok: false };
}

function actionMethodToHttp(method: Action["method"]): string {
	switch (method) {
		case "create":
			return "POST";
		case "update":
			return "PUT";
		case "patch":
			return "PATCH";
		case "delete":
			return "DELETE";
		case "reorder":
			return "PATCH";
	}
}

// ---------------------------------------------------------------------------
// Conflict handling
// ---------------------------------------------------------------------------

async function pauseForConflict(
	action: Action,
	serverValue: unknown,
	localValue: unknown,
	onPostMessage: (msg: unknown) => void,
): Promise<ConflictResolution> {
	await setStatus(action.id, "conflict");
	onPostMessage({
		type: "CONFLICT",
		action,
		serverValue,
		localValue,
	});
	return new Promise<ConflictResolution>((resolve) => {
		_pendingConflict = { resolve };
	});
}

/**
 * Returns true if replay should skip dispatching (use-server resolution).
 * Returns false if dispatch should proceed (keep-local resolution).
 */
async function handleConflictResolution(
	resolution: ConflictResolution,
	action: Action,
	serverRecord: unknown,
	resource: string,
	primaryKey: string,
	versionKey: string | null,
): Promise<boolean> {
	if (resolution === "use-server") {
		if (serverRecord) {
			await upsert(resource, serverRecord, { primaryKey, versionKey });
		}
		return true; // skip dispatch
	}
	// keep-local: reset to pending and fall through to dispatch
	await setStatus(action.id, "pending");
	return false;
}

// ---------------------------------------------------------------------------
// TempId rewrite
// ---------------------------------------------------------------------------

export function rewriteReferences(
	value: unknown,
	map: Map<TempId, string | number>,
): unknown {
	if (typeof value === "string" && isTempId(value)) {
		return map.get(value) ?? value;
	}
	if (Array.isArray(value)) {
		return value.map((v) => rewriteReferences(v, map));
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => [
				k,
				rewriteReferences(v, map),
			]),
		);
	}
	return value;
}

// ---------------------------------------------------------------------------
// URL resolution
// ---------------------------------------------------------------------------

export function resolveUrl(
	template: string,
	params: Record<string, string | number>,
): string {
	return template.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key: string) => {
		if (!(key in params))
			throw new Error(`ormi-sync: Unresolved URL param: ${key}`);
		return String(params[key]);
	});
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
