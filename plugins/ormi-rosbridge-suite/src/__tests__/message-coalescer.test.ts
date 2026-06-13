/**
 * Tests for the per-topic message coalescer that sits between the roslib
 * subscription callback and the convert + dispatch step: lossy last-wins
 * overwriting, lossless FIFO ordering, the cap-triggered synchronous drain,
 * unregister/reset flushing, error isolation, and tick lifecycle.
 */

import { describe, test, expect } from "bun:test";

import { MessageCoalescer } from "../message-coalescer";

const makeSink = () => {
	const dispatched: unknown[] = [];
	return { dispatched, dispatch: (m: unknown) => dispatched.push(m) };
};

describe("MessageCoalescer — lossy-latest mode", () => {
	test("keeps only the newest undrained message", () => {
		const coalescer = new MessageCoalescer();
		const { dispatched, dispatch } = makeSink();
		coalescer.register("/scan", "lossy-latest", dispatch);

		coalescer.push("/scan", 1);
		coalescer.push("/scan", 2);
		coalescer.push("/scan", 3);
		expect(dispatched).toHaveLength(0); // nothing dispatched on arrival

		coalescer.drainAll();
		expect(dispatched).toEqual([3]);

		coalescer.reset();
	});

	test("a drained topic dispatches nothing until a new message arrives", () => {
		const coalescer = new MessageCoalescer();
		const { dispatched, dispatch } = makeSink();
		coalescer.register("/scan", "lossy-latest", dispatch);

		coalescer.push("/scan", 1);
		coalescer.drainAll();
		coalescer.drainAll();
		expect(dispatched).toEqual([1]);

		coalescer.push("/scan", 2);
		coalescer.drainAll();
		expect(dispatched).toEqual([1, 2]);

		coalescer.reset();
	});

	test("topics are coalesced independently", () => {
		const coalescer = new MessageCoalescer();
		const { dispatched: a, dispatch: dispatchA } = makeSink();
		const { dispatched: b, dispatch: dispatchB } = makeSink();
		coalescer.register("/a", "lossy-latest", dispatchA);
		coalescer.register("/b", "lossy-latest", dispatchB);

		coalescer.push("/a", 1);
		coalescer.push("/b", 10);
		coalescer.push("/a", 2);
		coalescer.drainAll();

		expect(a).toEqual([2]);
		expect(b).toEqual([10]);

		coalescer.reset();
	});
});

describe("MessageCoalescer — lossless-queue mode", () => {
	test("dispatches every message in arrival order", () => {
		const coalescer = new MessageCoalescer();
		const { dispatched, dispatch } = makeSink();
		coalescer.register("/tf", "lossless-queue", dispatch);

		coalescer.push("/tf", 1);
		coalescer.push("/tf", 2);
		coalescer.push("/tf", 3);
		expect(dispatched).toHaveLength(0);

		coalescer.drainAll();
		expect(dispatched).toEqual([1, 2, 3]);

		coalescer.reset();
	});

	test("reaching the queue cap drains synchronously instead of dropping", () => {
		const coalescer = new MessageCoalescer();
		const { dispatched, dispatch } = makeSink();
		coalescer.register("/tf", "lossless-queue", dispatch);

		for (let i = 0; i < 250; i++) {
			coalescer.push("/tf", i);
		}

		// The cap (200) forced a synchronous drain mid-stream; nothing lost.
		expect(dispatched.length).toBeGreaterThanOrEqual(200);
		coalescer.drainAll();
		expect(dispatched).toHaveLength(250);
		expect(dispatched[0]).toBe(0);
		expect(dispatched[249]).toBe(249);

		coalescer.reset();
	});
});

describe("MessageCoalescer — lifecycle", () => {
	test("unregister drains pending messages and stops delivery", () => {
		const coalescer = new MessageCoalescer();
		const { dispatched, dispatch } = makeSink();
		coalescer.register("/tf", "lossless-queue", dispatch);

		coalescer.push("/tf", 1);
		coalescer.push("/tf", 2);
		coalescer.unregister("/tf");
		expect(dispatched).toEqual([1, 2]);

		// Pushes after unregister are ignored.
		coalescer.push("/tf", 3);
		coalescer.drainAll();
		expect(dispatched).toEqual([1, 2]);

		coalescer.reset();
	});

	test("reset drains everything and clears all topics", () => {
		const coalescer = new MessageCoalescer();
		const { dispatched, dispatch } = makeSink();
		coalescer.register("/a", "lossy-latest", dispatch);
		coalescer.register("/b", "lossless-queue", dispatch);

		coalescer.push("/a", 1);
		coalescer.push("/b", 2);
		coalescer.reset();
		expect(dispatched.sort()).toEqual([1, 2]);

		coalescer.push("/a", 3);
		coalescer.drainAll();
		expect(dispatched).toHaveLength(2);
	});

	test("the shared tick drains without an explicit drainAll call", async () => {
		const coalescer = new MessageCoalescer();
		const { dispatched, dispatch } = makeSink();
		coalescer.register("/scan", "lossy-latest", dispatch);

		coalescer.push("/scan", 42);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(dispatched).toEqual([42]);

		coalescer.reset();
	});

	test("a throwing dispatch does not starve other topics", () => {
		const coalescer = new MessageCoalescer();
		const { dispatched, dispatch } = makeSink();
		coalescer.register("/bad", "lossy-latest", () => {
			throw new Error("boom");
		});
		coalescer.register("/good", "lossy-latest", dispatch);

		coalescer.push("/bad", 1);
		coalescer.push("/good", 2);
		coalescer.drainAll();

		expect(dispatched).toEqual([2]);

		coalescer.reset();
	});
});
