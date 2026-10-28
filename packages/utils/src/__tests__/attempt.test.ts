import { describe, expect, it } from "bun:test";

import { attempt, attemptAsync } from "../attempt";

describe("attempt (sync)", () => {
	it("runs body then onSettled, and reports success", () => {
		const calls: string[] = [];
		const ok = attempt(
			() => void calls.push("body"),
			() => calls.push("error"),
			() => calls.push("settled"),
		);
		expect(ok).toBe(true);
		expect(calls).toEqual(["body", "settled"]);
	});

	it("hands a throw to onError before onSettled", () => {
		const calls: unknown[] = [];
		const ok = attempt(
			() => {
				throw new Error("boom");
			},
			(error) => calls.push((error as Error).message),
			() => calls.push("settled"),
		);
		expect(ok).toBe(false);
		expect(calls).toEqual(["boom", "settled"]);
	});

	it("rethrows after onSettled when there is no onError", () => {
		const calls: string[] = [];
		expect(() =>
			attempt(
				() => {
					throw new Error("boom");
				},
				undefined,
				() => calls.push("settled"),
			),
		).toThrow("boom");
		expect(calls).toEqual(["settled"]);
	});

	it("propagates a throw from onSettled", () => {
		expect(() =>
			attempt(
				() => {},
				undefined,
				() => {
					throw new Error("settled failed");
				},
			),
		).toThrow("settled failed");
	});

	it("is synchronous", () => {
		expect(attempt(() => {})).toBe(true);
	});
});

describe("attemptAsync", () => {
	it("runs body then onSettled, and reports success", async () => {
		const calls: string[] = [];
		const ok = await attemptAsync(
			async () => calls.push("body"),
			() => calls.push("error"),
			() => calls.push("settled"),
		);
		expect(ok).toBe(true);
		expect(calls).toEqual(["body", "settled"]);
	});

	it("hands a rejection to onError before onSettled", async () => {
		const calls: unknown[] = [];
		const ok = await attemptAsync(
			async () => {
				throw new Error("boom");
			},
			(error) => calls.push((error as Error).message),
			() => calls.push("settled"),
		);
		expect(ok).toBe(false);
		expect(calls).toEqual(["boom", "settled"]);
	});

	it("catches a synchronous throw from body", async () => {
		const ok = await attemptAsync(
			() => {
				throw new Error("boom");
			},
			() => {},
		);
		expect(ok).toBe(false);
	});

	it("rethrows after onSettled when there is no onError", async () => {
		const calls: string[] = [];
		const run = attemptAsync(
			async () => {
				throw new Error("boom");
			},
			undefined,
			() => calls.push("settled"),
		);
		await expect(run).rejects.toThrow("boom");
		expect(calls).toEqual(["settled"]);
	});

	it("propagates a throw from onSettled", async () => {
		await expect(
			attemptAsync(
				async () => {},
				() => {},
				() => {
					throw new Error("settled failed");
				},
			),
		).rejects.toThrow("settled failed");
	});
});
