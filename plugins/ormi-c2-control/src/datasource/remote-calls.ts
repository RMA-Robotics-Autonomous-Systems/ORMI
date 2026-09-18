import type { JsonSchema } from "@jsonforms/core";
import type { RemoteCallDefinition } from "@workspace/ormi-core/datasources";

import { C2ControlSettings, MissionStatusRequest } from "../types/c2-types";

/**
 * The C2 remote-call catalog (single source of truth).
 *
 * Each spec yields one `RemoteCallDefinition` (for discovery + auto-forms) AND
 * the REST round-trip (`build` → `{ url, init }`). The actual `fetch` lives in
 * `rest.ts` — this file only describes calls.
 *
 * ⚠ `:5001 change_status` DOES carry `mission_id`, deliberately. It used to be
 * omitted (the backend then commanded whatever it had last `initialize`d, which
 * is nothing at all after a `c2-backend-ros2-node` restart — a running mission
 * became unstoppable). The backend now honours `mission_id` and falls back to the
 * old global only when it is absent, so every command names its target. Do not
 * remove it. `c2.mission.init` additionally double-serializes `mission_config`
 * into a JSON string inside the request JSON.
 *
 * ⚠ TIMEOUTS — every spec carries a {@link C2CallSpec.timeoutMs}, applied by the
 * transport. No call site passes one, and a call with no timeout leaves
 * `useAsyncAction`'s latch engaged forever against a black-holed backend, which
 * disables every button in the widget. See {@link READ_TIMEOUT_MS} /
 * {@link COMMAND_TIMEOUT_MS}.
 */

/**
 * Timeout for a read (`GET`) — the operator is waiting on a list; a C2 that has
 * not answered in this long is not about to.
 */
export const READ_TIMEOUT_MS = 8_000;

/**
 * Timeout for a write or lifecycle command. Longer than a read: `initialize`
 * hands the config to the planner before answering, and a bulk feature import
 * can carry thousands of ways.
 */
export const COMMAND_TIMEOUT_MS = 15_000;

/** Stable call ids — widgets reference these via `findRemoteCall(name, dsId)`. */
export const C2Call = {
	MissionInit: "c2.mission.init",
	MissionApprove: "c2.mission.approve",
	MissionStart: "c2.mission.start",
	MissionPause: "c2.mission.pause",
	MissionStop: "c2.mission.stop",
	MissionDelete: "c2.mission.delete",
	MissionsList: "c2.missions.list",
	MissionsSave: "c2.missions.save",
	MissionsDelete: "c2.missions.delete",
	MapsList: "c2.maps.list",
	MapsCreate: "c2.maps.create",
	MapsDelete: "c2.maps.delete",
	MapFeaturesList: "c2.map.features.list",
	MapFeaturesAdd: "c2.map.features.add",
	MapFeaturesUpdate: "c2.map.features.update",
	MapFeaturesDelete: "c2.map.features.delete",
	PlannerStatus: "c2.planner.status",
	PlannerGraph: "c2.planner.graph",
	VehiclesList: "c2.vehicles.list",
	FeedbackLatest: "c2.feedback.latest",
	FeedbackGet: "c2.feedback.get",
} as const;

export interface C2BuiltRequest {
	url: string;
	init: RequestInit;
}

/**
 * Which C2 surface a call talks to.
 *
 * `command` → the C++ REST service on `missionControlUrl` (`:5001`), which
 * requires the auth token on every request. `db` → the Mongo REST service on
 * `dbUrl` (`:5000`), which requires it on mutations only. The distinction is
 * what keeps the token off the DB host's reads (see {@link requiresC2Auth}),
 * and it also decides whether a call may be cancelled: a command's outcome is
 * unknown once its POST has left.
 */
export type C2CallScope = "command" | "db";

export interface C2CallSpec {
	name: string;
	description: string;
	requestSchema: JsonSchema;
	/** Which C2 surface this call targets (drives auth + default timeout). */
	scope: C2CallScope;
	/** Default request timeout in ms, applied by the transport (`rest.ts`). */
	timeoutMs: number;
	/** Turn a request payload into a concrete REST round-trip. */
	build: (
		settings: C2ControlSettings,
		request: Record<string, unknown>,
	) => C2BuiltRequest;
	/**
	 * Optional pre-flight check run by the transport BEFORE the fetch.
	 *
	 * Returns an operator-facing message to fail with, or null to proceed. It
	 * exists so a request the backend is now certain to reject
	 * (`MISSION_ID_MISMATCH`, `INVALID_MISSION_ID`, `INVALID_BODY`) is refused
	 * here, naming the actual field — the server's code alone does not say WHICH
	 * of two mission ids disagreed, or which key tripped the injection guard.
	 */
	validate?: (request: Record<string, unknown>) => string | null;
}

/**
 * Apply the optional C2 auth token to a request's headers.
 *
 * One token, two surfaces: the new backend FAILS CLOSED, and `:5001` requires
 * the token on every request while `:5000` requires it on every mutation
 * (POST/PUT/PATCH/DELETE — GET stays open). See {@link requiresC2Auth}. The token is sent only when the
 * operator has configured one, so:
 *  - against the old backend still running in the containers, nothing changes
 *    (no token → no headers; a configured token is an ignored header);
 *  - against the new backend the operator fills in the datasource field and the
 *    same client authenticates, with no code change.
 *
 * The backend accepts EITHER spelling; both are sent so the request works against
 * a server configured for either:
 *  - `Authorization: Bearer <token>`
 *  - `X-C2-Token: <token>`
 *
 * ⚠ CORS — both are non-simple headers, so every authenticated request is
 * preflighted and the server must list them in `Access-Control-Allow-Headers`
 * (the backend does). The ORMI origin must also be in the backend's
 * `C2_ALLOWED_ORIGINS` allowlist or the browser blocks reading the response, and
 * the symptom is indistinguishable from "the backend is down".
 *
 * @param settings - The C2 datasource settings.
 * @param scope - The call's surface.
 * @param method - The HTTP method (decides whether a `db` call needs the token).
 * @param headers - The headers the spec built.
 * @returns The headers, plus the auth pair when applicable.
 */
export function applyC2Auth(
	settings: C2ControlSettings,
	scope: C2CallScope,
	method: string | undefined,
	headers: Record<string, string>,
): Record<string, string> {
	const token = settings.missionControlToken?.trim();
	if (!token) return headers;
	if (!requiresC2Auth(scope, method)) return headers;
	return {
		...headers,
		Authorization: `Bearer ${token}`,
		"X-C2-Token": token,
	};
}

/**
 * Whether a call must carry the token, per the backend's rules.
 *
 * `:5001` — **every** request, including the `OPTIONS` preflight.
 * `:5000` — every **mutating** request (POST/PUT/PATCH/DELETE). GET stays open.
 *
 * GETs are deliberately left bare rather than "authenticated anyway for
 * simplicity": an `Authorization` header makes a request non-simple and forces a
 * CORS preflight, so blanket-attaching it would double the round trips on the
 * read path (the maps list, the features list, the 5 s planner-status poll) for
 * a credential the server does not check there.
 *
 * @param scope - The call's surface.
 * @param method - The HTTP method (undefined is treated as GET, per `fetch`).
 * @returns True when the token must be sent.
 */
export function requiresC2Auth(
	scope: C2CallScope,
	method: string | undefined,
): boolean {
	if (scope === "command") return true;
	const verb = (method ?? "GET").toUpperCase();
	return verb !== "GET" && verb !== "HEAD";
}

/**
 * Find the first key anywhere in `value` that the backend's NoSQL-injection
 * guard would reject: a `$`-prefixed key, or a key containing a `.`.
 *
 * `:5000` now answers `400 INVALID_BODY` for these. A mission config is largely
 * operator-authored passthrough, so a stray Mongo-shaped key can reach a save
 * without anyone typing it deliberately — the map/editor spread unknown stored
 * fields through verbatim. Catching it here names the offending key instead of
 * leaving the operator with an opaque 400 on a config that looks fine.
 *
 * @param value - Any JSON-safe value.
 * @param path - Internal: the path walked so far.
 * @returns The offending key's path, or null when the body is safe.
 */
export function findUnsafeMongoKey(value: unknown, path = ""): string | null {
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i += 1) {
			const found = findUnsafeMongoKey(value[i], `${path}[${i}]`);
			if (found) return found;
		}
		return null;
	}
	if (value === null || typeof value !== "object") return null;
	for (const [key, child] of Object.entries(value)) {
		const here = path ? `${path}.${key}` : key;
		if (key.startsWith("$") || key.includes(".")) return here;
		const found = findUnsafeMongoKey(child, here);
		if (found) return found;
	}
	return null;
}

/** The all-zero UUID, which the C2 now rejects everywhere. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Whether a mission id is one the C2 will refuse outright.
 *
 * The nil UUID used to be accepted and is now rejected everywhere, so a mission
 * carrying one can no longer be initialized. Caught client-side because the
 * server's `INVALID_MISSION_ID` does not say which of the two ids was at fault.
 *
 * @param id - The mission id to check.
 * @returns True when the id is empty or the nil UUID.
 */
export function isRejectedMissionId(id: unknown): boolean {
	if (typeof id !== "string") return true;
	const trimmed = id.trim();
	return trimmed.length === 0 || trimmed.toLowerCase() === NIL_UUID;
}

/**
 * The mission id a request names, trimmed — or null when it names none.
 *
 * Validation judges the trimmed id ({@link isRejectedMissionId}), so the wire
 * must carry the same trimmed id: an id that passed as `"m-1"` and was sent as
 * `" m-1"` names a mission the C2 does not have.
 */
function requestMissionId(
	req: Record<string, unknown> | undefined,
): string | null {
	const id = req?.mission_id;
	if (typeof id !== "string") return null;
	const trimmed = id.trim();
	return trimmed.length > 0 ? trimmed : null;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const empty: JsonSchema = { type: "object", properties: {} };
const enc = encodeURIComponent;

/** POST :5001/mission_control with a change_status command. */
function changeStatus(
	name: string,
	description: string,
	state: MissionStatusRequest,
): C2CallSpec {
	return {
		name,
		description,
		scope: "command",
		timeoutMs: COMMAND_TIMEOUT_MS,
		validate: (req) =>
			isRejectedMissionId(req?.mission_id)
				? "No valid target mission — select a mission first. An untargeted command is refused by the C2 (NO_TARGET_MISSION) or, on the old backend, silently acts on whatever was last initialized."
				: null,
		// Target the mission explicitly. :5001 used to ignore mission_id and
		// command whatever was last initialized THROUGH THAT NODE - which is
		// nothing at all after a c2-backend-ros2-node restart, so a running
		// mission became unstoppable. The backend now honours mission_id and
		// falls back to the old behaviour when it is absent.
		requestSchema: {
			type: "object",
			properties: {
				mission_id: { type: "string", title: "Mission ID" },
			},
		},
		build: (s, req) => {
			const missionId = requestMissionId(req);
			return {
				url: `${s.missionControlUrl}/mission_control`,
				init: {
					method: "POST",
					headers: JSON_HEADERS,
					body: JSON.stringify({
						action: "change_status",
						requested_state: state,
						...(missionId ? { mission_id: missionId } : {}),
					}),
				},
			};
		},
	};
}

/** The catalog. */
export const C2_CALL_SPECS: C2CallSpec[] = [
	{
		name: C2Call.MissionInit,
		description: "Submit a mission config to the C2 (initialize → plan).",
		scope: "command",
		timeoutMs: COMMAND_TIMEOUT_MS,
		validate: (req) => {
			if (isRejectedMissionId(req.mission_id)) {
				return "This mission has no valid id (empty or the nil UUID), which the C2 rejects. Duplicate it to get a fresh id.";
			}
			const missionId = requestMissionId(req);
			const cfg = req.mission_config as
				{ mission_id?: unknown } | undefined;
			// The backend now requires top-level mission_id === mission_config.mission_id
			// (400 MISSION_ID_MISMATCH). A config with NO id is stamped in `build`;
			// a config with a DIFFERENT id is a real inconsistency and is refused.
			if (
				cfg &&
				typeof cfg.mission_id === "string" &&
				cfg.mission_id.trim() !== missionId
			) {
				return `Mission id mismatch: submitting "${String(missionId)}" but its config says "${cfg.mission_id}". The C2 refuses this (MISSION_ID_MISMATCH).`;
			}
			const bad = findUnsafeMongoKey(req.mission_config);
			return bad
				? `The mission config contains the key "${bad}", which the C2 rejects ("$"-prefixed or dotted keys). Remove it and retry.`
				: null;
		},
		requestSchema: {
			type: "object",
			properties: {
				mission_id: { type: "string", title: "Mission ID" },
				mission_config: { type: "object", title: "Mission Config" },
			},
			required: ["mission_id", "mission_config"],
		},
		build: (s, req) => {
			const missionId = requestMissionId(req) ?? req.mission_id;
			return {
				url: `${s.missionControlUrl}/mission_control`,
				init: {
					method: "POST",
					headers: JSON_HEADERS,
					body: JSON.stringify({
						action: "initialize",
						mission_id: missionId,
						// double-serialized: mission_config is a JSON string inside the request JSON.
						// Its mission_id is stamped to the top-level one (the backend requires
						// them equal; `validate` has already refused a genuine disagreement).
						mission_config: JSON.stringify({
							...((req.mission_config as Record<
								string,
								unknown
							>) ?? {}),
							mission_id: missionId,
						}),
					}),
				},
			};
		},
	},
	changeStatus(
		C2Call.MissionApprove,
		"Approve the active mission (dispatch tasks to edge).",
		MissionStatusRequest.APPROVE,
	),
	changeStatus(
		C2Call.MissionStart,
		"Start the active mission.",
		MissionStatusRequest.START,
	),
	changeStatus(
		C2Call.MissionPause,
		"Pause the active mission.",
		MissionStatusRequest.PAUSE,
	),
	changeStatus(
		C2Call.MissionStop,
		"Stop the active mission (teardown runtime).",
		MissionStatusRequest.STOP,
	),
	changeStatus(
		C2Call.MissionDelete,
		"Delete the active mission's runtime.",
		MissionStatusRequest.DELETE,
	),
	{
		name: C2Call.MissionsList,
		description: "List stored mission definitions (C2DB).",
		scope: "db",
		timeoutMs: READ_TIMEOUT_MS,
		requestSchema: empty,
		build: (s) => ({ url: `${s.dbUrl}/missions`, init: { method: "GET" } }),
	},
	{
		name: C2Call.MissionsSave,
		description: "Create/update a stored mission definition.",
		scope: "db",
		timeoutMs: COMMAND_TIMEOUT_MS,
		validate: (req) => {
			const bad = findUnsafeMongoKey(req.mission);
			return bad
				? `The request contains the key "${bad}", which the C2 rejects ("$"-prefixed or dotted keys — INVALID_BODY).`
				: null;
		},
		requestSchema: {
			type: "object",
			properties: { mission: { type: "object", title: "Mission" } },
			required: ["mission"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/missions`,
			init: {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify(req.mission ?? {}),
			},
		}),
	},
	{
		name: C2Call.MissionsDelete,
		description: "Delete a stored mission definition.",
		scope: "db",
		timeoutMs: COMMAND_TIMEOUT_MS,
		requestSchema: {
			type: "object",
			properties: { mission_id: { type: "string", title: "Mission ID" } },
			required: ["mission_id"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/missions/${enc(String(req.mission_id ?? ""))}`,
			init: { method: "DELETE" },
		}),
	},
	{
		name: C2Call.MapsList,
		description: "List registered maps (MapDB registry).",
		scope: "db",
		timeoutMs: READ_TIMEOUT_MS,
		requestSchema: empty,
		build: (s) => ({
			url: `${s.dbUrl}/maps`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.MapsCreate,
		description: "Register a new map.",
		scope: "db",
		timeoutMs: COMMAND_TIMEOUT_MS,
		requestSchema: {
			type: "object",
			properties: {
				name: { type: "string", title: "Map name" },
				crs: { type: "string", title: "CRS" },
			},
			required: ["name"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/maps`,
			init: {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify(
					req.crs != null
						? { name: req.name, crs: req.crs }
						: { name: req.name },
				),
			},
		}),
	},
	{
		name: C2Call.MapsDelete,
		description: "Delete a map (and its features).",
		scope: "db",
		timeoutMs: COMMAND_TIMEOUT_MS,
		requestSchema: {
			type: "object",
			properties: { name: { type: "string", title: "Map name" } },
			required: ["name"],
		},
		build: (s, req) => ({
			// The backend now requires `?confirm=<name>` on a map delete (it
			// cascades to every feature). The old backend ignores the query.
			url: `${s.dbUrl}/maps/${enc(String(req.name ?? ""))}?confirm=${enc(String(req.name ?? ""))}`,
			init: { method: "DELETE" },
		}),
	},
	{
		name: C2Call.MapFeaturesList,
		description: "List geojson features for a map.",
		scope: "db",
		timeoutMs: READ_TIMEOUT_MS,
		requestSchema: {
			type: "object",
			properties: { name: { type: "string", title: "Map name" } },
			required: ["name"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/maps/${enc(String(req.name ?? ""))}/features`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.MapFeaturesAdd,
		description: "Add a geojson feature to a map.",
		scope: "db",
		timeoutMs: COMMAND_TIMEOUT_MS,
		validate: (req) => {
			const bad = findUnsafeMongoKey(req.feature);
			return bad
				? `The request contains the key "${bad}", which the C2 rejects ("$"-prefixed or dotted keys — INVALID_BODY).`
				: null;
		},
		requestSchema: {
			type: "object",
			properties: {
				name: { type: "string", title: "Map name" },
				feature: { type: "object", title: "GeoJSON Feature" },
			},
			required: ["name", "feature"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/maps/${enc(String(req.name ?? ""))}/features`,
			init: {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify(req.feature ?? {}),
			},
		}),
	},
	{
		name: C2Call.MapFeaturesUpdate,
		description: "Update (upsert) a geojson feature on a map.",
		scope: "db",
		timeoutMs: COMMAND_TIMEOUT_MS,
		validate: (req) => {
			const bad = findUnsafeMongoKey(req.feature);
			return bad
				? `The request contains the key "${bad}", which the C2 rejects ("$"-prefixed or dotted keys — INVALID_BODY).`
				: null;
		},
		requestSchema: {
			type: "object",
			properties: {
				name: { type: "string", title: "Map name" },
				featureId: { type: "string", title: "Feature ID" },
				feature: { type: "object", title: "GeoJSON Feature" },
			},
			required: ["name", "featureId", "feature"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/maps/${enc(String(req.name ?? ""))}/features/${enc(String(req.featureId ?? ""))}`,
			init: {
				method: "PUT",
				headers: JSON_HEADERS,
				body: JSON.stringify(req.feature ?? {}),
			},
		}),
	},
	{
		name: C2Call.MapFeaturesDelete,
		description: "Delete a geojson feature from a map.",
		scope: "db",
		timeoutMs: COMMAND_TIMEOUT_MS,
		requestSchema: {
			type: "object",
			properties: {
				name: { type: "string", title: "Map name" },
				featureId: { type: "string", title: "Feature ID" },
			},
			required: ["name", "featureId"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/maps/${enc(String(req.name ?? ""))}/features/${enc(String(req.featureId ?? ""))}`,
			init: { method: "DELETE" },
		}),
	},
	{
		name: C2Call.PlannerStatus,
		description: "Read the planner status (loaded map, mode, graph size).",
		scope: "db",
		timeoutMs: READ_TIMEOUT_MS,
		requestSchema: empty,
		build: (s) => ({
			url: `${s.dbUrl}/planner/status`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.PlannerGraph,
		description:
			"Read the planner navigation graph (GeoJSON node/edge FeatureCollection).",
		scope: "db",
		timeoutMs: READ_TIMEOUT_MS,
		requestSchema: empty,
		build: (s) => ({
			url: `${s.dbUrl}/planner/graph`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.FeedbackLatest,
		description:
			"Read the latest stored MissionFeedback snapshot of every mission (newest first).",
		scope: "db",
		timeoutMs: READ_TIMEOUT_MS,
		requestSchema: empty,
		build: (s) => ({
			url: `${s.dbUrl}/mission-feedback/latest`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.FeedbackGet,
		description:
			"Read the latest stored MissionFeedback snapshot of one mission (404 MISSION_NOT_FOUND when none).",
		scope: "db",
		timeoutMs: READ_TIMEOUT_MS,
		requestSchema: {
			type: "object",
			properties: { mission_id: { type: "string", title: "Mission ID" } },
			required: ["mission_id"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/mission-feedback/${enc(String(req.mission_id ?? ""))}`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.VehiclesList,
		description: "List registered vehicles (VehicleDB).",
		scope: "db",
		timeoutMs: READ_TIMEOUT_MS,
		requestSchema: empty,
		build: (s) => ({ url: `${s.dbUrl}/Vehicles`, init: { method: "GET" } }),
	},
];

/** Look up a spec by call name (used by the transport). */
export function findC2CallSpec(name: string): C2CallSpec | undefined {
	return C2_CALL_SPECS.find((c) => c.name === name);
}

/**
 * Build the `RemoteCallDefinition[]` the C2 datasource advertises.
 * @param settings - The configured C2 datasource settings (provides `id` + URLs).
 * @returns One definition per catalog entry.
 */
export function buildC2RemoteCalls(
	settings: C2ControlSettings,
): RemoteCallDefinition[] {
	return C2_CALL_SPECS.map((spec) => ({
		name: spec.name,
		datasource_id: settings.id,
		source: settings,
		requestType: `${spec.name}.request`,
		rawRequestType: "application/json",
		responseType: `${spec.name}.response`,
		rawResponseType: "application/json",
		requestSchema: spec.requestSchema,
		// The transport's `cancel()` aborts the in-flight fetch (`rest.ts`), so
		// reads and DB writes advertise it. A COMMAND does not: aborting the
		// fetch does not un-send the POST, so a cancelled Stop or Start may
		// still be applied by the C2, and offering "cancel" on it promises an
		// undo the transport cannot deliver.
		cancelable: spec.scope !== "command",
		description: spec.description,
	}));
}
