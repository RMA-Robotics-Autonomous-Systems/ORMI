import { afterEach, describe, expect, it } from "bun:test";
import type { RemoteCallDefinition } from "@workspace/ormi-core/datasources";

import { publishAgentProfiles, findAgentName } from "../state/c2-agents-store";
import {
	findMissionName,
	publishMissionNames,
} from "../state/c2-catalog-store";
import { C2ControlSettings } from "../types/c2-types";
import { sameUuid, uuidKey } from "../types/uuid";
import { C2Call } from "./remote-calls";
import {
	C2ErrorCode,
	c2ResultCode,
	c2ResultConflicts,
	extractC2Conflicts,
	formatVehicleBusy,
	interpretC2Response,
} from "./response";
import { executeC2Call } from "./rest";

/**
 * The C2 "robot lock": approve/start answers 409 VEHICLE_BUSY with a
 * `conflicts: [{vehicle_id, mission_id}]` list when the mission's vehicles are
 * leased by another mission.
 */

const V1 = "11111111-2222-3333-4444-555555555555";
const M1 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const V2 = "99999999-8888-7777-6666-555555555555";
const M2 = "ffffffff-0000-1111-2222-333333333333";

const BODY = {
	status: "error",
	code: "VEHICLE_BUSY",
	message: `VEHICLE_BUSY: vehicle ${V1} is used by mission ${M1}; vehicle ${V2} is used by mission ${M2}`,
	conflicts: [
		{ vehicle_id: V1, mission_id: M1 },
		{ vehicle_id: V2, mission_id: M2 },
	],
};

describe("extractC2Conflicts", () => {
	it("reads the top-level conflicts array", () => {
		expect(extractC2Conflicts(BODY)).toEqual([
			{ vehicle_id: V1, mission_id: M1 },
			{ vehicle_id: V2, mission_id: M2 },
		]);
	});
	it("reads a nested {error:{conflicts}} defensively", () => {
		expect(
			extractC2Conflicts({
				error: {
					code: "VEHICLE_BUSY",
					conflicts: [{ vehicle_id: V1 }],
				},
			}),
		).toEqual([{ vehicle_id: V1, mission_id: "" }]);
	});
	it("drops malformed entries and tolerates non-bodies", () => {
		expect(
			extractC2Conflicts({
				conflicts: [null, 3, { mission_id: M1 }, { vehicle_id: " " }],
			}),
		).toEqual([]);
		expect(extractC2Conflicts("VEHICLE_BUSY")).toEqual([]);
		expect(extractC2Conflicts(null)).toEqual([]);
		expect(extractC2Conflicts({ status: "error" })).toEqual([]);
	});
});

describe("formatVehicleBusy", () => {
	it("falls back to the raw ids without a resolver", () => {
		expect(formatVehicleBusy([{ vehicle_id: V1, mission_id: M1 }])).toBe(
			`Vehicle busy: ${V1} is used by mission ${M1}. The command was NOT applied (VEHICLE_BUSY) — stop or finish that mission first, then retry.`,
		);
	});
	it("uses names when the resolver knows them, ids otherwise", () => {
		const text = formatVehicleBusy(BODY.conflicts, {
			vehicleName: (id) => (id === V1 ? "Themis_Fr" : null),
			missionName: (id) => (id === M2 ? "Patrol North" : ""),
		});
		expect(text).toBe(
			`Vehicle busy: Themis_Fr is used by mission ${M1}; ` +
				`Vehicle busy: ${V2} is used by mission Patrol North. ` +
				"The command was NOT applied (VEHICLE_BUSY) — stop or finish those missions first, then retry.",
		);
	});
	it("says 'another mission' when the holder is unknown", () => {
		expect(
			formatVehicleBusy([{ vehicle_id: V1, mission_id: "" }]),
		).toStartWith(`Vehicle busy: ${V1} is used by another mission.`);
	});
	it("is null with no conflicts", () => {
		expect(formatVehicleBusy([])).toBeNull();
	});
});

describe("interpretC2Response — 409 VEHICLE_BUSY", () => {
	it("fails, keeps the code and the conflicts, and names each conflict", () => {
		const out = interpretC2Response(
			409,
			"Conflict",
			JSON.stringify(BODY),
			BODY,
		);
		expect(out.success).toBe(false);
		expect(out.code).toBe(C2ErrorCode.VehicleBusy);
		expect(out.conflicts).toEqual(BODY.conflicts);
		expect(out.error).toContain(
			`Vehicle busy: ${V1} is used by mission ${M1}`,
		);
		expect(out.error).toContain(
			`Vehicle busy: ${V2} is used by mission ${M2}`,
		);
		expect(out.error).not.toStartWith("HTTP 409");
	});
	it("without a conflicts array keeps the server message, HTTP-prefixed", () => {
		const out = interpretC2Response(409, "Conflict", "", {
			status: "error",
			code: "VEHICLE_BUSY",
			message: "VEHICLE_BUSY: vehicle x is used by mission y",
		});
		expect(out.error).toBe(
			"HTTP 409: VEHICLE_BUSY: vehicle x is used by mission y",
		);
		expect(out.conflicts).toBeUndefined();
	});
	it("leaves other codes exactly as before (no conflicts key)", () => {
		const out = interpretC2Response(409, "Conflict", "", {
			status: "error",
			code: "NO_TARGET_MISSION",
			message: "no mission",
		});
		expect(out.error).toContain("did NOT happen");
		expect("conflicts" in out).toBe(false);
		const bad = interpretC2Response(400, "Bad Request", "", {
			status: "error",
			code: "INVALID_MISSION_ID",
			message: "mission_id is not a UUID",
		});
		expect(bad.error).toBe("HTTP 400: mission_id is not a UUID");
	});
});

describe("executeC2Call — VEHICLE_BUSY survives the transport", () => {
	const realFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	it("keeps the whole body (conflicts included) in result.data", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify(BODY), {
				status: 409,
				statusText: "Conflict",
			})) as unknown as typeof fetch;
		const settings = {
			id: "ds1",
			title: "C2",
			enable: true,
			missionControlUrl: "http://c2:5001",
			dbUrl: "http://c2:5000",
		} as C2ControlSettings;
		const result = await executeC2Call(
			settings,
			{
				name: C2Call.MissionApprove,
				datasource_id: "ds1",
			} as RemoteCallDefinition,
			{ mission_id: M1 },
		).result;
		expect(result.success).toBe(false);
		expect(c2ResultCode(result)).toBe(C2ErrorCode.VehicleBusy);
		expect(c2ResultConflicts(result)).toEqual(BODY.conflicts);
		expect(result.error).toContain(`Vehicle busy: ${V1}`);
	});
	it("c2ResultConflicts is empty on success", () => {
		expect(c2ResultConflicts({ success: true, data: BODY })).toEqual([]);
	});
});

describe("name resolution tolerant of '-' vs '_' and case", () => {
	it("uuidKey / sameUuid", () => {
		expect(uuidKey("AAAA_bbbb-CC")).toBe("aaaabbbbcc");
		expect(sameUuid(V1, V1.replace(/-/g, "_").toUpperCase())).toBe(true);
		expect(sameUuid(V1, V2)).toBe(false);
		expect(sameUuid("", "")).toBe(false);
	});
	it("resolves store names from an underscore/uppercase id", () => {
		const vid = "0a0b0c0d-1111-2222-3333-444444444444";
		const mid = "5a5b5c5d-6666-7777-8888-999999999999";
		publishAgentProfiles([{ agent_id: vid, namespace: "Hermes_Be" }]);
		publishMissionNames([{ mission_id: mid, name: "Florennes sweep" }]);
		const vAlt = vid.replace(/-/g, "_").toUpperCase();
		const mAlt = mid.replace(/-/g, "_");
		expect(findAgentName(vAlt)).toBe("Hermes_Be");
		expect(findMissionName(mAlt)).toBe("Florennes sweep");
		expect(
			findAgentName("00000000-0000-0000-0000-00000000dead"),
		).toBeNull();
		expect(findMissionName(null)).toBeNull();
		expect(
			formatVehicleBusy([{ vehicle_id: vAlt, mission_id: mAlt }], {
				vehicleName: findAgentName,
				missionName: findMissionName,
			}),
		).toStartWith(
			"Vehicle busy: Hermes_Be is used by mission Florennes sweep.",
		);
	});
});
