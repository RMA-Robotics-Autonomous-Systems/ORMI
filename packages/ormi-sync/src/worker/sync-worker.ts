/**
 * sync-worker.ts — DedicatedWorker entrypoint for ormi-sync.
 *
 * Owns:
 *  - PGlite initialisation (persistent or memory-only fallback)
 *  - Web Locks guard (withDbLock wraps every PGlite call via local-db)
 *  - Action queue persistence
 *  - TRIGGER_REPLAY: reset stuck actions, pre-seed resolvedIds, run replay loop
 *  - All LOCAL_READ / LOCAL_WRITE / LOCAL_MERGE / LOCAL_DELETE messages
 *
 * Bundle as a standalone ESM module worker:
 *   new Worker(new URL('./worker/sync-worker.ts', import.meta.url), { type: 'module' })
 */

import type {
	Action,
	TempId,
	WorkerInMessage,
	WorkerOutMessage,
} from "../types.js";
import {
	initDb,
	upsert,
	merge,
	remove,
	find,
	rawQuery,
	withDbLock,
} from "./local-db.js";
import {
	enqueue,
	loadPending,
	getPendingCreates,
	setQueryFn,
} from "./action-queue.js";
import {
	configureReplayEngine,
	updateHeaders,
	resolveConflict,
	runReplay,
} from "./replay-engine.js";
import { error as logError, log, summarizeMessage } from "./logger.js";

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let _workerHeaders: Record<string, string> = {};
const _maxRetries = 3;
const _backoffBase = 1000;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot(): Promise<void> {
	log("boot:start");
	const mode = await initDb();

	// Wire raw query accessor for action-queue (_sync_actions SQL access)
	setQueryFn((sql, params) => rawQuery(sql, params));

	// Configure replay engine
	configureReplayEngine({
		workerHeaders: _workerHeaders,
		maxRetries: _maxRetries,
		backoffBase: _backoffBase,
	});
	log("boot:ready", {
		mode,
		maxRetries: _maxRetries,
		backoffBase: _backoffBase,
	});

	postMessage({ type: "WORKER_READY", mode } satisfies WorkerOutMessage);
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
	const msg = event.data;
	log("message:received", summarizeMessage(msg));

	switch (msg.type) {
		case "SET_HEADERS": {
			_workerHeaders = { ..._workerHeaders, ...msg.headers };
			updateHeaders(msg.headers);
			log("headers:updated", { keys: Object.keys(msg.headers) });
			break;
		}

		case "ENQUEUE_ACTION": {
			await enqueue(msg.action);
			break;
		}

		case "LOCAL_READ": {
			try {
				const result = await find(msg.resource, msg.query, {
					primaryKey: "id",
				});
				log("db:read:done", {
					resource: msg.resource,
					requestId: msg.requestId,
					count: Array.isArray(result) ? result.length : 0,
				});
				postMessage({
					type: "LOCAL_READ_RESULT",
					requestId: msg.requestId,
					result,
				} satisfies WorkerOutMessage);
			} catch (err) {
				logError("db:read:error", err);
				postMessage({
					type: "LOCAL_READ_RESULT",
					requestId: msg.requestId,
					result: [],
				} satisfies WorkerOutMessage);
			}
			break;
		}

		case "LOCAL_WRITE": {
			try {
				await upsert(
					msg.resource,
					msg.record,
					{
						primaryKey: msg.primaryKey,
						versionKey: msg.versionKey,
					},
					msg.isTemp,
				);
				log("db:write:done", {
					resource: msg.resource,
					requestId: msg.requestId,
					isTemp: msg.isTemp,
				});
				if (msg.requestId) {
					postMessage({
						type: "LOCAL_WRITE_RESULT",
						requestId: msg.requestId,
						ok: true,
					} satisfies WorkerOutMessage);
				}
			} catch (err) {
				logError("db:write:error", err);
				if (msg.requestId) {
					postMessage({
						type: "LOCAL_WRITE_RESULT",
						requestId: msg.requestId,
						ok: false,
					} satisfies WorkerOutMessage);
				}
			}
			break;
		}

		case "LOCAL_MERGE": {
			try {
				await merge(msg.resource, msg.id, msg.partial, {
					primaryKey: msg.primaryKey,
					versionKey: msg.versionKey,
				});
				log("db:merge:done", {
					resource: msg.resource,
					id: msg.id,
					requestId: msg.requestId,
				});
				if (msg.requestId) {
					postMessage({
						type: "LOCAL_WRITE_RESULT",
						requestId: msg.requestId,
						ok: true,
					} satisfies WorkerOutMessage);
				}
			} catch (err) {
				logError("db:merge:error", err);
				if (msg.requestId) {
					postMessage({
						type: "LOCAL_WRITE_RESULT",
						requestId: msg.requestId,
						ok: false,
					} satisfies WorkerOutMessage);
				}
			}
			break;
		}

		case "LOCAL_DELETE": {
			try {
				await remove(msg.resource, msg.id);
				log("db:delete:done", {
					resource: msg.resource,
					id: msg.id,
					requestId: msg.requestId,
				});
				if (msg.requestId) {
					postMessage({
						type: "LOCAL_WRITE_RESULT",
						requestId: msg.requestId,
						ok: true,
					} satisfies WorkerOutMessage);
				}
			} catch (err) {
				logError("db:delete:error", err);
				if (msg.requestId) {
					postMessage({
						type: "LOCAL_WRITE_RESULT",
						requestId: msg.requestId,
						ok: false,
					} satisfies WorkerOutMessage);
				}
			}
			break;
		}

		case "GET_PENDING_CREATES": {
			const creates = await getPendingCreates();
			log("queue:pending-creates", { count: creates.length });
			postMessage({
				type: "PENDING_CREATES_RESULT",
				requestId: msg.requestId,
				creates,
			} satisfies WorkerOutMessage);
			break;
		}

		case "TRIGGER_REPLAY": {
			await handleTriggerReplay();
			break;
		}

		case "RESOLVE_CONFLICT": {
			resolveConflict(msg.resolution);
			log("conflict:resolved", {
				actionId: msg.actionId,
				resolution: msg.resolution,
			});
			break;
		}
	}
};

// ---------------------------------------------------------------------------
// TRIGGER_REPLAY handler
// ---------------------------------------------------------------------------

async function handleTriggerReplay(): Promise<void> {
	log("replay:start");
	// 1. Reset stuck actions from a previous interrupted session.
	await withDbLock(() =>
		rawQuery(
			"UPDATE _sync_actions SET status = 'pending' WHERE status IN ('replaying', 'conflict')",
		),
	);

	// 2. Pre-seed resolvedIds from done creates whose dependents are still pending.
	const resolvedIds = new Map<TempId, string | number>();

	const { rows: doneCreates } = await withDbLock(() =>
		rawQuery(`
			SELECT a.id AS "actionId",
			       a.temp_id_slot AS "tempIdSlot",
			       a.resolved_real_id AS "resolvedRealId"
			FROM _sync_actions a
			WHERE a.status = 'done'
			  AND a.temp_id_slot IS NOT NULL
			  AND a.resolved_real_id IS NOT NULL
		`),
	);

	if ((doneCreates as unknown[]).length > 0) {
		const { rows: pendingRows } = await withDbLock(() =>
			rawQuery(
				"SELECT depends_on FROM _sync_actions WHERE status = 'pending'",
			),
		);
		const neededActionIds = new Set(
			(pendingRows as Array<{ depends_on: string }>).flatMap(
				(r) => JSON.parse(r.depends_on) as string[],
			),
		);
		for (const row of doneCreates as Array<{
			actionId: string;
			tempIdSlot: string;
			resolvedRealId: string;
		}>) {
			if (neededActionIds.has(row.actionId)) {
				resolvedIds.set(row.tempIdSlot as TempId, row.resolvedRealId);
			}
		}
	}
	log("replay:resolved-ids-preseeded", {
		count: resolvedIds.size,
		fromDoneCreates: (doneCreates as unknown[]).length,
	});

	// 3. Short-circuit if nothing to replay.
	const { rows: countRows } = await withDbLock(() =>
		rawQuery(
			"SELECT COUNT(*) AS n FROM _sync_actions WHERE status = 'pending'",
		),
	);
	const count = Number((countRows as Array<{ n: number }>)[0]?.n ?? 0);
	if (count === 0) {
		log("replay:skipped", { reason: "queue-empty" });
		postMessage({
			type: "REPLAY_DONE",
			resolved: 0,
			failed: 0,
			permanentFailures: [],
		} satisfies WorkerOutMessage);
		return;
	}

	// 4. Load, sort, and collapse pending actions.
	const actions: Action[] = await loadPending();
	log("replay:loaded-actions", {
		pendingCount: count,
		replayCount: actions.length,
	});

	// 5. Run replay.
	const result = await runReplay(
		actions,
		resolvedIds,
		/* versionKey */ "updatedAt",
		/* primaryKey */ "id",
		(msg) => postMessage(msg as WorkerOutMessage),
	);
	log("replay:done", result);

	postMessage({
		type: "REPLAY_DONE",
		resolved: result.resolved,
		failed: result.failed,
		permanentFailures: result.permanentFailures,
	} satisfies WorkerOutMessage);
}

// Kick off boot immediately on worker instantiation.
boot().catch((err: unknown) => {
	logError("boot:error", err);
});
