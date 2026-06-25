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
	FeaturesCollections: "c2.features.collections",
	FeaturesList: "c2.features.list",
	FeaturesSave: "c2.features.save",
	FeaturesDelete: "c2.features.delete",
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
		name: C2Call.FeaturesCollections,
		description: "List map-feature collections (MapDB).",
		requestSchema: empty,
		build: (s) => ({
			url: `${s.dbUrl}/collections`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.FeaturesList,
		description: "List geojson features in a collection.",
		requestSchema: {
			type: "object",
			properties: {
				collectionName: { type: "string", title: "Collection" },
			},
			required: ["collectionName"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/map-features/${enc(String(req.collectionName ?? ""))}`,
			init: { method: "GET" },
		}),
	},
	{
		name: C2Call.FeaturesSave,
		description: "Create/update a geojson feature.",
		requestSchema: {
			type: "object",
			properties: {
				collectionName: { type: "string", title: "Collection" },
				feature: { type: "object", title: "GeoJSON Feature" },
			},
			required: ["collectionName", "feature"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/save-feature`,
			init: {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify({
					collectionName: req.collectionName,
					feature: req.feature,
				}),
			},
		}),
	},
	{
		name: C2Call.FeaturesDelete,
		description: "Delete a geojson feature.",
		requestSchema: {
			type: "object",
			properties: {
				collectionName: { type: "string", title: "Collection" },
				featureId: { type: "string", title: "Feature ID" },
			},
			required: ["collectionName", "featureId"],
		},
		build: (s, req) => ({
			url: `${s.dbUrl}/delete-feature/${enc(String(req.collectionName ?? ""))}/${enc(String(req.featureId ?? ""))}`,
			init: { method: "DELETE" },
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
