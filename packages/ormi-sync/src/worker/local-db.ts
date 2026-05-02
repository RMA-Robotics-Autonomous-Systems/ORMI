/**
 * Local DB wrapper for ormi-sync.
 *
 * Runs inside the DedicatedWorker. Owns:
 *  - PGlite instance (idb://ormi-local-db, IndexedDB persistence)
 *  - _sync_actions bootstrap table
 *  - Per-resource sync_{resource} tables (created lazily on first write)
 *  - CRUD helpers: upsert, merge, remove, find, findById
 *
 * No SQL escapes to consumers — the fixed document-store schema is entirely
 * internal to this file.
 */

import { PGlite, IdbFs } from "@electric-sql/pglite";
import type { LocalQuery, SyncConfig } from "../types.js";

// ---------------------------------------------------------------------------
// PGlite instance (lazily set by init)
// ---------------------------------------------------------------------------

let _db: PGlite | null = null;

function db(): PGlite {
	if (!_db)
		throw new Error("local-db: not initialised — call initDb() first");
	return _db;
}

// ---------------------------------------------------------------------------
// Web Locks helper
// ---------------------------------------------------------------------------

/**
 * Wraps every PGlite call with a short-lived exclusive Web Lock.
 * Prevents concurrent write corruption when multiple tabs each have a DedicatedWorker
 * accessing the same IndexedDB-backed PGlite database.
 */
export async function withDbLock<T>(fn: () => Promise<T>): Promise<T> {
	return navigator.locks.request("ormi-sync-db", { mode: "exclusive" }, fn);
}

// ---------------------------------------------------------------------------
// Resource name validation
// ---------------------------------------------------------------------------

const RESOURCE_RE = /^[a-z][a-z0-9_]*$/i;

function assertValidResource(resource: string): void {
	if (!RESOURCE_RE.test(resource)) {
		throw new Error(
			`ormi-sync: invalid resource name "${resource}". Must match /^[a-z][a-z0-9_]*$/i`,
		);
	}
}

// ---------------------------------------------------------------------------
// Lazy table creation
// ---------------------------------------------------------------------------

const _createdTables = new Set<string>();

async function ensureResourceTable(resource: string): Promise<void> {
	if (_createdTables.has(resource)) return;
	assertValidResource(resource);
	await withDbLock(() =>
		db().query(`
      CREATE TABLE IF NOT EXISTS sync_${resource} (
        id      TEXT PRIMARY KEY,
        data    TEXT NOT NULL,
        version TEXT,
        is_temp INTEGER DEFAULT 0
      )
    `),
	);
	_createdTables.add(resource);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Opens the PGlite database and bootstraps _sync_actions.
 * Returns the storage mode used.
 */
export async function initDb(): Promise<"persistent" | "memory-only"> {
	try {
		_db = new PGlite({ fs: new IdbFs("ormi-local-db") });
		await _db.waitReady;
		await bootstrapSyncActions();
		return "persistent";
	} catch {
		// PGlite failed to open with IndexedDB — fall back to transient in-memory instance.
		_db = new PGlite();
		await _db.waitReady;
		await bootstrapSyncActions();
		return "memory-only";
	}
}

async function bootstrapSyncActions(): Promise<void> {
	await withDbLock(() =>
		db().query(`
      CREATE TABLE IF NOT EXISTS _sync_actions (
        id               TEXT PRIMARY KEY,
        resource         TEXT NOT NULL,
        method           TEXT NOT NULL,
        payload          TEXT,
        url_template     TEXT NOT NULL,
        url_params       TEXT,
        depends_on       TEXT NOT NULL,
        temp_id_slot     TEXT,
        resolved_real_id TEXT,
        base_version     TEXT,
        enqueued_at      INTEGER NOT NULL,
        status           TEXT NOT NULL DEFAULT 'pending'
      )
    `),
	);
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

type DbConfig = Pick<SyncConfig, "primaryKey" | "versionKey">;

/**
 * Upsert a record into the local cache table for the given resource.
 * If isTemp is true the record is flagged as an optimistic write.
 */
export async function upsert(
	resource: string,
	record: unknown,
	config: DbConfig,
	isTemp?: boolean,
): Promise<void> {
	await ensureResourceTable(resource);
	const pk = config.primaryKey ?? "id";
	const vk =
		config.versionKey !== undefined ? config.versionKey : "updatedAt";
	const rec = record as Record<string, unknown>;
	const id = String(rec[pk]);
	const data = JSON.stringify(record);
	const version = vk && rec[vk] !== undefined ? String(rec[vk]) : null;
	const tempFlag = isTemp ? 1 : 0;
	await withDbLock(() =>
		db().query(
			`INSERT INTO sync_${resource} (id, data, version, is_temp)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         data    = excluded.data,
         version = excluded.version,
         is_temp = excluded.is_temp`,
			[id, data, version, tempFlag],
		),
	);
}

/**
 * Read-modify-write a record by spreading partial over the existing stored data.
 * If the record does not exist the merge is silently skipped — the action is still
 * enqueued and will apply correctly on the server during replay.
 */
export async function merge(
	resource: string,
	id: string,
	partial: Record<string, unknown>,
	config: DbConfig,
): Promise<void> {
	await ensureResourceTable(resource);
	const vk =
		config.versionKey !== undefined ? config.versionKey : "updatedAt";
	const existing = await findById(resource, id);
	if (existing === null) return; // silently skipped
	const merged = { ...(existing as Record<string, unknown>), ...partial };
	const data = JSON.stringify(merged);
	const version = vk && merged[vk] !== undefined ? String(merged[vk]) : null;
	await withDbLock(() =>
		db().query(
			`UPDATE sync_${resource} SET data = $1, version = $2 WHERE id = $3`,
			[data, version, id],
		),
	);
}

/** Delete a record from the local cache table. */
export async function remove(resource: string, id: string): Promise<void> {
	await ensureResourceTable(resource);
	await withDbLock(() =>
		db().query(`DELETE FROM sync_${resource} WHERE id = $1`, [id]),
	);
}

/** Query the local cache table, returning deserialized records. */
export async function find(
	resource: string,
	query: LocalQuery,
	config: Pick<SyncConfig, "primaryKey">,
): Promise<unknown[]> {
	await ensureResourceTable(resource);
	const params: unknown[] = [];
	const conditions: string[] = [];

	if (query.filter) {
		for (const [key, value] of Object.entries(query.filter)) {
			params.push(String(value));
			conditions.push(
				`data::jsonb ->> '${escapeJsonKey(key)}' = $${params.length}`,
			);
		}
	}

	const pk = config.primaryKey ?? "id";
	const whereClause = conditions.length
		? `WHERE ${conditions.join(" AND ")}`
		: "";
	const orderClause = query.orderBy
		? `ORDER BY data::jsonb ->> '${escapeJsonKey(query.orderBy)}'`
		: `ORDER BY data::jsonb ->> '${escapeJsonKey(pk)}'`;
	const limitClause = query.limit ? `LIMIT ${query.limit}` : "";

	const { rows } = await withDbLock(() =>
		db().query(
			`SELECT data FROM sync_${resource} ${whereClause} ${orderClause} ${limitClause}`,
			params,
		),
	);
	return (rows as Array<{ data: string }>).map((r) => JSON.parse(r.data));
}

/** Retrieve a single record by its primary-key ID string. Returns null if not found. */
export async function findById(
	resource: string,
	id: string,
): Promise<unknown | null> {
	await ensureResourceTable(resource);
	const { rows } = await withDbLock(() =>
		db().query(`SELECT data FROM sync_${resource} WHERE id = $1`, [id]),
	);
	const first = (rows as Array<{ data: string }>)[0];
	return first ? JSON.parse(first.data) : null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escape a JSON key for safe interpolation into ->> expressions.
 * Only allows alphanumeric + underscore characters; rejects anything else.
 */
function escapeJsonKey(key: string): string {
	if (!/^[a-zA-Z0-9_]+$/.test(key)) {
		throw new Error(
			`ormi-sync: unsafe JSON key "${key}" in filter/orderBy`,
		);
	}
	return key;
}

// ---------------------------------------------------------------------------
// Raw query accessor (used by action-queue and sync-worker for _sync_actions SQL)
// ---------------------------------------------------------------------------

/**
 * Execute raw SQL against the PGlite instance.
 * Caller is responsible for wrapping in withDbLock() when needed.
 */
export async function rawQuery(
	sql: string,
	params?: unknown[],
): Promise<{ rows: unknown[] }> {
	return db().query(sql, params) as Promise<{ rows: unknown[] }>;
}
