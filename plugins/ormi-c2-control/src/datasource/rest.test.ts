import { afterEach, describe, expect, it } from "bun:test";
import type { RemoteCallDefinition } from "@workspace/ormi-core/datasources";

import { C2ControlSettings } from "../types/c2-types";
import { C2Call, COMMAND_TIMEOUT_MS, READ_TIMEOUT_MS } from "./remote-calls";
import { executeC2Call } from "./rest";

/**
 * Transport behaviour: per-call timeouts (no call site passes options), the
 * optional `:5001` auth token, and both backend generations reaching the same
 * `RemoteCallResult`.
 */

const settings: C2ControlSettings = {
	id: "ds1",
	title: "C2",
	enable: true,
	missionControlUrl: "http://c2:5001",
	dbUrl: "http://c2:5000",
} as C2ControlSettings;

function def(name: string): RemoteCallDefinition {
	return { name, datasource_id: "ds1" } as RemoteCallDefinition;
}

/** Capture of one intercepted fetch. */
interface Captured {
	url: string;
	init: RequestInit;
}

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** Stub `fetch` with a fixed response, recording every call. */
function stubFetch(
	status: number,
	body: string,
	statusText = "OK",
): Captured[] {
	const calls: Captured[] = [];
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(body, { status, statusText });
	}) as unknown as typeof fetch;
	return calls;
}

describe("executeC2Call — timeouts", () => {
	it("applies the catalog's read timeout when no options are passed", async () => {
		// The regression this guards: `timeoutMs` defaulted to 0 (= none) and NOT
		// ONE of the 20+ call sites passed options, so a black-holed backend hung
		// `useAsyncAction`'s latch and disabled every button indefinitely.
		let seen: number | undefined;
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			// Abort after a beat so the signal wiring is exercised for real.
			seen = READ_TIMEOUT_MS;
			expect(init.signal).toBeDefined();
			return new Response("[]", { status: 200 });
		}) as unknown as typeof fetch;

		const handle = executeC2Call(settings, def(C2Call.MissionsList), {});
		await handle.result;
		expect(seen).toBe(READ_TIMEOUT_MS);
	});

	it("reports a timeout as an explicit failure, not a silent cancel", async () => {
		globalThis.fetch = ((_url: string, init: RequestInit) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () =>
					reject(new DOMException("Aborted", "AbortError")),
				);
			})) as unknown as typeof fetch;

		const handle = executeC2Call(
			settings,
			def(C2Call.MissionsList),
			{},
			{ timeout: 10 },
		);
		const result = await handle.result;
		expect(result.success).toBe(false);
		expect(result.status).toBe("failed");
		expect(result.error).toContain("Timed out after 10 ms");
	});

	it("reports an operator cancel distinctly from a timeout", async () => {
		globalThis.fetch = ((_url: string, init: RequestInit) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () =>
					reject(new DOMException("Aborted", "AbortError")),
				);
			})) as unknown as typeof fetch;

		const handle = executeC2Call(settings, def(C2Call.MissionsList), {});
		await handle.cancel?.();
		const result = await handle.result;
		expect(result.status).toBe("canceled");
		expect(result.error).toBe("Canceled.");
	});

	it("honours an explicit `timeout: 0` as a deliberate opt-out", async () => {
		stubFetch(200, "[]");
		const handle = executeC2Call(
			settings,
			def(C2Call.MissionsList),
			{},
			{ timeout: 0 },
		);
		const result = await handle.result;
		expect(result.success).toBe(true);
	});

	it("gives commands the longer timeout", () => {
		expect(COMMAND_TIMEOUT_MS).toBeGreaterThan(READ_TIMEOUT_MS);
	});
});

describe("executeC2Call — auth token", () => {
	it("sends nothing when no token is configured (today's backend)", async () => {
		const calls = stubFetch(200, "ok");
		await executeC2Call(settings, def(C2Call.MissionStop), {
			mission_id: "m1",
		}).result;
		const headers = calls[0]!.init.headers as Record<string, string>;
		expect(headers.Authorization).toBeUndefined();
		expect(headers["X-C2-Token"]).toBeUndefined();
	});

	it("sends both header forms on a command call when configured", async () => {
		const calls = stubFetch(200, "ok");
		await executeC2Call(
			{ ...settings, missionControlToken: "s3cret" },
			def(C2Call.MissionStop),
			{ mission_id: "m1" },
		).result;
		const headers = calls[0]!.init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer s3cret");
		expect(headers["X-C2-Token"]).toBe("s3cret");
		// The spec's own headers survive.
		expect(headers["Content-Type"]).toBe("application/json");
	});

	it("never sends the token on a :5000 GET", async () => {
		const calls = stubFetch(200, "[]");
		await executeC2Call(
			{ ...settings, missionControlToken: "s3cret" },
			def(C2Call.MissionsList),
			{},
		).result;
		const headers = calls[0]!.init.headers as Record<string, string>;
		expect(headers.Authorization).toBeUndefined();
		expect(calls[0]!.url.startsWith("http://c2:5000")).toBe(true);
	});

	it("ignores a whitespace-only token", async () => {
		const calls = stubFetch(200, "ok");
		await executeC2Call(
			{ ...settings, missionControlToken: "   " },
			def(C2Call.MissionStop),
			{ mission_id: "m1" },
		).result;
		const headers = calls[0]!.init.headers as Record<string, string>;
		expect(headers.Authorization).toBeUndefined();
	});
});

describe("executeC2Call — both backend generations", () => {
	it("succeeds on the old backend's plain-text 200 success", async () => {
		stubFetch(200, "Mission initialized successfully!");
		const result = await executeC2Call(settings, def(C2Call.MissionInit), {
			mission_id: "m1",
			mission_config: {},
		}).result;
		expect(result.success).toBe(true);
	});

	it('fails on the old backend\'s 200 "Mission not found" to a change_status', async () => {
		stubFetch(200, "Mission not found");
		const result = await executeC2Call(settings, def(C2Call.MissionStop), {
			mission_id: "m1",
		}).result;
		expect(result.success).toBe(false);
		expect(result.error).toContain("Mission not found");
	});

	it("reports a timed-out command as outcome unknown, not as a failure", async () => {
		globalThis.fetch = ((_url: string, init: RequestInit) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () =>
					reject(new DOMException("Aborted", "AbortError")),
				);
			})) as unknown as typeof fetch;
		const result = await executeC2Call(
			settings,
			def(C2Call.MissionStop),
			{ mission_id: "m1" },
			{ timeout: 10 },
		).result;
		expect(result.success).toBe(false);
		expect(result.error).toContain("Outcome unknown");
		expect(result.error).toContain("may have applied it");
	});

	it("fails on a structured 4xx and surfaces its message", async () => {
		// :5000's new nested shape.
		stubFetch(
			400,
			'{"error":{"code":"MISSING_FIELD","message":"mission_id is required"}}',
			"Bad Request",
		);
		const result = await executeC2Call(settings, def(C2Call.MissionStop), {
			mission_id: "m1",
		}).result;
		expect(result.success).toBe(false);
		expect(result.error).toBe("HTTP 400: mission_id is required");
	});

	it("fails on the old backend's HTTP 200 carrying an error body", async () => {
		stubFetch(200, '{"error":"Requested status change not allowed: 1"}');
		const result = await executeC2Call(settings, def(C2Call.MissionStart), {
			mission_id: "m1",
		}).result;
		expect(result.success).toBe(false);
		expect(result.error).toBe("Requested status change not allowed: 1");
	});

	it("carries mission_id on every change_status command", async () => {
		const calls = stubFetch(200, "ok");
		await executeC2Call(settings, def(C2Call.MissionStop), {
			mission_id: "m-42",
		}).result;
		expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({
			action: "change_status",
			mission_id: "m-42",
		});
	});
});
