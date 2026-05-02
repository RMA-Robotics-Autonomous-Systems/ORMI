/**
 * HTTP result types — owned by ormi-sync.
 * Host app's HttpClient imports these from '@workspace/ormi-sync'.
 */
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = { ok: false; error: string; details?: unknown };
export type ApiResult<T> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// TempId helpers
// ---------------------------------------------------------------------------

/** A stable temp ID used for optimistic records before the server assigns a real ID. */
export type TempId = `tmp_${string}`;

export function isTempId(id: unknown): id is TempId {
	return typeof id === "string" && id.startsWith("tmp_");
}

export function makeTempId(): TempId {
	return `tmp_${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

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
	 * Used for conflict detection on replay. Only set for 'update' and 'patch' actions.
	 */
	baseVersion?: unknown;
	/** Timestamp when the action was enqueued. */
	enqueuedAt: number;
	status: "pending" | "replaying" | "conflict" | "done" | "failed";
}

// ---------------------------------------------------------------------------
// SyncConfig
// ---------------------------------------------------------------------------

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
	 *   - Online: log a warning, call the original method directly, skip offline support.
	 *   - Offline: return an ApiResult error — do not call the original method.
	 */
	actions?: Record<string, ActionDescriptor>;
}

// ---------------------------------------------------------------------------
// ActionDescriptor
// ---------------------------------------------------------------------------

/**
 * Describes how to build a replayable Action from a method's positional arguments.
 * Provided once per mutating method in SyncConfig.actions.
 *
 * Extractor functions are called on the main thread at interception time and are never
 * serialised — only their plain-data output is stored in the Action record.
 * Extractors must be pure, synchronous, and cheap — no network calls, no side effects.
 *
 * Type safety: cast arguments as needed:
 *   (...args) => { const [id] = args as [number]; return { id }; }
 *
 * URL template drift: keep urlTemplate in sync with the URL used in the original method body.
 */
export interface ActionDescriptor {
	/** URL template with :param placeholders, e.g. '/api/workspaces/:id'. */
	urlTemplate: string;
	/** Action.method value stored in the queue. */
	actionMethod: "create" | "update" | "patch" | "delete" | "reorder";
	/**
	 * Extracts URL path parameters from the method's positional arguments.
	 * Return value is stored as Action.urlParams.
	 *
	 * For update, patch, and delete methods, the returned object must include
	 * the target record's local primary key value under the same field name as
	 * SyncConfig.primaryKey (defaults to 'id'). The proxy uses that value for
	 * optimistic local updates and baseVersion lookup.
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

// ---------------------------------------------------------------------------
// LocalQuery
// ---------------------------------------------------------------------------

export interface LocalQuery {
	filter?: Record<string, unknown>;
	orderBy?: string;
	limit?: number;
}

// ---------------------------------------------------------------------------
// Worker messages: main thread → worker
// ---------------------------------------------------------------------------

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
			primaryKey?: string;
			versionKey?: string | null;
			requestId?: string;
	  }
	| {
			type: "LOCAL_MERGE";
			resource: string;
			id: string;
			partial: Record<string, unknown>;
			primaryKey?: string;
			versionKey?: string | null;
			requestId?: string;
	  }
	| {
			type: "LOCAL_DELETE";
			resource: string;
			id: string;
			primaryKey?: string;
			requestId?: string;
	  }
	| { type: "TRIGGER_REPLAY" }
	| {
			type: "RESOLVE_CONFLICT";
			actionId: string;
			resolution: "keep-local" | "use-server";
	  }
	| { type: "SET_HEADERS"; headers: Record<string, string> }
	| { type: "GET_PENDING_CREATES"; requestId: string };

// ---------------------------------------------------------------------------
// Worker messages: worker → main thread
// ---------------------------------------------------------------------------

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
			type: "PENDING_CREATES_RESULT";
			requestId: string;
			creates: Array<{ tempIdSlot: TempId; actionId: string }>;
	  };
