/**
 * C2 REST response interpretation (pure, testable).
 *
 * The C2 backends are mid-migration, so this plugin has to read BOTH shapes of
 * every answer without knowing which side it is talking to:
 *
 * | | old backend (running containers) | new backend (uncommitted) |
 * |---|---|---|
 * | failure status | frequently **200** with an error string | proper **4xx/5xx** |
 * | `:5001` failure body | `"Mission not found"` (plain text) | `{"status":"error","code":"…","message":"…"}` |
 * | `:5001` success body | plain text | **still plain text** (the endpoint is MIXED) |
 * | `:5000` failure body | `{"error":"text"}` | `{"error":{"code","message"}}` — and the older `{"error":"text"}` survives on the pre-existing map routes, so `:5000` is MIXED too |
 *
 * Both generations are live during cut-over (the backend changes are uncommitted
 * and the running containers are not rebuilt), so neither shape may be assumed.
 *
 * The rules implemented here, in order:
 *  1. **Any non-2xx is a failure**, whatever the body says. The body is only
 *     consulted for the *message*.
 *  2. A JSON error body is unwrapped to its human message
 *     ({@link extractErrorMessage}) — `error` / `message` / `detail` / `reason`,
 *     plus a nested `error.message`. A plain-text body is used verbatim.
 *  3. A **2xx** whose JSON body *explicitly* declares failure
 *     (`success: false`, `ok: false`, or a non-empty `error`) is ALSO a failure
 *     ({@link bodyDeclaresFailure}). This is what catches the old backend's
 *     "HTTP 200 + error string" habit without misreading the new one.
 *  4. A **2xx** plain-text body on a **command** (`:5001` `change_status` /
 *     `initialize`) that reads as a refusal ({@link commandTextDeclaresFailure}
 *     — the old backend's `200 "Mission not found"`) is a failure. Command
 *     replies are fixed strings, never operator data, so matching their prose is
 *     safe there; a `db`-scope body can carry a mission *name* containing
 *     "error", so this rule never applies to it. Any other 2xx stays a success:
 *     "sent", which the control panel then holds as unconfirmed until mission
 *     feedback moves.
 *
 * Keep this module free of `fetch`/React so the matrix above can be unit-tested.
 */

import type { C2CallScope } from "./remote-calls";

/** Keys a C2 error body may carry its human message under, in priority order. */
const ERROR_KEYS = ["error", "message", "detail", "reason", "msg"] as const;

/**
 * Stable machine-readable error codes the C2 backends emit.
 *
 * ⚠ BRANCH ON THESE, NEVER ON MESSAGE TEXT. The messages are human-facing and
 * may be reworded; the codes are the contract.
 */
export const C2ErrorCode = {
	// :5001 — 400
	InvalidJson: "INVALID_JSON",
	MissingField: "MISSING_FIELD",
	UnknownAction: "UNKNOWN_ACTION",
	InvalidRequestedState: "INVALID_REQUESTED_STATE",
	InvalidMissionId: "INVALID_MISSION_ID",
	MissionIdMismatch: "MISSION_ID_MISMATCH",
	InvalidMissionConfig: "INVALID_MISSION_CONFIG",
	// :5001 — 401 / 409 / 500 / 503
	Unauthorized: "UNAUTHORIZED",
	/** 409 — the C2 had no mission to act on. Was a FALSE 200 before. */
	NoTargetMission: "NO_TARGET_MISSION",
	/**
	 * 409 — approve/start refused: one or more of the mission's vehicles is
	 * leased by another mission (the C2 "robot lock"). The body carries an extra
	 * `conflicts: [{vehicle_id, mission_id}]` — read it with
	 * {@link extractC2Conflicts}.
	 */
	VehicleBusy: "VEHICLE_BUSY",
	PublishFailed: "PUBLISH_FAILED",
	InternalError: "INTERNAL_ERROR",
	AuthNotConfigured: "AUTH_NOT_CONFIGURED",
	RosInterfaceUnavailable: "ROS_INTERFACE_UNAVAILABLE",
	// :5000
	MissionNotFound: "MISSION_NOT_FOUND",
	InvalidBody: "INVALID_BODY",
} as const;

/** One of the {@link C2ErrorCode} values. */
export type C2ErrorCodeValue = (typeof C2ErrorCode)[keyof typeof C2ErrorCode];

/** Truncate a body snippet so a stray HTML error page can't flood the UI. */
const MAX_SNIPPET = 300;

/** Whether `value` is a plain JSON object (not null, not an array). */
function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trim + cap a message, returning null when nothing meaningful is left. */
function clean(value: string | undefined | null): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	return trimmed.length > MAX_SNIPPET
		? `${trimmed.slice(0, MAX_SNIPPET)}…`
		: trimmed;
}

/**
 * Pull the human-readable message out of a parsed C2 response body.
 *
 * Handles the structured shapes the new backend returns
 * (`{error}` / `{message}` / `{detail}` / `{error:{message}}`), a bare string
 * body (the old backend), and anything else (returns null so the caller falls
 * back to the raw text / status line).
 *
 * @param data - The parsed body (object, string, or anything).
 * @returns The message, or null when the body carries none.
 */
export function extractErrorMessage(data: unknown): string | null {
	if (typeof data === "string") return clean(data);
	if (!isJsonObject(data)) return null;

	for (const key of ERROR_KEYS) {
		const value = data[key];
		const direct = clean(typeof value === "string" ? value : null);
		if (direct) return direct;
		// `{"error": {"message": "...", "code": 12}}`
		if (isJsonObject(value)) {
			for (const nested of ERROR_KEYS) {
				const inner = value[nested];
				const message = clean(typeof inner === "string" ? inner : null);
				if (message) return message;
			}
		}
	}
	// `{"errors": ["a", "b"]}` — a validation list.
	const errors = data.errors;
	if (Array.isArray(errors)) {
		const parts = errors
			.map((entry) =>
				typeof entry === "string"
					? clean(entry)
					: extractErrorMessage(entry),
			)
			.filter((part): part is string => part != null);
		if (parts.length > 0) return clean(parts.join("; "));
	}
	return null;
}

/**
 * Whether a **2xx** body explicitly declares a failure.
 *
 * Only an unambiguous, machine-readable declaration counts: `success: false`,
 * `ok: false`, or a non-empty `error` / `errors`. A prose success string (the
 * old backend's `"Mission initialized successfully!"`) and an ordinary data
 * payload both return false — we never infer failure from free text, because
 * that would turn every mission whose *name* contains "error" into an outage.
 *
 * @param data - The parsed 2xx body.
 * @returns True when the body says the operation failed.
 */
export function bodyDeclaresFailure(data: unknown): boolean {
	if (!isJsonObject(data)) return false;
	if (data.success === false) return true;
	if (data.ok === false) return true;
	// The new `:5001` error envelope: `{"status":"error","code":…,"message":…}`.
	if (data.status === "error") return true;
	if (typeof data.error === "string" && data.error.trim().length > 0) {
		return true;
	}
	if (isJsonObject(data.error)) return true;
	if (Array.isArray(data.errors) && data.errors.length > 0) return true;
	return false;
}

/**
 * Refusal wording in a `:5001` plain-text reply. The old backend answers a
 * command it could not act on with HTTP 200 and prose (`"Mission not found"`);
 * its success replies (`"Mission initialized successfully!"`, `"status change
 * requested"`) match none of these.
 */
const COMMAND_FAILURE_TEXT =
	/not found|no mission|no target|error|fail|invalid|not allowed|refused|denied|unauthori[sz]ed/i;

/**
 * Whether a **2xx** plain-text reply to a command declares that it failed.
 *
 * Only meaningful for `command`-scope calls: their replies are fixed backend
 * strings. A JSON body is judged by {@link bodyDeclaresFailure} instead.
 *
 * @param data - The parsed 2xx body.
 * @returns True when the body is text that reads as a refusal.
 */
export function commandTextDeclaresFailure(data: unknown): boolean {
	return typeof data === "string" && COMMAND_FAILURE_TEXT.test(data);
}

/**
 * Pull the stable machine-readable error code out of a parsed body.
 *
 * Reads both current shapes:
 *  - `:5001` → `{ "status": "error", "code": "NO_TARGET_MISSION", "message": … }`
 *  - `:5000` → `{ "error": { "code": "MISSION_NOT_FOUND", "message": … } }`
 *
 * Returns null for the old plain-text bodies and for `:5000`'s legacy
 * `{"error":"text"}` map-route shape, which carry no code at all — callers must
 * therefore treat a null code as "unknown", never as "not that error".
 *
 * @param data - The parsed response body.
 * @returns The code, or null.
 */
export function extractErrorCode(data: unknown): string | null {
	if (!isJsonObject(data)) return null;
	const direct = data.code;
	if (typeof direct === "string" && direct.trim().length > 0) {
		return direct.trim();
	}
	const nested = data.error;
	if (isJsonObject(nested) && typeof nested.code === "string") {
		const code = nested.code.trim();
		if (code.length > 0) return code;
	}
	return null;
}

/**
 * Rewrite an auth or availability failure into text an operator can act on.
 *
 * Auth now FAILS CLOSED: with no token configured on either side, every mutation
 * is refused. Reported as a bare "HTTP 401" — or worse, folded into a validation
 * message — that reads to an operator as "the mission is wrong" or "the backend
 * is down", and they will go looking in entirely the wrong place. These three
 * cases name the actual problem and where the fix lives.
 *
 * @param status - The HTTP status.
 * @param code - The stable error code, when the body carried one.
 * @param message - The server's human message.
 * @param data - The parsed body (optional; only `VEHICLE_BUSY` reads it, for
 *   its `conflicts`).
 * @returns The operator-facing text.
 */
export function friendlyC2Error(
	status: number,
	code: string | null,
	message: string,
	data?: unknown,
): string {
	// Branch on the CODE: a bare 503 (a proxy, a restarting container) is not
	// evidence of a missing token and must not be reported as one.
	if (code === C2ErrorCode.RosInterfaceUnavailable) {
		return `The C2 cannot reach ROS right now, so the command was not issued (ROS_INTERFACE_UNAVAILABLE).`;
	}
	if (code === C2ErrorCode.AuthNotConfigured) {
		return `The C2 has no API token configured, so it refuses every write (AUTH_NOT_CONFIGURED). Set C2_API_TOKEN on the backend — this is a server-side setting, not something the mission config can fix.`;
	}
	if (code === C2ErrorCode.Unauthorized || status === 401) {
		return `Not authorised by the C2 (UNAUTHORIZED). Set the "Mission Control auth token" on the C2 Control datasource to the backend's C2_API_TOKEN.`;
	}
	if (code === C2ErrorCode.NoTargetMission) {
		// The defect this replaces: a false 200 "status change requested".
		return `The C2 had no target mission, so the command did NOT happen (NO_TARGET_MISSION). Submit the mission first, then retry.`;
	}
	if (code === C2ErrorCode.VehicleBusy) {
		// Ids only here (the transport knows no names); the control panel
		// re-formats with names via `formatVehicleBusy` + a resolver. With no
		// `conflicts` array the server's own message stands (HTTP-prefixed).
		return formatVehicleBusy(extractC2Conflicts(data)) ?? message;
	}
	if (code === C2ErrorCode.InvalidBody) {
		return `The C2 rejected the request body as unsafe (INVALID_BODY) — it contains a key starting with "$" or containing ".". Remove it from the mission config.`;
	}
	return message;
}

/** One `VEHICLE_BUSY` conflict: `vehicle_id` is leased by `mission_id`. */
export interface C2VehicleConflict {
	vehicle_id: string;
	/** The mission holding the vehicle; "" when the server did not say. */
	mission_id: string;
}

/**
 * Pull the `conflicts` list out of a `VEHICLE_BUSY` body.
 *
 * Reads the top-level `:5001` shape (`{status,code,message,conflicts}`) and,
 * defensively, a nested `{error:{…,conflicts}}`. Malformed entries (no string
 * `vehicle_id`) are dropped; a missing `mission_id` becomes "".
 *
 * @param data - The parsed response body.
 * @returns The conflicts, possibly empty — never null.
 */
export function extractC2Conflicts(data: unknown): C2VehicleConflict[] {
	if (!isJsonObject(data)) return [];
	const raw = Array.isArray(data.conflicts)
		? data.conflicts
		: isJsonObject(data.error) && Array.isArray(data.error.conflicts)
			? data.error.conflicts
			: null;
	if (!raw) return [];
	const out: C2VehicleConflict[] = [];
	for (const entry of raw) {
		if (!isJsonObject(entry)) continue;
		const vehicle =
			typeof entry.vehicle_id === "string" ? entry.vehicle_id.trim() : "";
		if (!vehicle) continue;
		const mission =
			typeof entry.mission_id === "string" ? entry.mission_id.trim() : "";
		out.push({ vehicle_id: vehicle, mission_id: mission });
	}
	return out;
}

/**
 * Optional id → name lookups for {@link formatVehicleBusy}. Each returns the
 * human name, or null/undefined/"" when it does not know the id (the formatter
 * then shows the raw id).
 */
export interface C2ConflictNameResolver {
	vehicleName?: (vehicleId: string) => string | null | undefined;
	missionName?: (missionId: string) => string | null | undefined;
}

/** Resolve through `lookup`, falling back to the raw id. */
function nameOr(
	id: string,
	lookup: ((id: string) => string | null | undefined) | undefined,
): string {
	const name = lookup?.(id);
	return typeof name === "string" && name.trim().length > 0
		? name.trim()
		: id;
}

/**
 * The operator-facing text for a `VEHICLE_BUSY` refusal:
 * `Vehicle busy: <vehicle> is used by mission <mission>` per conflict, joined
 * with "; ", then what it means. Names come from `resolver` when it knows the
 * id; otherwise the id itself is shown.
 *
 * @param conflicts - From {@link extractC2Conflicts}.
 * @param resolver - Optional id → name lookups.
 * @returns The message, or null when there are no conflicts to describe.
 */
export function formatVehicleBusy(
	conflicts: C2VehicleConflict[],
	resolver?: C2ConflictNameResolver,
): string | null {
	if (conflicts.length === 0) return null;
	const lines = conflicts.map((c) => {
		const vehicle = nameOr(c.vehicle_id, resolver?.vehicleName);
		const mission = c.mission_id
			? `mission ${nameOr(c.mission_id, resolver?.missionName)}`
			: "another mission";
		return `Vehicle busy: ${vehicle} is used by ${mission}`;
	});
	const holders = new Set(conflicts.map((c) => c.mission_id)).size;
	return (
		`${lines.join("; ")}. The command was NOT applied (VEHICLE_BUSY) — ` +
		`stop or finish ${holders > 1 ? "those missions" : "that mission"} first, then retry.`
	);
}

/** The outcome of interpreting one C2 REST response. */
export interface C2ResponseOutcome {
	/** Whether the call succeeded (rule 1 + rule 3 above). */
	success: boolean;
	/** The operator-facing error message, or undefined on success. */
	error?: string;
	/**
	 * The stable machine-readable code, when the body carried one. Null for the
	 * old plain-text bodies — treat null as "unknown", not as "not that error".
	 */
	code?: string | null;
	/** `VEHICLE_BUSY` only: the parsed `conflicts` (omitted when none). */
	conflicts?: C2VehicleConflict[];
}

/**
 * Interpret one C2 REST response against both backend generations.
 *
 * @param status - The HTTP status code.
 * @param statusText - The HTTP status text (fallback message).
 * @param text - The raw response body text.
 * @param data - The parsed body (`JSON.parse(text)`, else `text`, else null).
 * @param scope - The call's surface; `command` enables rule 4. Omitted → `db`.
 * @returns Whether the call succeeded, plus the message when it did not.
 */
export function interpretC2Response(
	status: number,
	statusText: string,
	text: string,
	data: unknown,
	scope: C2CallScope = "db",
): C2ResponseOutcome {
	const httpOk = status >= 200 && status < 300;
	const code = extractErrorCode(data);

	if (!httpOk) {
		// Rule 1+2: non-2xx is always a failure; the body only supplies wording.
		const message =
			extractErrorMessage(data) ??
			clean(text) ??
			clean(statusText) ??
			"request failed";
		const friendly = friendlyC2Error(status, code, message, data);
		const conflicts = extractC2Conflicts(data);
		return {
			success: false,
			// An auth/availability failure gets its own wording with no HTTP
			// prefix — "HTTP 503" in front of it buries the actionable part.
			error:
				friendly === message ? `HTTP ${status}: ${message}` : friendly,
			code,
			...(conflicts.length > 0 ? { conflicts } : {}),
		};
	}

	// Rule 3: a 2xx that explicitly declares failure in a structured body.
	if (bodyDeclaresFailure(data)) {
		const message =
			extractErrorMessage(data) ?? "the C2 reported a failure";
		const conflicts = extractC2Conflicts(data);
		return {
			success: false,
			error: friendlyC2Error(status, code, message, data),
			code,
			...(conflicts.length > 0 ? { conflicts } : {}),
		};
	}

	// Rule 4: the old backend's 200 + refusal prose, on a command only.
	if (scope === "command" && commandTextDeclaresFailure(data)) {
		const message = clean(text) ?? "the C2 reported a failure";
		return {
			success: false,
			error: `The C2 refused the command: "${message}".`,
			code: null,
		};
	}

	return { success: true, code: null };
}

/**
 * The stable error code of a completed remote call, read from its parsed body.
 *
 * `RemoteCallResult` is an ORMI-core type this plugin does not own, so the code
 * is not added to it; the transport keeps the parsed body in `data`, and this
 * re-reads it. Null for success, for the old plain-text bodies and for `:5000`'s
 * legacy `{"error":"text"}` shape — treat null as "unknown".
 *
 * @param result - A remote-call result.
 * @returns The code, or null.
 */
export function c2ResultCode(result: {
	success: boolean;
	data?: unknown;
}): string | null {
	if (result.success) return null;
	return extractErrorCode(result.data);
}

/**
 * The `VEHICLE_BUSY` conflicts of a completed remote call, re-read from its
 * parsed body (same reasoning as {@link c2ResultCode}: `RemoteCallResult` is an
 * ORMI-core type, and the transport already keeps the whole body in `data`, so
 * the `conflicts` array survives the round-trip untouched).
 *
 * @param result - A remote-call result.
 * @returns The conflicts; empty on success or when the body carries none.
 */
export function c2ResultConflicts(result: {
	success: boolean;
	data?: unknown;
}): C2VehicleConflict[] {
	if (result.success) return [];
	return extractC2Conflicts(result.data);
}
