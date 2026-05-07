/**
 * Action queue for ormi-sync.
 *
 * Handles:
 *  - Persisting actions to _sync_actions (runs inside the DedicatedWorker)
 *  - Loading pending actions for replay
 *  - Topological sort (Kahn's BFS algorithm)
 *  - Collapse optimisation (no-op CREATE+DELETE pairs)
 */

import type { Action, TempId } from "../types.js";
import { withDbLock } from "./local-db.js";
import { log, summarizeAction, warn } from "./logger.js";

// ---------------------------------------------------------------------------
// Type for a raw _sync_actions row from the DB
// ---------------------------------------------------------------------------

interface ActionRow {
	id: string;
	resource: string;
	method: string;
	payload: string | null;
	url_template: string;
	url_params: string | null;
	depends_on: string;
	temp_id_slot: string | null;
	resolved_real_id: string | null;
	base_version: string | null;
	enqueued_at: string | number;
	status: string;
}

// We need the PGlite instance to run queries. Import the internal db accessor.
// local-db.ts keeps `db` private; expose a minimal query helper here via the
// withDbLock wrapper that already imports the module.
// Instead, we re-export by accepting a query function injected at module-level
// by sync-worker.ts after initDb() succeeds.

let _query:
	| ((sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>)
	| null = null;

/** Called once by sync-worker.ts after PGlite is ready. */
export function setQueryFn(
	fn: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>,
): void {
	_query = fn;
}

function query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
	if (!_query) throw new Error("action-queue: query fn not initialised");
	return _query(sql, params);
}

// ---------------------------------------------------------------------------
// Row ↔ Action serialisation
// ---------------------------------------------------------------------------

function rowToAction(row: ActionRow): Action {
	return {
		id: row.id,
		resource: row.resource,
		method: row.method as Action["method"],
		payload: row.payload !== null ? JSON.parse(row.payload) : undefined,
		urlTemplate: row.url_template,
		urlParams: row.url_params ? JSON.parse(row.url_params) : undefined,
		dependsOn: JSON.parse(row.depends_on) as string[],
		tempIdSlot: row.temp_id_slot ? (row.temp_id_slot as TempId) : undefined,
		baseVersion: row.base_version
			? JSON.parse(row.base_version)
			: undefined,
		enqueuedAt: Number(row.enqueued_at),
		status: row.status as Action["status"],
	};
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

/** Persist a new action to _sync_actions. */
export async function enqueue(action: Action): Promise<void> {
	await withDbLock(() =>
		query(
			`INSERT INTO _sync_actions
        (id, resource, method, payload, url_template, url_params,
         depends_on, temp_id_slot, base_version, enqueued_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			[
				action.id,
				action.resource,
				action.method,
				action.payload !== undefined
					? JSON.stringify(action.payload)
					: null,
				action.urlTemplate,
				action.urlParams ? JSON.stringify(action.urlParams) : null,
				JSON.stringify(action.dependsOn),
				action.tempIdSlot ?? null,
				action.baseVersion !== undefined
					? JSON.stringify(action.baseVersion)
					: null,
				action.enqueuedAt,
				action.status,
			],
		),
	);
	log("queue:enqueue", summarizeAction(action));
}

// ---------------------------------------------------------------------------
// Load pending
// ---------------------------------------------------------------------------

/** Load all pending actions and return them in topological order. */
export async function loadPending(): Promise<Action[]> {
	const { rows } = await withDbLock(() =>
		query(
			`SELECT * FROM _sync_actions WHERE status = 'pending' ORDER BY enqueued_at ASC`,
		),
	);
	const actions = (rows as ActionRow[]).map(rowToAction);
	const sorted = topologicalSort(actions);
	const collapsed = collapse(sorted);
	log("queue:load-pending", {
		loaded: actions.length,
		sorted: sorted.length,
		collapsed: collapsed.length,
	});
	return collapsed;
}

// ---------------------------------------------------------------------------
// Status updates
// ---------------------------------------------------------------------------

export async function setStatus(
	id: string,
	status: Action["status"],
): Promise<void> {
	await withDbLock(() =>
		query(`UPDATE _sync_actions SET status = $1 WHERE id = $2`, [
			status,
			id,
		]),
	);
	log("queue:set-status", { id, status });
}

export async function setResolvedRealId(
	id: string,
	realId: string | number,
): Promise<void> {
	await withDbLock(() =>
		query(`UPDATE _sync_actions SET resolved_real_id = $1 WHERE id = $2`, [
			String(realId),
			id,
		]),
	);
	log("queue:set-resolved-real-id", { id, realId });
}

// ---------------------------------------------------------------------------
// Pending creates (for registry re-hydration)
// ---------------------------------------------------------------------------

/** Returns all pending/replaying create actions that have a tempIdSlot. */
export async function getPendingCreates(): Promise<
	Array<{ tempIdSlot: TempId; actionId: string }>
> {
	const { rows } = await withDbLock(() =>
		query(
			`SELECT id AS "actionId", temp_id_slot AS "tempIdSlot"
       FROM _sync_actions
       WHERE status IN ('pending', 'replaying') AND temp_id_slot IS NOT NULL`,
		),
	);
	return (rows as Array<{ actionId: string; tempIdSlot: string }>).map(
		(r) => ({ actionId: r.actionId, tempIdSlot: r.tempIdSlot as TempId }),
	);
}

// ---------------------------------------------------------------------------
// Topological sort — Kahn's BFS
// ---------------------------------------------------------------------------

function topologicalSort(actions: Action[]): Action[] {
	const byId = new Map<string, Action>(actions.map((a) => [a.id, a]));
	// in-degree: how many dependencies does each action have (that are in this batch)
	const inDegree = new Map<string, number>(actions.map((a) => [a.id, 0]));
	// adjacency: dependent → list of actions unblocked when it completes
	const adj = new Map<string, string[]>(actions.map((a) => [a.id, []]));

	for (const action of actions) {
		for (const dep of action.dependsOn) {
			if (byId.has(dep)) {
				inDegree.set(action.id, (inDegree.get(action.id) ?? 0) + 1);
				adj.get(dep)!.push(action.id);
			}
		}
	}

	const queue: string[] = [];
	for (const [id, deg] of inDegree) {
		if (deg === 0) queue.push(id);
	}
	// Sort initial queue by enqueuedAt for deterministic ordering
	queue.sort(
		(a, b) =>
			(byId.get(a)?.enqueuedAt ?? 0) - (byId.get(b)?.enqueuedAt ?? 0),
	);

	const sorted: Action[] = [];
	const cycleIds = new Set<string>();

	while (queue.length > 0) {
		const id = queue.shift()!;
		const action = byId.get(id);
		if (!action) continue;
		sorted.push(action);
		for (const dependentId of adj.get(id) ?? []) {
			const newDeg = (inDegree.get(dependentId) ?? 0) - 1;
			inDegree.set(dependentId, newDeg);
			if (newDeg === 0) queue.push(dependentId);
		}
	}

	// Any action not yet emitted is part of a cycle
	for (const action of actions) {
		if (!sorted.find((s) => s.id === action.id)) {
			cycleIds.add(action.id);
		}
	}

	if (cycleIds.size > 0) {
		// Mark cycle members as failed — should never happen in normal usage
		void Promise.all([...cycleIds].map((id) => setStatus(id, "failed")));
		warn("queue:cycle-detected", {
			count: cycleIds.size,
			ids: [...cycleIds],
		});
	}

	return sorted;
}

// ---------------------------------------------------------------------------
// Collapse optimisation — no-op CREATE+DELETE elimination
// ---------------------------------------------------------------------------

function collapse(actions: Action[]): Action[] {
	const byId = new Map<string, Action>(actions.map((a) => [a.id, a]));
	const removed = new Set<string>();

	for (const actionA of actions) {
		if (actionA.method !== "delete") continue;

		for (const depId of actionA.dependsOn) {
			const actionC = byId.get(depId);
			if (!actionC || actionC.method !== "create" || !actionC.tempIdSlot)
				continue;

			// Check no other action depends on C (excluding A)
			const hasOtherDependents = actions.some(
				(a) => a.id !== actionA.id && a.dependsOn.includes(actionC.id),
			);
			if (!hasOtherDependents) {
				removed.add(actionA.id);
				removed.add(actionC.id);
				log("queue:collapse-noop", {
					createActionId: actionC.id,
					deleteActionId: actionA.id,
					tempIdSlot: actionC.tempIdSlot,
				});
				// Mark as done in DB (no-op — never sent)
				void setStatus(actionA.id, "done");
				void setStatus(actionC.id, "done");
			}
		}
	}

	return actions.filter((a) => !removed.has(a.id));
}
