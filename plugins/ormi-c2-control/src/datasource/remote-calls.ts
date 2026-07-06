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
 * ⚠ `:5001 change_status` ignores `mission_id` — it targets the last mission
 * `initialize`d. So the command calls take no `mission_id`; only `c2.mission.init`
 * carries one (and its `mission_config` is double-serialized to a string).
 */

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
} as const;

export interface C2BuiltRequest {
	url: string;
	init: RequestInit;
}

export interface C2CallSpec {
	name: string;
	description: string;
	requestSchema: JsonSchema;
	/** Turn a request payload into a concrete REST round-trip. */
	build: (
		settings: C2ControlSettings,
		request: Record<string, unknown>,
	) => C2BuiltRequest;
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
		requestSchema: empty, // command targets the last-initialized mission (§2.2)
		build: (s) => ({
			url: `${s.missionControlUrl}/mission_control`,
			init: {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify({
					action: "change_status",
					requested_state: state,
				}),
			},
		}),
	};
}

/** The catalog. */
export const C2_CALL_SPECS: C2CallSpec[] = [
	{
		name: C2Call.MissionInit,
		description: "Submit a mission config to the C2 (initialize → plan).",
		requestSchema: {
			type: "object",
			properties: {
				mission_id: { type: "string", title: "Mission ID" },
				mission_config: { type: "object", title: "Mission Config" },
			},
			required: ["mission_id", "mission_config"],
		},
		build: (s, req) => ({
			url: `${s.missionControlUrl}/mission_control`,
			init: {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify({
					action: "initialize",
					mission_id: req.mission_id,
					// double-serialized: mission_config is a JSON string inside the request JSON
					mission_config: JSON.stringify(req.mission_config ?? {}),
				}),
			},
		}),
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
		requestSchema: empty,
		build: (s) => ({ url: `${s.dbUrl}/missions`, init: { method: "GET" } }),
	},
	{
		name: C2Call.MissionsSave,
		description: "Create/update a stored mission definition.",
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
		requestSchema: empty,
		build: (s) => ({
			url: `${s.dbUrl}/maps`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.MapsCreate,
		description: "Register a new map.",
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
		requestSchema: {
			type: "object",
			properties: { name: { type: "string", title: "Map name" } },
			required: ["name"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/maps/${enc(String(req.name ?? ""))}`,
			init: { method: "DELETE" },
		}),
	},
	{
		name: C2Call.MapFeaturesList,
		description: "List geojson features for a map.",
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
		requestSchema: empty,
		build: (s) => ({
			url: `${s.dbUrl}/planner/graph`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.VehiclesList,
		description: "List registered vehicles (VehicleDB).",
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
		cancelable: false,
		description: spec.description,
	}));
}
