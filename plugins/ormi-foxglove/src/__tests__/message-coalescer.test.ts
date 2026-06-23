/**
 * Tests for the raw-message coalescer used by the main-thread Foxglove path:
 * lossy last-wins overwriting, lossless FIFO ordering, the cap-triggered
 * synchronous drain, drain precedence, key removal, and tick lifecycle.
 */

import { describe, test, expect } from "bun:test";

import { MessageCoalescer } from "../message-coalescer";

interface Payload {
	key: number;
	seq: number;
}

const makeCoalescer = (options?: {
	intervalMs?: number;
	losslessCap?: number;
}) => {
	const dispatched: Payload[] = [];
	const coalescer = new MessageCoalescer<Payload>(
		(entry) => dispatched.push(entry),
		options,
	);
	return { coalescer, dispatched };
};

describe("MessageCoalescer — lossy-latest mode", () => {
	test("keeps only the newest payload per key and counts overwrites", () => {
		const { coalescer, dispatched } = makeCoalescer();

		coalescer.push(1, { key: 1, seq: 1 }, false);
		coalescer.push(1, { key: 1, seq: 2 }, false);
		coalescer.push(1, { key: 1, seq: 3 }, false);

		expect(dispatched).toHaveLength(0); // nothing dispatched on arrival

		coalescer.drainAll();

		expect(dispatched).toEqual([{ key: 1, seq: 3 }]);
		expect(coalescer.overwriteCount).toBe(2);
	});

	test("a drained slot dispatches nothing until a new payload arrives", () => {
		const { coalescer, dispatched } = makeCoalescer();

		coalescer.push(1, { key: 1, seq: 1 }, false);
		coalescer.drainAll();
		coalescer.drainAll();

		expect(dispatched).toHaveLength(1);

		coalescer.push(1, { key: 1, seq: 2 }, false);
		coalescer.drainAll();

		expect(dispatched).toEqual([
			{ key: 1, seq: 1 },
			{ key: 1, seq: 2 },
		]);
		// Replacing an already-drained slot is not an overwrite.
		expect(coalescer.overwriteCount).toBe(0);
	});

	test("keys are coalesced independently", () => {
		const { coalescer, dispatched } = makeCoalescer();

		coalescer.push(1, { key: 1, seq: 1 }, false);
		coalescer.push(2, { key: 2, seq: 1 }, false);
		coalescer.push(1, { key: 1, seq: 2 }, false);

		coalescer.drainAll();

		expect(dispatched).toEqual([
			{ key: 1, seq: 2 },
			{ key: 2, seq: 1 },
		]);
		expect(coalescer.overwriteCount).toBe(1);
	});
});

describe("MessageCoalescer — lossless-queue mode", () => {
	test("dispatches every payload in arrival order", () => {
		const { coalescer, dispatched } = makeCoalescer();

		coalescer.push(7, { key: 7, seq: 1 }, true);
		coalescer.push(7, { key: 7, seq: 2 }, true);
		coalescer.push(7, { key: 7, seq: 3 }, true);

		expect(dispatched).toHaveLength(0);

		coalescer.drainAll();

		expect(dispatched.map((p) => p.seq)).toEqual([1, 2, 3]);
		expect(coalescer.overwriteCount).toBe(0);

		coalescer.drainAll();
		expect(dispatched).toHaveLength(3); // queue was emptied
	});

	test("drains synchronously when the queue reaches its cap, losing nothing", () => {
		const { coalescer, dispatched } = makeCoalescer({ losslessCap: 4 });

		for (let seq = 1; seq <= 4; seq++) {
			coalescer.push(7, { key: 7, seq }, true);
		}
		expect(dispatched).toHaveLength(0);

		// The 5th push finds a full queue: the queued 4 are dispatched
		// immediately, then the new payload is queued for the next drain.
		coalescer.push(7, { key: 7, seq: 5 }, true);
		expect(dispatched.map((p) => p.seq)).toEqual([1, 2, 3, 4]);

		coalescer.drainAll();
		expect(dispatched.map((p) => p.seq)).toEqual([1, 2, 3, 4, 5]);
	});

	test("lossless queues drain before lossy entries within a tick", () => {
		const { coalescer, dispatched } = makeCoalescer();

		coalescer.push(1, { key: 1, seq: 1 }, false);
		coalescer.push(7, { key: 7, seq: 1 }, true);
		coalescer.push(7, { key: 7, seq: 2 }, true);

		coalescer.drainAll();

		expect(dispatched.map((p) => `${p.key}:${p.seq}`)).toEqual([
			"7:1",
			"7:2",
			"1:1",
		]);
	});
});

describe("MessageCoalescer — lifecycle", () => {
	test("remove() discards stashed payloads for a key only", () => {
		const { coalescer, dispatched } = makeCoalescer();

		coalescer.push(1, { key: 1, seq: 1 }, false);
		coalescer.push(7, { key: 7, seq: 1 }, true);
		coalescer.remove(7);

		coalescer.drainAll();

		expect(dispatched).toEqual([{ key: 1, seq: 1 }]);
	});

	test("stop() discards all undrained payloads", () => {
		const { coalescer, dispatched } = makeCoalescer();

		coalescer.push(1, { key: 1, seq: 1 }, false);
		coalescer.push(7, { key: 7, seq: 1 }, true);
		coalescer.stop();

		coalescer.drainAll();

		expect(dispatched).toHaveLength(0);
	});

	test("the started tick drains on its own; stop() halts it", async () => {
		const { coalescer, dispatched } = makeCoalescer({ intervalMs: 5 });

		coalescer.start();
		coalescer.start(); // idempotent

		coalescer.push(1, { key: 1, seq: 1 }, false);
		await Bun.sleep(30);

		expect(dispatched).toEqual([{ key: 1, seq: 1 }]);

		coalescer.stop();
		coalescer.push(1, { key: 1, seq: 2 }, false);
		await Bun.sleep(30);

		expect(dispatched).toHaveLength(1);
	});
});
