import { describe, expect, it } from "bun:test";

import { createAsyncActionRunner } from "./use-async-action";

/** A manually-resolvable promise, to control settle timing in tests. */
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("createAsyncActionRunner (in-flight re-entry guard)", () => {
	it("runs the action and reports pending key then null", async () => {
		const latch = { inFlight: false };
		const seen: (string | null)[] = [];
		const run = createAsyncActionRunner<string>(latch, (p) => seen.push(p));

		let calls = 0;
		await run("save", async () => {
			calls++;
		});

		expect(calls).toBe(1);
		expect(seen).toEqual(["save", null]);
		expect(latch.inFlight).toBe(false);
	});

	it("drops a second call while the first is still in flight (no-op)", async () => {
		const latch = { inFlight: false };
		const run = createAsyncActionRunner<string>(latch, () => {});

		const gate = deferred();
		let firstCalls = 0;
		let secondCalls = 0;

		// Start the first action but do not let it settle yet.
		const first = run("save", async () => {
			firstCalls++;
			await gate.promise;
		});

		// A re-entrant call while the first is in flight must be a no-op.
		await run("save", async () => {
			secondCalls++;
		});
		expect(secondCalls).toBe(0);
		expect(latch.inFlight).toBe(true);

		// Let the first finish; the latch clears.
		gate.resolve();
		await first;
		expect(firstCalls).toBe(1);
		expect(latch.inFlight).toBe(false);
	});

	it("drops a different action key while one is in flight (no mid-flight switch)", async () => {
		const latch = { inFlight: false };
		const run = createAsyncActionRunner<"start" | "stop">(latch, () => {});

		const gate = deferred();
		let started = 0;
		let stopped = 0;

		const first = run("start", async () => {
			started++;
			await gate.promise;
		});
		await run("stop", async () => {
			stopped++;
		});

		expect(started).toBe(1);
		expect(stopped).toBe(0);

		gate.resolve();
		await first;
	});

	it("clears the latch even when the action rejects, allowing a retry", async () => {
		const latch = { inFlight: false };
		const seen: (string | null)[] = [];
		const run = createAsyncActionRunner<string>(latch, (p) => seen.push(p));

		await expect(
			run("delete", async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(latch.inFlight).toBe(false);
		expect(seen).toEqual(["delete", null]);

		// Latch cleared → a subsequent call runs.
		let retried = 0;
		await run("delete", async () => {
			retried++;
		});
		expect(retried).toBe(1);
	});
});
