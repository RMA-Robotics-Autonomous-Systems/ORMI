import { afterEach, describe, expect, it } from "bun:test";
import type { RemoteCallDefinition } from "@workspace/ormi-core/datasources";

import { C2ControlSettings } from "../types/c2-types";
import {
	C2Call,
	findUnsafeMongoKey,
	isRejectedMissionId,
	requiresC2Auth,
} from "./remote-calls";
import {
	C2ErrorCode,
	c2ResultCode,
	extractErrorCode,
	interpretC2Response,
} from "./response";
import { executeC2Call } from "./rest";

/**
 * The concrete backend contract (auth fails closed, JSON error codes, request
 * constraints). Old-backend shapes stay covered in `response.test.ts`.
 */

const settings = {
	id: "ds1",
	title: "C2",
	enable: true,
	missionControlUrl: "http://c2:5001",
	dbUrl: "http://c2:5000",
	missionControlToken: "tok",
} as C2ControlSettings;
const def = (name: string) =>
	({ name, datasource_id: "ds1" }) as RemoteCallDefinition;

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});
function stub(status = 200, body = "ok") {
	const calls: { url: string; init: RequestInit }[] = [];
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(body, { status });
	}) as unknown as typeof fetch;
	return calls;
}

describe("requiresC2Auth", () => {
	it(":5001 needs the token on every request", () => {
		expect(requiresC2Auth("command", "POST")).toBe(true);
		expect(requiresC2Auth("command", "GET")).toBe(true);
	});
	it(":5000 needs it on mutations only — GET stays open (no preflight)", () => {
		for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
			expect(requiresC2Auth("db", m)).toBe(true);
		}
		expect(requiresC2Auth("db", "GET")).toBe(false);
		expect(requiresC2Auth("db", undefined)).toBe(false);
	});
});

describe("token on the wire", () => {
	it("sends X-C2-Token + Bearer on a :5000 mutation", async () => {
		const calls = stub();
		await executeC2Call(settings, def(C2Call.MissionsDelete), {
			mission_id: "m1",
		}).result;
		const h = calls[0]!.init.headers as Record<string, string>;
		expect(h["X-C2-Token"]).toBe("tok");
		expect(h.Authorization).toBe("Bearer tok");
	});
	it("does not send it on a :5000 GET", async () => {
		const calls = stub(200, "[]");
		await executeC2Call(settings, def(C2Call.MapsList), {}).result;
		const h = calls[0]!.init.headers as Record<string, string>;
		expect(h["X-C2-Token"]).toBeUndefined();
	});
});

describe("error codes — both current shapes", () => {
	it("reads :5001's {status,code,message}", () => {
		expect(
			extractErrorCode({
				status: "error",
				code: "NO_TARGET_MISSION",
				message: "x",
			}),
		).toBe("NO_TARGET_MISSION");
	});
	it("reads :5000's {error:{code,message}}", () => {
		expect(
			extractErrorCode({
				error: { code: "MISSION_NOT_FOUND", message: "x" },
			}),
		).toBe("MISSION_NOT_FOUND");
	});
	it("is null for the legacy {error:'text'} and plain text", () => {
		expect(extractErrorCode({ error: "text" })).toBeNull();
		expect(extractErrorCode("text")).toBeNull();
	});
	it("c2ResultCode is null on success", () => {
		expect(c2ResultCode({ success: true, data: { code: "X" } })).toBeNull();
		expect(
			c2ResultCode({
				success: false,
				data: { code: "NO_TARGET_MISSION" },
			}),
		).toBe(C2ErrorCode.NoTargetMission);
	});
});

describe("legible failures", () => {
	it("409 NO_TARGET_MISSION says the command did NOT happen", () => {
		const out = interpretC2Response(409, "Conflict", "", {
			status: "error",
			code: "NO_TARGET_MISSION",
			message: "no mission",
		});
		expect(out.success).toBe(false);
		expect(out.error).toContain("did NOT happen");
		expect(out.code).toBe("NO_TARGET_MISSION");
	});
	it("401 UNAUTHORIZED points at the datasource token setting", () => {
		const out = interpretC2Response(401, "Unauthorized", "", {
			status: "error",
			code: "UNAUTHORIZED",
			message: "bad token",
		});
		expect(out.error).toContain("Mission Control auth token");
	});
	it("503 AUTH_NOT_CONFIGURED points at the SERVER, not the mission", () => {
		const out = interpretC2Response(503, "Unavailable", "", {
			error: { code: "AUTH_NOT_CONFIGURED", message: "x" },
		});
		expect(out.error).toContain("C2_API_TOKEN");
		expect(out.error).not.toContain("fix the errors");
	});
	it("a bare 503 with no code is NOT reported as an auth problem", () => {
		const out = interpretC2Response(503, "Service Unavailable", "", null);
		expect(out.error).toBe("HTTP 503: Service Unavailable");
	});
	it("a 200 carrying {status:'error'} is a failure", () => {
		const out = interpretC2Response(200, "OK", "", {
			status: "error",
			code: "PUBLISH_FAILED",
			message: "publish failed",
		});
		expect(out.success).toBe(false);
	});
});

describe("request constraints (refused before the fetch)", () => {
	it("rejects the nil UUID and empty ids", () => {
		expect(
			isRejectedMissionId("00000000-0000-0000-0000-000000000000"),
		).toBe(true);
		expect(isRejectedMissionId("")).toBe(true);
		expect(isRejectedMissionId(undefined)).toBe(true);
		expect(isRejectedMissionId("m1")).toBe(false);
	});

	it("an untargeted lifecycle command never reaches the network", async () => {
		const calls = stub();
		const r = await executeC2Call(settings, def(C2Call.MissionStop), {})
			.result;
		expect(r.success).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it("refuses initialize when the two mission ids disagree", async () => {
		const calls = stub();
		const r = await executeC2Call(settings, def(C2Call.MissionInit), {
			mission_id: "m1",
			mission_config: { mission_id: "m2" },
		}).result;
		expect(r.error).toContain("MISSION_ID_MISMATCH");
		expect(calls).toHaveLength(0);
	});

	it("stamps the config's mission_id when it is missing", async () => {
		const calls = stub();
		await executeC2Call(settings, def(C2Call.MissionInit), {
			mission_id: "m1",
			mission_config: { behavior: 0 },
		}).result;
		const body = JSON.parse(calls[0]!.init.body as string);
		expect(JSON.parse(body.mission_config).mission_id).toBe("m1");
		expect(body.mission_id).toBe("m1");
	});

	it("finds $-prefixed and dotted keys at any depth", () => {
		expect(findUnsafeMongoKey({ a: { $set: 1 } })).toBe("a.$set");
		expect(findUnsafeMongoKey({ list: [{ "x.y": 1 }] })).toBe(
			"list[0].x.y",
		);
		expect(findUnsafeMongoKey({ _id: "ok", a: [1, 2] })).toBeNull();
	});

	it("refuses a save carrying an injection-shaped key", async () => {
		const calls = stub();
		const r = await executeC2Call(settings, def(C2Call.MissionsSave), {
			mission: { mission_id: "m1", $where: "1" },
		}).result;
		expect(r.error).toContain("$where");
		expect(calls).toHaveLength(0);
	});
});
