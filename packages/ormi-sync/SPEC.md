# ormi-sync — Technical Specification

## Purpose

`ormi-sync` is a new internal package that provides offline-first CRUD capability to the ORMI web app. It sits between the domain API wrappers (`workspaceApi`, `categoriesApi`, …) and the network, transparently intercepting every mutation. When the user is online, requests flow through normally and the local database stays in sync with the server response. When offline, mutations are written optimistically to a local PGlite database and queued as structured actions. On reconnect, the action queue is replayed against the backend in dependency order and the local database is reconciled with the real server state.

---

## Decisions Log

| #   | Decision                                                                                               | Rationale                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Conflict resolution: **prompt the user**                                                               | Safest UX; user is aware of the conflict and chooses the outcome                                                                                                                                          |
| 2   | Local DB: **PGlite** (Postgres WASM)                                                                   | Same dialect as the backend; real SQL; potential for shared migration logic                                                                                                                               |
| 3   | Worker model: **DedicatedWorker**                                                                      | Simpler to implement and debug than SharedWorker; multi-tab support deferred                                                                                                                              |
| 4   | Interception point: **Proxy wrapper at declaration**                                                   | Zero changes to consumers; change only the API wrapper exports                                                                                                                                            |
| 5   | Worker handles both action queue and local DB                                                          | Fewer message-passing boundaries; can be split later                                                                                                                                                      |
| 6   | Idempotency via `Idempotency-Key` HTTP header                                                          | Server deduplicates replayed requests; requires one-time backend middleware                                                                                                                               |
| 7   | Full CRUD offline scope in v1                                                                          | All create/read/update/delete operations must work offline                                                                                                                                                |
| 8   | Multi-tab safety deferred to v2                                                                        | SharedWorker complexity not warranted now                                                                                                                                                                 |
| 9   | Local DB uses a **fixed document-store schema** per resource                                           | No SQL in frontend; no backend schema leakage; package is backend-agnostic; records stored as JSON blobs; only `primaryKey` and `versionKey` need to be known                                             |
| 10  | `ApiResult<T>` **owned by `ormi-sync`**                                                                | Removes the reverse dependency where the package would import from the host app's HTTP client; makes the package self-contained and publishable                                                           |
| 11  | Online HTTP stays in the **original API method**; worker replay uses **raw `fetch` + `workerHeaders`** | `SyncExecutor` was removed — the proxy cannot access resolved URLs or HTTP verbs; the worker cannot serialise function objects across `postMessage`; each context uses the right tool for its constraints |

---

## Package Location

```
packages/ormi-sync/
```

Package name: `@workspace/ormi-sync`

---

## File Structure

```
packages/ormi-sync/
  src/
    types.ts                  ← All shared contracts (Action, SyncConfig, TempId, messages)
    worker/
      sync-worker.ts          ← DedicatedWorker entrypoint; owns PGlite + queue + replay
      local-db.ts             ← PGlite wrapper; schema registry; CRUD helpers
      action-queue.ts         ← Persistent action queue; DAG structure; collapse logic
      replay-engine.ts        ← Topological replay; temp-ID rewrite; conflict detection
    proxy/
      with-offline.ts         ← Proxy factory: wraps any API object, returns same type
    client/
      sync-client.ts          ← Main-thread postMessage bridge to the worker
      sync-event-bus.ts       ← EventTarget singleton; emits TEMP_ID_RESOLVED events
      connectivity.ts         ← online/offline event listeners; debounced TRIGGER_REPLAY
    index.ts                  ← Public exports
  package.json
  tsconfig.json
```

---

## Core Types (`types.ts`)

```ts
/**
 * HTTP result types — owned by ormi-sync.
 * Host app's HttpClient imports these from '@workspace/ormi-sync', not the other way around.
 */
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = { ok: false; error: string; details?: unknown };
export type ApiResult<T> = ApiSuccess<T> | ApiError;

/**
 * SyncExecutor was considered and removed.
 * - The proxy (main-thread, online path) intercepts the API method call but does not
 *   have access to the resolved URL or HTTP verb — those are encapsulated inside the
 *   original method body. The proxy therefore calls the original method directly and
 *   cannot re-route through a separate executor interface.
 * - The worker (replay path) cannot receive function objects via postMessage. The worker
 *   uses raw fetch() with serialisable workerHeaders injected at init.
 * Both paths are correctly served without a shared executor abstraction.
 */

/** A stable temp ID used for optimistic records before server assigns a real ID. */
export type TempId = `tmp_${string}`;

export function isTempId(id: unknown): id is TempId {
	return typeof id === "string" && id.startsWith("tmp_");
}

export function makeTempId(): TempId {
	return `tmp_${crypto.randomUUID()}`;
}

/** A single offline action pending replay. */
export interface Action {
	/** UUID — also used as the Idempotency-Key header on replay. */
	id: string;
	/** Domain resource name, e.g. 'workspaces' | 'categories'. */
	resource: string;
	/** HTTP method semantics. */
	method: "create" | "update" | "patch" | "delete" | "reorder";
	/** Request body or params, may contain TempId references. */
	payload: unknown;
	/**
	 * URL template with named path parameters, e.g. '/api/categories/:id'.
	 * Placeholders use the :name convention. TempId values are rewritten at replay;
	 * non-temp values are resolved at enqueue time.
	 */
	urlTemplate: string;
	/**
	 * Explicit URL path parameters. Values are substituted into urlTemplate placeholders.
	 * Non-TempId values are filled at enqueue time. TempId values are rewritten at replay
	 * using the same rewriteReferences pass applied to payload.
	 * e.g. { id: 42 } resolves '/api/categories/:id' → '/api/categories/42'
	 */
	urlParams?: Record<string, string | number | TempId>;
	/**
	 * IDs of other Actions whose completion is required before this one dispatches.
	 * Typically the id of the CREATE action that produced a tempIdSlot this action references.
	 */
	dependsOn: string[];
	/**
	 * The TempId this action will resolve to a real server ID upon success.
	 * Only present on 'create' actions.
	 */
	tempIdSlot?: TempId;
	/**
	 * Snapshot of the record state before this mutation was applied locally.
	 * Used for conflict detection on replay.
	 */
	baseVersion?: unknown;
	/** Timestamp when the action was enqueued. */
	enqueuedAt: number;
	status: "pending" | "replaying" | "conflict" | "done" | "failed";
}

/** Configuration for a single API object registration. */
export interface SyncConfig {
	/** Matches the Action.resource field. */
	resource: string;
	/**
	 * Field name in the JSON record used as the primary key.
	 * Defaults to 'id'. Must be present on every record the API returns.
	 */
	primaryKey?: string;
	/**
	 * Field name in the JSON record used as the version token for conflict
	 * detection. Compared before and after replay to detect concurrent edits.
	 * Defaults to 'updatedAt'. Set to null to disable conflict detection.
	 */
	versionKey?: string | null;
	/**
	 * Explicit list of method names treated as mutations (queued offline).
	 * When omitted, any method not matching /^(get|load)/i is treated as a mutation.
	 */
	mutateMethods?: string[];
	/**
	 * Per-method action descriptors for mutating methods.
	 * Required for any method that will be queued offline.
	 * Read methods (get*, load*) do not need descriptors.
	 * If a mutating method is intercepted without a descriptor:
	 *   - **Online**: log a warning, call the original method directly, and skip offline support.
	 *   - **Offline**: return an `ApiResult` error indicating the method is not offline-enabled
	 *     because no `ActionDescriptor` is registered. Do not call the original method
	 *     (it would fail with a network error and give the user the wrong failure reason)
	 *     and do not enqueue.
	 */
	actions?: Record<string, ActionDescriptor>;
}

/**
 * Describes how to build a replayable Action from a method's positional arguments.
 * Provided once per mutating method in SyncConfig.actions.
 * Extractor functions are called on the main thread at interception time and are never
 * serialised — only their plain-data output is stored in the Action record.
 *
 * Extractors run on EVERY intercepted call regardless of connectivity, because the proxy
 * pre-builds the Action before calling the original method (needed for the transient-failure
 * fallback path). Extractors must be pure, synchronous, and cheap — no network calls,
 * no side effects.
 *
 * Type safety: urlParams and payload are typed as (...args: unknown[]). TypeScript will not
 * infer the original method's parameter types inside the extractor body. Cast arguments as
 * needed: (...args) => { const [id] = args as [number]; return { id }; }.
 * A generic ActionDescriptor<TArgs extends unknown[]> is possible but adds complexity
 * to SyncConfig.actions typing; the cast approach is the v1 recommendation.
 *
 * URL template drift: ActionDescriptor.urlTemplate must stay in sync with the URL used
 * inside the original method body. When a route changes, update both. Consider extracting
 * route constants to a shared file (e.g. lib/api/routes.ts) and importing from both locations.
 */
export interface ActionDescriptor {
	/** URL template with :param placeholders, e.g. '/api/workspaces/:id'. */
	urlTemplate: string;
	/** Action.method value stored in the queue. */
	actionMethod: "create" | "update" | "patch" | "delete" | "reorder";
	/**
	 * Extracts URL path parameters from the method's positional arguments.
	 * Return value is stored as Action.urlParams.
	 * Non-TempId values are resolved at enqueue time; TempId values are left
	 * for the replay engine's rewriteReferences pass.
	 * Required for methods whose urlTemplate contains :param placeholders.
	 *
	 * For `update`, `patch`, and `delete` methods, the returned object must include
	 * the target record's local primary key value under the same field name as
	 * `SyncConfig.primaryKey` (defaults to `'id'`). The proxy uses that value for
	 * optimistic local updates and `baseVersion` lookup.
	 */
	urlParams?: (
		...args: unknown[]
	) => Record<string, string | number | TempId>;
	/**
	 * Extracts the request body from the method's positional arguments.
	 * Return value is stored as Action.payload.
	 * Omit for methods with no body (e.g. DELETE).
	 */
	payload?: (...args: unknown[]) => unknown;
}

/** Messages: main thread → worker */
export type WorkerInMessage =
	| { type: "ENQUEUE_ACTION"; action: Action }
	| {
			type: "LOCAL_READ";
			resource: string;
			query: LocalQuery;
			requestId: string;
	  }
	| {
			type: "LOCAL_WRITE";
			resource: string;
			record: unknown;
			isTemp?: boolean;
			/** Passed through from SyncConfig. Defaults to 'id' if absent. */
			primaryKey?: string;
			/** Passed through from SyncConfig. Defaults to 'updatedAt' if absent. */
			versionKey?: string | null;
			/**
			 * Optional. When present, the worker posts LOCAL_WRITE_RESULT with this id.
			 * Omit for fire-and-forget cache writes (online read/mutation caching);
			 * provide for writes where the caller needs to confirm completion.
			 */
			requestId?: string;
	  }
	| {
			type: "LOCAL_MERGE";
			resource: string;
			id: string;
			partial: Record<string, unknown>;
			/** Passed through from SyncConfig. Defaults to 'id' if absent. */
			primaryKey?: string;
			/** Passed through from SyncConfig. Defaults to 'updatedAt' if absent. */
			versionKey?: string | null;
			/** Optional. When present, the worker posts LOCAL_WRITE_RESULT on completion. */
			requestId?: string;
	  }
	| {
			type: "LOCAL_DELETE";
			resource: string;
			id: string;
			/** Passed through from SyncConfig. Defaults to 'id' if absent. */
			primaryKey?: string;
			/**
			 * Optional. When present, the worker posts LOCAL_WRITE_RESULT on completion.
			 * Omit for fire-and-forget deletes (e.g. post-mutation cache eviction).
			 */
			requestId?: string;
	  }
	| { type: "TRIGGER_REPLAY" }
	| {
			type: "RESOLVE_CONFLICT";
			actionId: string;
			resolution: "keep-local" | "use-server";
	  }
	| { type: "SET_HEADERS"; headers: Record<string, string> }
	| {
			/** Sent once at startup to re-hydrate the pending-create registry. */
			type: "GET_PENDING_CREATES";
			requestId: string;
	  };

/** Messages: worker → main thread */
export type WorkerOutMessage =
	| { type: "WORKER_READY"; mode: "persistent" | "memory-only" }
	| { type: "LOCAL_READ_RESULT"; requestId: string; result: unknown }
	| { type: "LOCAL_WRITE_RESULT"; requestId: string; ok: boolean }
	| {
			type: "CONFLICT";
			action: Action;
			serverValue: unknown;
			localValue: unknown;
	  }
	| {
			type: "REPLAY_DONE";
			resolved: number;
			failed: number;
			permanentFailures: Action[];
	  }
	| { type: "TEMP_ID_RESOLVED"; tempId: TempId; realId: string | number }
	| {
			/** Response to GET_PENDING_CREATES. */
			type: "PENDING_CREATES_RESULT";
			requestId: string;
			/** All pending or replaying actions that have a tempIdSlot. */
			creates: Array<{ tempIdSlot: TempId; actionId: string }>;
	  };

export interface LocalQuery {
	filter?: Record<string, unknown>;
	orderBy?: string;
	limit?: number;
}
```

---

## Proxy Factory (`proxy/with-offline.ts`)

### Contract

```ts
export function withOffline<
	T extends Record<string, (...args: any[]) => Promise<ApiResult<any>>>,
>(api: T, config: SyncConfig): T;
```

`ApiResult<T>` is defined in `ormi-sync/src/types.ts`. Host apps import it from `@workspace/ormi-sync`.

Returns a `Proxy` that wraps `T` — **identical type, zero impact on consumers**. The proxy intercepts every method call and routes it:

- **Online, read methods** (`getAll`, `getById`): call the original method directly. On success, apply cache update rules (see below). Return the result.
- **Online, read methods that fail**: surface the error directly; failed reads are never queued.
- **Online, mutating methods**: call the original method directly (the original method body already knows the URL and HTTP verb; the proxy does not have access to them and cannot re-route through any intermediate executor). On success, apply cache update rules (see below). On transient failure (network error, 5xx, 429), fall back to the offline path. On permanent failure (4xx except 409), surface the error immediately without queuing.
- **Offline, read methods**: post `LOCAL_READ` to worker, await `LOCAL_READ_RESULT`.
- **Offline, mutating methods**: construct a minimal optimistic stub (see below), post the appropriate local write message and `ENQUEUE_ACTION` to worker, return `{ ok: true, data: optimisticStub }`.

### Cache update rules

Different method kinds require different local actions after a successful server response:

| Method kind                                                   | Server response    | Local action                                                                                                 |
| ------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Read returning one record                                     | Full record object | One `LOCAL_WRITE`                                                                                            |
| Read returning array of records (`getAll`)                    | Array of records   | One `LOCAL_WRITE` per record                                                                                 |
| `create` / `update` / `patch` returning canonical full record | Full record object | One `LOCAL_WRITE`                                                                                            |
| `delete` success                                              | Any / empty        | `LOCAL_DELETE` — **never `LOCAL_WRITE`**                                                                     |
| Mutation returning only an envelope / no canonical record     | Envelope object    | No cache write (optimistic local state already applied)                                                      |
| `reorder` success                                             | Envelope / void    | No cache write unless response contains canonical updated records; if it does, treat each as a `LOCAL_WRITE` |

**Delete is always `LOCAL_DELETE`, never `LOCAL_WRITE`:**

- Online delete success → `LOCAL_DELETE` (removes the record from local DB).
- Offline delete → optimistic `LOCAL_DELETE` applied before `ENQUEUE_ACTION`; no `LOCAL_WRITE` at any point.

`patch` may return a partial response rather than a full canonical record. If the response is partial, apply a `LOCAL_MERGE` rather than a full `LOCAL_WRITE` to avoid overwriting fields not included in the response.

### Action Construction

When the proxy intercepts a mutating method call, it has no access to the resolved URL, HTTP verb, or how arguments map to a request body — those are encapsulated inside the original method. The consumer provides this mapping explicitly via `SyncConfig.actions`.

**Steps to build an `Action` from an intercepted call to `methodName(...args)`:**

1. Look up `config.actions?.[methodName]`. If absent: if **online**, log a warning, call the original method directly, and skip queuing (read methods fall here by design); if **offline**, return `{ ok: false, error: 'Method not offline-enabled: no ActionDescriptor registered' }` and do not call the original method.
2. `action.urlTemplate = descriptor.urlTemplate`.
3. `action.urlParams = descriptor.urlParams?.(...args) ?? {}`.
4. `action.payload = descriptor.payload?.(...args) ?? undefined`.
5. `action.method = descriptor.actionMethod`.
6. Scan `action.payload` and `action.urlParams` recursively using `isTempId()`. For each `TempId` found, call `syncClient.getPendingCreateId(tempId)` to retrieve the `action.id` of the in-flight create that produced it. Collect these into `action.dependsOn`.
7. If any `TempId` found in step 6 has no registered pending create, **throw** — the mutation references a TempId that was never enqueued as a create.
8. Set `action.id = crypto.randomUUID()`, `action.resource = config.resource`, `action.enqueuedAt = Date.now()`, `action.status = 'pending'`.
9. **Only when `descriptor.actionMethod` is `update` or `patch`:** capture `action.baseVersion` by posting `LOCAL_READ` to the worker for the record identified by `action.urlParams[config.primaryKey ?? 'id']` and awaiting `LOCAL_READ_RESULT` — **before** the optimistic write (see `baseVersion` section below). This is an async worker round-trip; the proxy method is already async so `await` is valid here. For `create`, `delete`, and `reorder`, skip this step — `action.baseVersion` is left unset and no round-trip is incurred.
10. If `descriptor.actionMethod === 'create'`: generate `tempId = makeTempId()`, set `action.tempIdSlot = tempId`. After step 11, call `syncClient.registerPendingCreate(tempId, action.id)` so future mutations can reference it.
11. Post `ENQUEUE_ACTION` to the worker.

**`SyncClient` pending-create registry** (main-thread only — no worker messages):

```ts
// SyncClient exposes three methods for proxy coordination:
registerPendingCreate(tempId: TempId, actionId: string): void;
resolvePendingCreate(tempId: TempId): void;   // called on TEMP_ID_RESOLVED and on permanentFailures
getPendingCreateId(tempId: TempId): string | undefined;
```

This map is the sole source of `dependsOn` data for the proxy. It lives entirely on the main thread.

**Registry re-hydration on startup:** the registry is in-memory and is destroyed on page refresh. `_sync_actions` is durable. On startup, after `_ready` resolves but **before** posting `TRIGGER_REPLAY`, `SyncClient` sends `GET_PENDING_CREATES` and awaits `PENDING_CREATES_RESULT`. The worker queries:

```sql
SELECT id AS "actionId", temp_id_slot AS "tempIdSlot"
FROM _sync_actions
WHERE status IN ('pending', 'replaying') AND temp_id_slot IS NOT NULL;
```

`SyncClient` calls `registerPendingCreate(row.tempIdSlot, row.actionId)` for each row. Re-hydration completes before replay starts, so any offline mutation immediately after startup correctly sees the restored TempId registrations.

**Failed-create cleanup:** `TEMP_ID_RESOLVED` is never posted for permanently failed creates. On `REPLAY_DONE`, call `resolvePendingCreate(action.tempIdSlot)` for every action in `permanentFailures` that has a `tempIdSlot`. This evicts dead entries so step 7 correctly throws for any later mutation that references them.

### Optimistic stub for offline creates

The proxy intercepts `create(...args)` with positional arguments. `SyncConfig` is intentionally schema-agnostic — the proxy has no knowledge of what fields the server will return. For offline creates, the proxy returns a **minimal stub** (Option A):

```ts
// optimisticStub written to local DB and returned to the component:
const optimisticStub = { [config.primaryKey ?? "id"]: tempId };
```

The UI must tolerate incomplete stubs for records created offline. The pattern:

```ts
// Consumer handles pending state:
const displayName = item.title ?? "…"; // title is absent until TEMP_ID_RESOLVED
const id = useTempIdResolution(item.id); // resolves tempId → real id after sync
```

This is consistent with the "schema-agnostic" principle. Adding a `buildOptimistic?: (args: unknown[]) => Record<string, unknown>` field to `SyncConfig` is a planned v2 opt-in for consumers that need a richer offline create experience.

### Connectivity fallback heuristic

`navigator.onLine` / `online`/`offline` events fire when the network interface changes, not when the server is unreachable (captive portal, VPN, server restart). The proxy therefore also treats any transient online failure as a trigger to enter offline mode for that call, regardless of `navigator.onLine` state.

### `baseVersion` capture timing

`baseVersion` is captured by the proxy **before** applying the optimistic write — it reads the current record from local DB first, snapshots it, then writes the optimistic version. Capturing after the write would snapshot the optimistic state, not the pre-mutation state, breaking conflict detection.

### Read method detection heuristic

Methods named `getAll`, `getById`, `get*`, or `load*` are treated as reads. All others are mutations. This can be overridden per-registration via `SyncConfig.mutateMethods`.

### Usage at declaration (the only file that changes per domain)

```ts
// apps/web/lib/api/workspace-api.ts
import { withOffline } from '@workspace/ormi-sync';

export const workspaceApi = withOffline(
  {
    async getAll() { return httpClient.get<Workspace[]>('/api/workspaces'); },
    async getById(id: number) { return httpClient.get<Workspace>(`/api/workspaces/${id}`); },
    async create(title: string, userId: string, dashboardType?: string) { ... },
    async reorder(updates: ...) { ... },
    async update(id: number, data: ...) { ... },
    async patch(id: number, data: ...) { ... },
    async delete(id: number) { ... },
  },
  {
    resource: 'workspaces',
    primaryKey: 'id',
    versionKey: 'updatedAt',
    actions: {
      create: {
        urlTemplate: '/api/workspaces',
        actionMethod: 'create',
        payload: (title, userId, dashboardType) => ({ title, userId, dashboardType }),
      },
      update: {
        urlTemplate: '/api/workspaces/:id',
        actionMethod: 'update',
        urlParams: (id) => ({ id }),
        payload: (_id, data) => data,
      },
      patch: {
        urlTemplate: '/api/workspaces/:id',
        actionMethod: 'patch',
        urlParams: (id) => ({ id }),
        payload: (_id, data) => data,
      },
      reorder: {
        urlTemplate: '/api/workspaces/reorder',
        actionMethod: 'reorder',
        payload: (updates) => updates,
      },
      delete: {
        urlTemplate: '/api/workspaces/:id',
        actionMethod: 'delete',
        urlParams: (id) => ({ id }),
        // no payload — DELETE has no body
      },
    },
  },
);
```

No SQL. No schema declaration. The local table is auto-created on first use.

---

## Action Queue (`worker/action-queue.ts`)

### Storage

Actions are persisted in a PGlite table so they survive page refreshes:

```sql
CREATE TABLE IF NOT EXISTS _sync_actions (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  method TEXT NOT NULL,
  payload TEXT,                  -- JSON serialised; NULL for actions with no body (e.g. DELETE)
  url_template TEXT NOT NULL,
  url_params TEXT,               -- JSON serialised Record<string, string|number|TempId>
  depends_on TEXT NOT NULL,      -- JSON array of action IDs
  temp_id_slot TEXT,
  resolved_real_id TEXT,         -- real server ID written when a create action succeeds; NULL until then
  base_version TEXT,             -- JSON serialised
  enqueued_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);
```

> **Serialisation rule:** if `action.payload` is absent (e.g. DELETE), store SQL `NULL` in the `payload` column. If present, store `JSON.stringify(action.payload)`. On load, SQL `NULL` maps to `undefined`; otherwise `JSON.parse(row.payload)`. The replay engine dispatches `fetch` with `body: undefined` when payload is `undefined` — no other change needed in the replay path. Do not store the JSON text `"null"` — use SQL `NULL` exclusively to represent an absent payload.

### Topological sort

On replay start, all `pending` actions are loaded and sorted by:

1. Build adjacency map from `dependsOn` edges.
2. Kahn's algorithm (BFS topological sort). Cycles should not be possible given the append-only design, but if detected the cycle is failed with status `failed` and replay continues with the rest.

### Collapse optimisation

Before dispatching, scan for **no-op pairs**:

A CREATE and DELETE on the same `tempIdSlot` can be collapsed (removed entirely) **if and only if** no other action in the queue has that `tempIdSlot` in its `dependsOn`. Algorithm:

```
for each action A with method='delete' and dependsOn containing action C:
  if C.method === 'create' and C.tempIdSlot !== undefined:
    dependents = all actions whose dependsOn includes C.id (excluding A)
    if dependents is empty:
      remove A and C from queue (no-op elimination)
```

### Enqueue validation

Before any action enters the queue, the proxy scans `payload` and `urlParams` recursively for `TempId` values using `isTempId()`. Every `TempId` found must have a corresponding entry in `dependsOn`. If any `TempId` reference is not covered by a `dependsOn` edge, the enqueue is rejected with a thrown error. This enforces that the `dependsOn` graph is always the complete and correct dependency description, so both collapse and temp-ID rewrite can rely on it exclusively without scanning payloads again.

### Reorder offline semantics

A `reorder` action carries a payload that is an array of `{ id, order }` (or equivalent) objects. The offline handling differs from scalar mutations:

- **Optimistic write**: a reorder payload is an array of `{ id, order }` (or equivalent) objects. Each element requires a **read-modify-write**, not a plain upsert, to avoid overwriting existing record fields with only `{ id, order }`. The proxy cannot call `merge()` on the worker directly — it communicates via `postMessage`. The correct path is a dedicated `LOCAL_MERGE` message, handled inside the worker where `withDbLock` can protect the operation:

    The proxy posts one `LOCAL_MERGE` per reorder element:

    ```ts
    // proxy — for each { id, order } in payload:
    syncClient.postMessage({
    	type: "LOCAL_MERGE",
    	resource: config.resource,
    	id: String(element.id),
    	partial: { order: element.order },
    	primaryKey: config.primaryKey,
    	versionKey: config.versionKey,
    });
    ```

    The worker calls `merge()` internally for each `LOCAL_MERGE` message, keeping the read-modify-write inside the lock boundary.

- **TempId references in payload**: handled by the existing `rewriteReferences` pass, which recurses into arrays. No special case needed.
- **Multiple offline reorders for the same resource**: both actions remain in the queue as independent entries with no `dependsOn` edge between them (unless they share a TempId). Topological sort places them in `enqueuedAt` order; the later reorder overwrites the earlier one on the server, which is correct — the last user action wins.
- **`baseVersion` / conflict detection**: not applied to reorder actions (`method='reorder'` is excluded from the pre-flight GET check). Reorder conflicts are silent last-write-wins, consistent with the low-stakes nature of display order.

---

## Replay Engine (`worker/replay-engine.ts`)

### Temp-ID rewrite

A `resolvedIds: Map<TempId, string | number>` map is initialised at the start of each replay run inside `replay-engine.ts`. The `TRIGGER_REPLAY` handler in `sync-worker.ts` pre-seeds this map with durable temp→real mappings loaded from `_sync_actions` before invoking the replay loop. Before dispatching any action:

```ts
function rewriteReferences(
	value: unknown,
	map: Map<TempId, string | number>,
): unknown {
	if (typeof value === "string" && isTempId(value))
		return map.get(value) ?? value;
	if (Array.isArray(value))
		return value.map((v) => rewriteReferences(v, map));
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [
				k,
				rewriteReferences(v, map),
			]),
		);
	}
	return value;
}
```

The URL template is also rewritten (e.g. `/api/categories/tmp_001` → `/api/categories/42`).

### Conflict detection

For UPDATE/PATCH actions that carry `baseVersion` and a non-null `versionKey`:

**Before dispatching the action** (pre-flight read):

1. Issue a `GET` on the **fully resolved URL** (after temp-ID rewrite and `resolveUrl` passes have run).
2. Compare `currentServerState[versionKey]` with `baseVersion[versionKey]`.
3. If they **differ**: a concurrent edit happened while the user was offline.
    - Pause replay; do not dispatch further dependent actions in this chain.
    - Post `CONFLICT` to main thread with `action`, `serverValue` (`currentServerState`), and `localValue` (current local DB record).
    - Main thread UI presents a diff; user picks "Keep mine" or "Use server version".
    - Main thread posts `RESOLVE_CONFLICT` with `resolution: 'keep-local' | 'use-server'`.

    **Resolution: `use-server`** — discard the local action. Mark it `status='done'` (not failed). Upsert `serverValue` into local DB. All dependents are unblocked and continue replay. Dependents continue with their original payload intact; host app backend must tolerate stale field references in dependent payloads (e.g. a `categoryId` that the server's concurrent edit changed).

    **Resolution: `keep-local`** — dispatch the action without re-running the pre-flight check. The action carries the user's explicit intent to overwrite. Whether the server accepts it depends on the endpoint's semantics (last-write-wins vs. version-checked). If the server responds with a non-conflict error, it is treated as a permanent failure. The host app's backend must implement endpoints that accept writes without strict version enforcement when this is the intended behaviour (e.g. omit `updatedAt` validation on forced updates).

4. If they **match**: no concurrent edit. Dispatch the mutation.

> **Why pre-flight, not post-write:** After a successful server write, the server's `versionKey` will always be newer than `baseVersion` — because the replay just wrote it. Comparing after the write cannot distinguish a conflict from a clean replay. The check must happen before dispatch.

### Pre-flight GET optimisation

Do not issue a pre-flight GET for every action. Only do so when **all** of the following are true:

- `action.baseVersion` is set
- `SyncConfig.versionKey` is non-null
- The action method is `update` or `patch`

Before hitting the network, check the **local DB version** first:

- Read `version` column from `sync_{resource}` for this record.
- If `local.version !== action.baseVersion[versionKey]`: local DB already reflects a concurrent edit (e.g. from a previous replay step or another tab). Surface conflict immediately — no network round-trip needed.
- If `local.version === action.baseVersion[versionKey]`: local hasn't diverged. Issue the pre-flight GET to check the server.

This eliminates the server round-trip in the majority of cases and makes the conflict check free when local state is already inconsistent.

### On action success

```
1. Write server response to local DB (upsert by primaryKey, replacing any temp record).
2. If action.tempIdSlot:
     a. resolvedIds.set(tempIdSlot, serverRecord[primaryKey])   ← in-memory; current replay only
     b. UPDATE _sync_actions SET resolved_real_id = serverRecord[primaryKey] WHERE id = action.id
        ← durable; pre-seeds resolvedIds in future replays after page refresh
3. Post TEMP_ID_RESOLVED to main thread (lets UI update any rendered temp IDs).
4. Mark action status='done' in _sync_actions.
```

### URL template resolution

Before dispatch, the URL template is fully resolved in two passes:

1. **Temp-ID rewrite pass** (already described): replaces TempId values in `action.urlParams` using `resolvedIds` map.
2. **Parameter substitution pass**: replace each `:paramName` in `urlTemplate` with the corresponding value from `action.urlParams`.

```ts
function resolveUrl(
	template: string,
	params: Record<string, string | number>,
): string {
	return template.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
		if (!(key in params)) throw new Error(`Unresolved URL param: ${key}`);
		return String(params[key]);
	});
}
```

At enqueue time, the proxy fills `urlParams` with all known (non-temp) values. If a value is a TempId, it is left as-is for the replay engine to rewrite. After the `rewriteReferences` pass, all TempIds in `urlParams` are resolved; `resolveUrl` is then called.

### On action failure (non-conflict)

Distinguish failure type before propagating:

- **Transient** (network error, 5xx, 429): retry up to `maxRetries` times (default 3) with exponential backoff (base 1s, factor 2). After exhausting retries, treat as permanent.
- **Permanent** (4xx except 409): mark action and all transitive dependents `status='failed'` immediately. Include them in `REPLAY_DONE.permanentFailures`. Do not retry. Do not block independent chains.
- **409 Conflict**: route to the conflict detection path above.

`maxRetries` and `backoffBase` are configurable in `SyncClient.init()`.

### Permanent failures — UI contract

The host app receives `REPLAY_DONE.permanentFailures: Action[]`. The expected pattern:

```ts
// apps/web/components/client-providers.tsx
syncClient.onMessage((msg) => {
	if (msg.type === "REPLAY_DONE" && msg.permanentFailures.length > 0) {
		for (const action of msg.permanentFailures) {
			// Show a non-dismissible notification per failed action
			toast.error(
				`Sync failed: ${action.method} ${action.resource} — your change was not saved.`,
				{ duration: Infinity, id: action.id },
			);
		}
	}
});
```

Permanent failures are **not automatically removed** from `_sync_actions` — they remain with `status='failed'` for diagnostics. The host app may offer a "Clear failed actions" control.

---

## Local DB (`worker/local-db.ts`)

PGlite runs inside the DedicatedWorker. On worker initialisation:

1. Open PGlite with `idb://ormi-local-db` — persisted via **IndexedDB** (not OPFS). `idb://` is PGlite's IndexedDB adapter; OPFS would require `opfs://`. IndexedDB has different storage quota and eviction behaviour — this is an intentional choice for v1 compatibility. Switching to `opfs://` for better performance is a non-breaking config change.
2. Run the single internal bootstrap: create `_sync_actions` table if it does not exist.
3. Resource tables are created **lazily** — on the first `LOCAL_WRITE` for a resource not yet seen.

### Resource name sanitization

The resource name is interpolated directly into a `CREATE TABLE` statement (`sync_{resource}`). Before any SQL is executed, the resource name must pass `/^[a-z][a-z0-9_]*$/i`. If it fails, the operation throws. Resource names are always hardcoded constants in `withOffline(...)` calls, never derived from user input or API responses — but the guard exists as a defence-in-depth measure.

### `_sync_actions` is never dropped on migration

Data cache tables (`sync_workspaces`, etc.) can be dropped and recreated safely — they are repopulated from the server on the next online read. The `_sync_actions` table must **not** be dropped during any migration because it contains pending mutations representing unsynced user work. Schema changes to `_sync_actions` must be handled with `ALTER TABLE` migrations, not drop-and-recreate.

### Fixed document-store schema

Every resource gets the **same fixed table structure**, owned entirely by `ormi-sync`. No consumer ever writes SQL.

```sql
-- Template instantiated as e.g. sync_workspaces, sync_categories, …
CREATE TABLE IF NOT EXISTS sync_{resource} (
  id      TEXT PRIMARY KEY,  -- TEXT holds both integer IDs and TempIds
  data    TEXT NOT NULL,      -- full record JSON-serialised; schema-agnostic
  version TEXT,               -- value of SyncConfig.versionKey; used for conflict detection
  is_temp INTEGER DEFAULT 0   -- 1 when record was written optimistically offline
);
```

### Why this design

| Concern                                 | Result                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| SQL in frontend                         | None — table shape is fixed inside the package, invisible to consumers                 |
| Backend schema leakage                  | None — `data` is an opaque JSON blob; the package never inspects field names           |
| Backend schema changes                  | Zero impact — new/removed fields are absorbed by the blob                              |
| New resource                            | Just add `withOffline(...)` — table auto-creates on first write                        |
| "Migration" on app update               | Drop all `sync_*` tables; they recreate and repopulate from server on next online read |
| Package dependency on Prisma / Postgres | None — stores whatever JSON the API returns                                            |

### CRUD helpers

```ts
// All helpers operate on the fixed schema above.
async function upsert(
	resource: string,
	record: unknown,
	config: Pick<SyncConfig, "primaryKey" | "versionKey">,
	isTemp?: boolean,
): Promise<void>;
async function merge(
	resource: string,
	id: string,
	partial: Record<string, unknown>,
	config: Pick<SyncConfig, "primaryKey" | "versionKey">,
): Promise<void>;
// Reads existing record, spreads partial over it, writes back.
// If the record does not exist locally, the merge is silently skipped — the reorder
// action is still enqueued and will apply correctly on the server during replay.
async function remove(resource: string, id: string): Promise<void>;
async function find(
	resource: string,
	query: LocalQuery,
	config: Pick<SyncConfig, "primaryKey">,
): Promise<unknown[]>;
async function findById(resource: string, id: string): Promise<unknown | null>;
```

All read results are `JSON.parse(row.data)` — consumers receive plain objects identical in shape to server responses.

> **`Pick<SyncConfig>` in helpers vs. full `SyncConfig` in proxy:** helpers accept `Pick<SyncConfig, "primaryKey" | "versionKey">` (or `Pick<SyncConfig, "primaryKey">`) to make their minimal requirements explicit. The proxy holds and passes the full `SyncConfig` directly — TypeScript accepts `SyncConfig` wherever `Pick<SyncConfig, ...>` is expected (structural subtype). No manual destructuring needed.

> **`LOCAL_WRITE_RESULT` on failure:** if `ok: false`, the main thread should log the error and surface a generic storage-failure message. The action is not retried; the write is lost. This should be rare. Likely causes include local DB operation failures, invalid configuration, serialisation errors, or storage backend unavailability. In `memory-only` mode, durability is lost across reloads, but writes should still typically succeed during the current tab session.

### Filter implementation

`LocalQuery.filter` is `Record<string, unknown>`. Since `data` is a `TEXT` column containing serialised JSON, filtering uses PGlite's JSON extraction operator:

```sql
-- For each { key: value } in filter (PostgreSQL / PGlite syntax):
SELECT * FROM sync_{resource}
WHERE data::jsonb ->> 'key' = 'value'
```

> **Note:** `json_extract(data, '$.key')` is SQLite syntax and will throw at runtime in PGlite. The correct PGlite operator is `->>` on a `jsonb` cast. The `data` column is `TEXT`; cast it to `jsonb` inline per query.

Each key-value pair is AND-composed. Only equality filters are supported in v1. Range/array filters are out of scope. No JSON column indexing is applied in v1 — acceptable for the data volumes involved. If performance becomes an issue, a `CREATE INDEX` on a specific extracted field can be added without changing the schema.

### No `REGISTER_SCHEMA` message

The `REGISTER_SCHEMA` worker message type is **removed**. There is nothing for the main thread to register. `SyncConfig` has no `localSchema` field.

---

## SyncExecutor — Removed

`SyncExecutor` was considered as an injectable HTTP adapter but was removed for two concrete reasons:

1. **Main-thread proxy cannot use it.** The proxy intercepts `workspaceApi.create(title, userId)` — positional arguments. The resolved URL (`/api/workspaces`) and HTTP verb (`POST`) are encapsulated inside the original method body, which calls `httpClient.post(...)` internally. The proxy has no access to them. It cannot extract a URL or verb to pass to an executor. Therefore the proxy calls the original method directly for all online operations.

2. **Worker cannot receive it.** Function objects cannot be transferred across `postMessage`. The worker uses raw `fetch()` with serialisable `workerHeaders` injected via `SET_HEADERS`.

`SyncExecutor` is not exported. `SyncClient.init()` takes `workerHeaders`, `maxRetries`, and `backoffBase` only:

```ts
SyncClient.init({
	workerHeaders: {
		Authorization: `Bearer ${session.token}`,
	},
	maxRetries: 3,
	backoffBase: 1000,
});

// When session token changes:
syncClient.setHeaders({ Authorization: `Bearer ${newToken}` });
// → posts { type: 'SET_HEADERS', headers: {...} } to worker
```

The worker stores the current headers in memory and attaches them to every `fetch` call in the replay engine. `Idempotency-Key` is always added by the replay engine itself using `action.id`, regardless of `workerHeaders`.

### Token refresh during active replay

`syncClient.setHeaders(newHeaders)` posts `SET_HEADERS` to the worker. The worker processes messages sequentially; a `SET_HEADERS` message that arrives during an active replay will be processed only after the currently-dispatching action completes. Actions already in-flight when the token expires will use the old token.

**v1 behaviour (documented, not fixed):** any in-flight request that returns `401` due to an expired token is treated as a permanent failure. The host app's auth layer (e.g. NextAuth session middleware) should renew the session cookie automatically; cookie-based auth is unaffected by `workerHeaders` entirely. `workerHeaders` is primarily for explicit Bearer token scenarios. If mid-replay 401s are a concern in practice, upgrade to cookie-based session auth on the server side rather than adding per-request token refresh logic to the worker.

---

## Idempotency Backend Middleware

The worker's replay engine attaches `Idempotency-Key: {action.id}` to every `fetch` call. The host app's backend must deduplicate requests using it. Reference implementation for Next.js:

New file: `apps/web/lib/idempotency.ts`

- On each mutating request, read `Idempotency-Key` header.
- Look up key in `idempotency_keys` Prisma table.
- If found and not expired (TTL 24h): return cached response immediately.
- If not found: process request normally, store `{ key, response, expiresAt }` in table.

New Prisma model:

```prisma
model IdempotencyKey {
  key        String   @id
  response   Json
  statusCode Int
  createdAt  DateTime @default(now())
  expiresAt  DateTime
  @@index([expiresAt])
}
```

---

## Data Flow Summary

### Online path

```
Component
  → withOffline Proxy (navigator.onLine = true)
  → original API method called directly
    (proxy has no access to URL or HTTP verb — they are inside the method body)
  → host app's HttpClient → Next.js API route → DB
  ← server response (ok: true)
    → proxy posts LOCAL_WRITE to worker → PGlite upsert
    ← ApiResult<T> returned to component
  ← server response (ok: false, transient 5xx / network error)
    → fall back to offline path (optimistic stub + enqueue)
  ← server response (ok: false, permanent 4xx)
    → return error to component immediately; nothing queued
```

### Offline path

```
Component
  → withOffline Proxy (detects offline)
  → SyncClient.read from PGlite (for reads)   ← reads return local data immediately
  → generate TempId (for creates)
  → optimistic PGlite write
  → SyncClient.postMessage(ENQUEUE_ACTION)
  ← optimistic ApiResult<T> returned to component (data has TempId as id)
```

### Reconnect / replay path

```
connectivity.ts fires 'online'
  → SyncClient.postMessage(TRIGGER_REPLAY)
  → worker: load pending actions from _sync_actions
  → topological sort
  → collapse no-op CREATE+DELETE pairs
  → for each action (in order):
      rewrite tempId references in payload + urlParams
      resolve URL: substitute urlParams into urlTemplate
      pre-flight local version check; pre-flight GET if needed (conflict check)
      worker fetch(rewrittenUrl, workerHeaders ∪ { 'Idempotency-Key': action.id }, rewrittenPayload)
      on success:
        upsert PGlite (replace temp record with real record)
        update resolvedIds map
        post TEMP_ID_RESOLVED to main thread
      on conflict:
        post CONFLICT to main thread → await user resolution → continue
      on failure:
        mark action + dependents as failed
  → post REPLAY_DONE
```

---

## Connectivity (`client/connectivity.ts`)

`connectivity.ts` listens to `window.addEventListener('online', ...)` and posts `TRIGGER_REPLAY` to the worker when the browser reports going online. Two issues to handle:

- **`navigator.onLine` is unreliable**: the `online` event fires on any network interface change (Wi-Fi handoff, brief reconnect). Triggering replay immediately on every event wastes retries on an unstable connection before it stabilises.
- **False positive storm**: rapid interface changes fire `online` multiple times in quick succession.

Use a **debounce of 2 seconds** before posting `TRIGGER_REPLAY`:

```ts
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

window.addEventListener("online", () => {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		syncClient.triggerReplay();
		debounceTimer = null;
	}, 2000);
});
```

The 2-second window allows the connection to stabilise. If the device goes offline again within the window, the timeout is cleared and replay is not triggered. This is a best-effort heuristic — the proxy's transient-failure fallback path handles cases where replay starts before the connection is fully stable.

### Startup replay

The `online` event only fires when the browser transitions from offline to online. If the user opens the app while already connected — the normal case after a period of offline use — no `online` event fires and pending actions in `_sync_actions` would sit indefinitely.

`SyncClient` automatically posts `TRIGGER_REPLAY` after `_ready` resolves when `navigator.onLine` is true at startup:

```ts
// Inside SyncClient — after _ready resolves:
if (navigator.onLine) {
	this.triggerReplay();
}
```

To avoid a cold-path DB query on every page load for users who are never offline, the **worker short-circuits `TRIGGER_REPLAY`** if the queue is empty:

```ts
// Inside sync-worker.ts — TRIGGER_REPLAY handler:
// 1. Reset stuck actions.
await withDbLock(() =>
	db.query(
		"UPDATE _sync_actions SET status = 'pending' WHERE status IN ('replaying', 'conflict')",
	),
);
// 2. Pre-seed resolvedIds from done creates still referenced by pending dependents.
//    Covers the page-refresh-mid-replay scenario where a create succeeded but its
//    dependents are still pending — without this, rewriteReferences leaves tmp_xxx unrewritten.
const { rows: doneCreates } = await withDbLock(() =>
	db.query(`
		SELECT a.id AS "actionId",
		       a.temp_id_slot AS "tempIdSlot",
		       a.resolved_real_id AS "resolvedRealId"
		FROM _sync_actions a
		WHERE a.status = 'done'
		  AND a.temp_id_slot IS NOT NULL
		  AND a.resolved_real_id IS NOT NULL
	`),
);
if (doneCreates.length > 0) {
	// Build a set of all action IDs that pending actions depend on.
	const { rows: pending } = await withDbLock(() =>
		db.query(
			"SELECT depends_on FROM _sync_actions WHERE status = 'pending'",
		),
	);
	const neededActionIds = new Set(
		pending.flatMap(
			(r: { depends_on: string }) => JSON.parse(r.depends_on) as string[],
		),
	);
	for (const row of doneCreates) {
		if (neededActionIds.has(row.actionId)) {
			resolvedIds.set(row.tempIdSlot as TempId, row.resolvedRealId);
		}
	}
}
// 3. Short-circuit if nothing to replay.
const { rows } = await withDbLock(() =>
	db.query(
		"SELECT COUNT(*) AS n FROM _sync_actions WHERE status = 'pending'",
	),
);
if (Number(rows[0]!.n) === 0) {
	postMessage({
		type: "REPLAY_DONE",
		resolved: 0,
		failed: 0,
		permanentFailures: [],
	});
	return;
}
// … proceed with full replay
```

No new message type is needed. The host app's `REPLAY_DONE` handler already handles the `{ resolved: 0, failed: 0 }` case gracefully. The startup `triggerReplay()` call is unconditional — the cheap COUNT query inside the worker is the guard, not the caller.

This is the single canonical trigger location for startup replay. `connectivity.ts` handles the online-event path only; no duplication.

---

## Worker Initialisation Handshake

Between `SyncClient` construction and PGlite bootstrap completion, incoming `postMessage` calls must not be lost. `SyncClient` maintains an internal `_ready: Promise<void>` that resolves when the worker posts `{ type: "WORKER_READY" }`. All outbound messages are queued in a `_pendingMessages` array until `_ready` resolves, then flushed in order. The worker posts `WORKER_READY` as the final step of its `onmessage` setup, after PGlite is open and `_sync_actions` is bootstrapped.

---

## Multi-tab Safety (v1)

Two tabs with a DedicatedWorker each, both opening the same IndexedDB PGlite database, risk concurrent write corruption. PGlite has no multi-writer lock. v1 uses the **Web Locks API with per-operation short-lived locks** to serialise concurrent access. Each PGlite call acquires and immediately releases the lock — tabs take turns rather than one tab owning the database for its lifetime.

```ts
// Inside sync-worker.ts — wraps every PGlite operation:
async function withDbLock<T>(fn: () => Promise<T>): Promise<T> {
	return navigator.locks.request(
		"ormi-sync-db",
		{ mode: "exclusive" },
		fn, // lock is held only for the duration of fn(), then released
	);
}

// Usage: every PGlite read or write is wrapped:
await withDbLock(() => db.query("INSERT INTO sync_workspaces ..."));
await withDbLock(() => db.query("SELECT * FROM _sync_actions ..."));
```

This ensures tabs interleave safely. A tab blocked on `withDbLock` will resume as soon as the previous operation completes — no tab starves.

### Multi-step sequence atomicity

Per-operation locks serialise individual queries but do not make multi-step sequences atomic. During replay, between "read local version" and "upsert record", another tab's worker could write the same row. The practical impact is low: the server is the authoritative source, and idempotency keys prevent double-dispatch. Any local DB inconsistency introduced within a replay sequence is corrected by the next online read, which overwrites the local cache with the server's current state. v1 does not attempt to implement distributed transactions over PGlite.

### PGlite initialisation failure fallback

With per-operation `withDbLock()` handling all concurrency, there is no meaningful lock contention at init time — per-operation locks are released immediately after each query, so the lock is always free when a new tab boots. The `memory-only` fallback is triggered by PGlite **failing to open** (e.g. storage quota exceeded, IndexedDB unavailable in the browser), not by lock contention:

```ts
// Worker boot — attempt to open PGlite with IndexedDB persistence.
// Per-operation withDbLock() handles all write serialisation from this point on.
try {
	await initPGlite(); // opens idb://ormi-local-db
	postMessage({ type: "WORKER_READY", mode: "persistent" });
} catch (e) {
	// PGlite failed to open — fall back to transient in-memory instance.
	await initInMemoryPGlite();
	postMessage({ type: "WORKER_READY", mode: "memory-only" });
}
```

`WORKER_READY` message type:

```ts
| { type: "WORKER_READY"; mode: "persistent" | "memory-only" }
```

`SyncClient` propagates the mode to the host app. In `memory-only` mode, action queue durability is lost on tab close. The host app must surface a visible warning — e.g. "Offline changes may not persist — storage unavailable" — not suppress it silently.

---

## TEMP_ID_RESOLVED — UI Update Pattern

When the main thread receives `{ type: "TEMP_ID_RESOLVED", tempId, realId }`, rendered components holding the `tempId` must update. The recommended pattern:

```ts
// apps/web/components/client-providers.tsx — register listener once
syncClient.onMessage((msg) => {
	if (msg.type === "TEMP_ID_RESOLVED") {
		emitTempIdResolved(msg.tempId, msg.realId);
	}
});
```

The package exports a `useTempIdResolution(id)` React hook as a convenience. The hook uses a `SyncEventBus` — an `EventTarget` singleton exported by the package, with no React or framework dependency:

```ts
// packages/ormi-sync/src/client/sync-event-bus.ts
export const syncEventBus = new EventTarget();

export function emitTempIdResolved(tempId: string, realId: string | number) {
	syncEventBus.dispatchEvent(
		Object.assign(new Event("tempIdResolved"), { tempId, realId }),
	);
}
```

```ts
// packages/ormi-sync/src/index.ts
export function useTempIdResolution(id: string | number): string | number {
	const [resolved, setResolved] = useState(id);
	useEffect(() => {
		setResolved(id); // reset when id prop changes — prevents stale resolved state
		// when a component re-renders with a new record in the same slot
		const handler = (e: Event) => {
			const ev = e as Event & { tempId: string; realId: string | number };
			if (ev.tempId === String(id)) setResolved(ev.realId);
		};
		syncEventBus.addEventListener("tempIdResolved", handler);
		return () =>
			syncEventBus.removeEventListener("tempIdResolved", handler);
	}, [id]);
	return resolved;
}
```

`sync-event-bus.ts` is added to the file structure under `client/`. `SyncClient` calls `emitTempIdResolved` when it receives a `TEMP_ID_RESOLVED` message from the worker. No host app wiring required beyond mounting `SyncClient`.

Components that render records obtained from an offline create wrap their ID references with this hook. Components that do not use offline creates are unaffected.

---

## Implementation Order

1. **`types.ts`** — all contracts (`ApiResult`, `Action`, `SyncConfig`, messages)
2. **`worker/local-db.ts`** — PGlite wrapper, resource name sanitization, `_sync_actions` table, CRUD helpers, filter implementation
3. **`worker/action-queue.ts`** — enqueue (with validation), load, topological sort, collapse
4. **`client/sync-client.ts`** + **`client/sync-event-bus.ts`** — postMessage bridge, `_ready` handshake, startup replay trigger, message queue buffering, `SyncClient.init(options)` where `options` is `{ workerHeaders, maxRetries, backoffBase }`; `EventTarget`-based event bus singleton
5. **`proxy/with-offline.ts`** — Proxy factory wired to `SyncClient` (testable with stub worker before real worker exists)
6. **`worker/replay-engine.ts`** — temp-ID rewrite, pre-flight conflict check, retry logic, replay loop
7. **`worker/sync-worker.ts`** — DedicatedWorker entrypoint: Web Locks guard, PGlite init, wires queue + replay engine, posts `WORKER_READY`
8. **`client/connectivity.ts`** — online/offline event wiring, triggers replay
9. **`index.ts`** — public exports including `useTempIdResolution` hook
10. **Backend: idempotency middleware** + Prisma migration
11. **Wire API wrappers**: add `withOffline(...)` to `workspace-api.ts`, `categories-api.ts`, `template-api.ts`, `dashboard-api.ts`; update imports of `ApiResult` to come from `@workspace/ormi-sync`

---

## Out of Scope (v1)

- Multi-tab coordination (SharedWorker)
- Background sync via Service Worker
- Per-field conflict merging
- Server-to-client push / real-time invalidation
- Offline support for plugin datasources
