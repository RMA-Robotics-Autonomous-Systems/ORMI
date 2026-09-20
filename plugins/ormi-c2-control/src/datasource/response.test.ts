import { describe, expect, it } from "bun:test";

import {
	bodyDeclaresFailure,
	extractErrorMessage,
	interpretC2Response,
} from "./response";

/**
 * The backend-tolerance matrix. These cases ARE the contract with the C2 backend
 * agent: the old shapes (200 + plain text) and the new ones (4xx + structured
 * JSON) must both be read correctly by the same client.
 */

describe("extractErrorMessage", () => {
	it("reads a plain-text body verbatim (old backend)", () => {
		expect(extractErrorMessage("Mission not found")).toBe(
			"Mission not found",
		);
	});

	it("reads the structured `error` field (new backend)", () => {
		expect(extractErrorMessage({ error: "mission_id is required" })).toBe(
			"mission_id is required",
		);
	});

	it.each(["message", "detail", "reason", "msg"])(
		"reads the `%s` field",
		(key) => {
			expect(extractErrorMessage({ [key]: "boom" })).toBe("boom");
		},
	);

	it("prefers `error` over the other keys", () => {
		expect(extractErrorMessage({ message: "second", error: "first" })).toBe(
			"first",
		);
	});

	it("unwraps a nested error object", () => {
		expect(
			extractErrorMessage({ error: { code: 12, message: "nested" } }),
		).toBe("nested");
	});

	it("joins a validation error list", () => {
		expect(
			extractErrorMessage({ errors: ["no vehicles", "no geometries"] }),
		).toBe("no vehicles; no geometries");
	});

	it("returns null when the body carries no message", () => {
		expect(extractErrorMessage({ data: [1, 2, 3] })).toBeNull();
		expect(extractErrorMessage(null)).toBeNull();
		expect(extractErrorMessage("   ")).toBeNull();
	});

	it("caps a runaway body so an HTML error page can't flood the UI", () => {
		const message = extractErrorMessage("x".repeat(5000));
		expect(message!.length).toBeLessThanOrEqual(301);
		expect(message!.endsWith("…")).toBe(true);
	});
});

describe("bodyDeclaresFailure", () => {
	it("is true for an explicit machine-readable failure", () => {
		expect(bodyDeclaresFailure({ success: false })).toBe(true);
		expect(bodyDeclaresFailure({ ok: false })).toBe(true);
		expect(bodyDeclaresFailure({ error: "nope" })).toBe(true);
		expect(bodyDeclaresFailure({ errors: ["a"] })).toBe(true);
	});

	it("is false for a success body, however it is worded", () => {
		// Today's C2 answers `initialize` with exactly this string.
		expect(bodyDeclaresFailure("Mission initialized successfully!")).toBe(
			false,
		);
		expect(bodyDeclaresFailure({ ok: true })).toBe(false);
		expect(bodyDeclaresFailure({ success: true, error: "" })).toBe(false);
	});

	it("never infers failure from free text in a data payload", () => {
		// A mission whose NAME contains "error" must not read as an outage.
		expect(
			bodyDeclaresFailure({
				missions: [{ name: "error handling test" }],
			}),
		).toBe(false);
	});
});

describe("interpretC2Response", () => {
	it("treats any non-2xx as failure, whatever the body says", () => {
		const out = interpretC2Response(
			503,
			"Service Unavailable",
			'{"ok":true}',
			{ ok: true },
		);
		expect(out.success).toBe(false);
		expect(out.error).toContain("503");
	});

	it("unwraps a structured 4xx body (new backend)", () => {
		const out = interpretC2Response(
			400,
			"Bad Request",
			'{"error":"transit requires desired_vehicle_constraints"}',
			{ error: "transit requires desired_vehicle_constraints" },
		);
		expect(out.success).toBe(false);
		expect(out.error).toBe(
			"HTTP 400: transit requires desired_vehicle_constraints",
		);
	});

	it("uses a plain-text 4xx body verbatim", () => {
		const out = interpretC2Response(
			404,
			"Not Found",
			"no such mission",
			"no such mission",
		);
		expect(out.error).toBe("HTTP 404: no such mission");
	});

	it("falls back to the status text for an empty body", () => {
		const out = interpretC2Response(500, "Internal Server Error", "", null);
		expect(out.error).toBe("HTTP 500: Internal Server Error");
	});

	it("catches the OLD backend's HTTP-200-plus-error habit", () => {
		const out = interpretC2Response(
			200,
			"OK",
			'{"error":"Requested status change not allowed: 1"}',
			{ error: "Requested status change not allowed: 1" },
		);
		expect(out.success).toBe(false);
		expect(out.error).toBe("Requested status change not allowed: 1");
	});

	it("accepts the old backend's plain-string command successes", () => {
		for (const text of [
			"Mission initialized successfully!",
			"status change requested",
		]) {
			const out = interpretC2Response(200, "OK", text, text, "command");
			expect(out.success).toBe(true);
			expect(out.error).toBeUndefined();
		}
	});

	it('reads the old backend\'s 200 "Mission not found" on a command as a FAILURE', () => {
		// The old :5001 answered a command it could not act on with HTTP 200
		// and prose. Reading that as success printed "stop sent" for a Stop
		// that never reached a robot.
		const out = interpretC2Response(
			200,
			"OK",
			"Mission not found",
			"Mission not found",
			"command",
		);
		expect(out.success).toBe(false);
		expect(out.error).toContain("Mission not found");
	});

	it("never reads prose as failure outside command scope", () => {
		// A :5000 body can carry operator data (a mission NAME with "error").
		const text = "error handling test";
		expect(interpretC2Response(200, "OK", text, text).success).toBe(true);
		expect(interpretC2Response(200, "OK", text, text, "db").success).toBe(
			true,
		);
	});

	it("accepts a structured 200 as a success", () => {
		const out = interpretC2Response(201, "Created", '{"ok":true}', {
			ok: true,
		});
		expect(out.success).toBe(true);
	});

	it("accepts an ordinary data payload (a mission list)", () => {
		const data = [{ mission_id: "m1" }];
		const out = interpretC2Response(200, "OK", JSON.stringify(data), data);
		expect(out.success).toBe(true);
	});
});
