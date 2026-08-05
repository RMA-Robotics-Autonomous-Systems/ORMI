/**
 * Tests for the shared {@link MessageCoalescer} engine: lossy last-wins
 * overwriting, lossless FIFO ordering, the cap-triggered synchronous drain,
 * drain precedence, key removal (discard vs flush), tick lifecycle, the
 * per-tick decode budget, the per-topic decode-rate cap, string keys, error
 * isolation, and metrics emission.
 *
 * Budget/cap cases drive `drainAll()` directly with an injected clock — never
 * through live timers — so they are deterministic.
 */

import { describe, test, expect } from "bun:test";

import {
	MessageCoalescer,
	type CoalescerKey,
	type MessageCoalescerOptions,
} from "../message-coalescer";
import { metrics } from "../metrics/metrics-core";

interface Payload {
	key: number;
	seq: number;
}

const makeCoalescer = (options?: MessageCoalescerOptions) => {
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

	test("remove(key, true) flushes a lossless queue before deleting it", () => {
		const { coalescer, dispatched } = makeCoalescer();

		coalescer.push(7, { key: 7, seq: 1 }, true);
		coalescer.push(7, { key: 7, seq: 2 }, true);
		coalescer.remove(7, true);

		// Drained on remove, in order, before the key is gone.
		expect(dispatched.map((p) => p.seq)).toEqual([1, 2]);

		// Key is gone: a later push is a fresh queue, nothing duplicated.
		coalescer.push(7, { key: 7, seq: 3 }, true);
		coalescer.drainAll();
		expect(dispatched.map((p) => p.seq)).toEqual([1, 2, 3]);
	});

	test("remove(key, true) flushes the retained lossy latest before deleting", () => {
		const { coalescer, dispatched } = makeCoalescer();

		coalescer.push(3, { key: 3, seq: 1 }, false);
		coalescer.push(3, { key: 3, seq: 2 }, false);
		coalescer.remove(3, true);

		expect(dispatched).toEqual([{ key: 3, seq: 2 }]);

		// A subsequent drain adds nothing — the slot was removed.
		coalescer.drainAll();
		expect(dispatched).toHaveLength(1);
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

describe("MessageCoalescer — per-tick time budget", () => {
	test("a pass with more work than the budget yields and finishes the rest on the next pass, losing and duplicating nothing", () => {
		// Deterministic clock: each dispatch advances it, so the budget is
		// blown after a fixed number of decodes.
		let clock = 0;
		const now = () => clock;
		const dispatched: Payload[] = [];
		const coalescer = new MessageCoalescer<Payload>(
			(entry) => {
				dispatched.push(entry);
				clock += 2; // each decode "costs" 2 ms
			},
			{ budgetMs: 5, now },
		);

		// 10 lossless frames on one key — must drain in order across passes.
		for (let seq = 1; seq <= 10; seq++) {
			coalescer.push(7, { key: 7, seq }, true);
		}

		// First pass: ~3 decodes (2 ms each, budget 5) then a yield.
		const firstFinished = coalescer.drainAll();
		expect(firstFinished).toBe(false);
		expect(dispatched.length).toBeGreaterThan(0);
		expect(dispatched.length).toBeLessThan(10);

		// Keep pumping passes (as the catch-up tick would) until drained.
		let guard = 0;
		while (!coalescer.drainAll()) {
			if (++guard > 50) throw new Error("drain never finished");
		}

		// Every frame exactly once, in arrival order — no loss, no duplication.
		expect(dispatched.map((p) => p.seq)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		]);
	});

	test("lossy latest survives a budget yield triggered by lossless work", () => {
		let clock = 0;
		const now = () => clock;
		const dispatched: Payload[] = [];
		const coalescer = new MessageCoalescer<Payload>(
			(entry) => {
				dispatched.push(entry);
				clock += 4; // one dispatch already exceeds the 3 ms budget
			},
			{ budgetMs: 3, now },
		);

		coalescer.push(1, { key: 1, seq: 1 }, true); // lossless, drained first
		coalescer.push(2, { key: 2, seq: 99 }, false); // lossy latest

		// The single lossless dispatch blows the budget, deferring the lossy key.
		expect(coalescer.drainAll()).toBe(false);
		expect(dispatched.map((p) => `${p.key}:${p.seq}`)).toEqual(["1:1"]);

		// Next pass decodes the retained lossy latest — nothing was lost.
		expect(coalescer.drainAll()).toBe(true);
		expect(dispatched.map((p) => `${p.key}:${p.seq}`)).toEqual([
			"1:1",
			"2:99",
		]);
	});
});

describe("MessageCoalescer — per-topic decode-rate cap", () => {
	const CAP_MS = 80; // ~12.5 Hz ceiling

	test("coalesces a burst to LATEST at the cap rate and never drops the newest", () => {
		let clock = 0;
		const now = () => clock;
		const { coalescer, dispatched } = makeCoalescer({
			budgetMs: 1000, // large: isolate the cap from the budget
			now,
		});

		// Interleaved arrivals (~30 Hz) against a drain that also runs each
		// step; the cap must throttle decode to ~1 per CAP_MS window.
		const step = (t: number, seq: number) => {
			clock = t;
			coalescer.push(7, { key: 7, seq }, false, CAP_MS);
			coalescer.drainAll();
		};

		step(0, 1); // decode (first ever)
		step(33, 2); // deferred by cap
		step(66, 3); // deferred; overwrites the retained 2
		step(99, 4); // cap window elapsed → decode 4 (3 was shed)
		step(132, 5); // deferred
		step(165, 6); // deferred; overwrites 5
		step(198, 7); // decode 7 (6 was shed)
		step(231, 8); // deferred, retained

		// Quiet period: the newest retained frame must still decode.
		clock = 320;
		coalescer.drainAll();

		expect(dispatched.map((p) => p.seq)).toEqual([1, 4, 7, 8]);
		// The final frame pushed (8) is decoded — the newest is never dropped.
		expect(dispatched.at(-1)!.seq).toBe(8);
	});

	test("shed frames are counted in the drop metric (overwriteCount)", () => {
		let clock = 0;
		const now = () => clock;
		const { coalescer, dispatched } = makeCoalescer({
			budgetMs: 1000,
			now,
		});

		let pushed = 0;
		const step = (t: number, seq: number) => {
			clock = t;
			coalescer.push(7, { key: 7, seq }, false, CAP_MS);
			pushed++;
			coalescer.drainAll();
		};

		step(0, 1);
		step(33, 2);
		step(66, 3);
		step(99, 4);
		step(132, 5);
		step(165, 6);
		step(198, 7);
		step(231, 8);
		clock = 320;
		coalescer.drainAll();

		// Every pushed frame is either decoded or counted as a drop — the
		// produced-vs-delivered gap stays honest, nothing is silently hidden.
		expect(dispatched.length + coalescer.overwriteCount).toBe(pushed);
		expect(coalescer.overwriteCount).toBeGreaterThan(0);
	});

	test("an uncapped lossy topic decodes every drain (cap 0 = unaffected)", () => {
		let clock = 0;
		const now = () => clock;
		const { coalescer, dispatched } = makeCoalescer({
			budgetMs: 1000,
			now,
		});

		// No cap: each drain right after a push decodes the latest immediately.
		clock = 0;
		coalescer.push(7, { key: 7, seq: 1 }, false, 0);
		coalescer.drainAll();
		clock = 5; // well under any cap window
		coalescer.push(7, { key: 7, seq: 2 }, false, 0);
		coalescer.drainAll();

		expect(dispatched.map((p) => p.seq)).toEqual([1, 2]);
		expect(coalescer.overwriteCount).toBe(0);
	});
});

describe("MessageCoalescer — string keys", () => {
	test("lossy last-wins with string keys", () => {
		const dispatched: Array<[string, number]> = [];
		const coalescer = new MessageCoalescer<number, string>((entry, key) =>
			dispatched.push([key, entry]),
		);

		coalescer.push("/scan", 1, false);
		coalescer.push("/scan", 2, false);
		coalescer.push("/pose", 10, false);
		coalescer.drainAll();

		expect(dispatched).toEqual([
			["/scan", 2],
			["/pose", 10],
		]);
		expect(coalescer.overwriteCount).toBe(1);
	});

	test("lossless FIFO with string keys, drained in order", () => {
		const dispatched: number[] = [];
		const coalescer = new MessageCoalescer<number, string>((entry) =>
			dispatched.push(entry),
		);

		coalescer.push("/tf", 1, true);
		coalescer.push("/tf", 2, true);
		coalescer.push("/tf", 3, true);
		coalescer.drainAll();

		expect(dispatched).toEqual([1, 2, 3]);
	});
});

describe("MessageCoalescer — error isolation", () => {
	test("a throwing dispatch on one key does not stop another, and onError fires once", () => {
		const dispatched: number[] = [];
		const errors: Array<{ error: unknown; key: CoalescerKey }> = [];
		const coalescer = new MessageCoalescer<number, string>(
			(entry, key) => {
				if (key === "/bad") throw new Error("boom");
				dispatched.push(entry);
			},
			{ onError: (error, key) => errors.push({ error, key }) },
		);

		coalescer.push("/bad", 1, false);
		coalescer.push("/good", 2, false);
		coalescer.drainAll();

		expect(dispatched).toEqual([2]);
		expect(errors).toHaveLength(1);
		expect(errors[0]!.key).toBe("/bad");
		expect((errors[0]!.error as Error).message).toBe("boom");
	});
});

describe("MessageCoalescer — metrics", () => {
	test("emits overwrites, decoded, and (heavy) dispatchMs into the registry", () => {
		metrics.reset();
		metrics.heavy = true;

		const overwritesId = metrics.counter("test.coalescer.overwrites");
		const decodedId = metrics.counter("test.coalescer.decoded");
		const dispatchMsId = metrics.ring("test.coalescer.dispatchMs");

		let clock = 0;
		const coalescer = new MessageCoalescer<number>(() => {}, {
			budgetMs: 1000, // isolate from the budget
			now: () => clock,
			metrics: {
				overwrites: overwritesId,
				decoded: decodedId,
				dispatchMs: dispatchMsId,
			},
		});

		// 200 Hz lossy stream (a frame every 5 ms) drained at ~30 Hz.
		let lastDrain = 0;
		let pushed = 0;
		for (let t = 0; t <= 1000; t += 5) {
			clock = t;
			coalescer.push(1, t, false);
			pushed++;
			if (t - lastDrain >= 33) {
				coalescer.drainAll();
				lastDrain = t;
			}
		}

		const snap = metrics.snapshot();
		const decoded = snap.counters.values[decodedId]!;
		const overwrites = snap.counters.values[overwritesId]!;

		// ~30 drains delivered one frame each; the rest were overwritten.
		expect(decoded).toBeGreaterThanOrEqual(25);
		expect(decoded).toBeLessThanOrEqual(35);
		expect(overwrites).toBeGreaterThanOrEqual(160);
		expect(overwrites).toBeLessThanOrEqual(180);
		// Every pushed frame is accounted for (delivered, dropped, or the one
		// still-pending slot at loop end).
		expect(decoded + overwrites).toBeGreaterThanOrEqual(pushed - 1);
		// Heavy tier on → dispatch durations were sampled.
		expect(snap.rings.values[dispatchMsId]!.length).toBeGreaterThan(0);

		metrics.reset();
	});

	test("dispatchMs ring stays empty when the heavy tier is off", () => {
		metrics.reset();
		metrics.heavy = false;

		const decodedId = metrics.counter("test.coalescer.decoded");
		const dispatchMsId = metrics.ring("test.coalescer.dispatchMs");

		const coalescer = new MessageCoalescer<number>(() => {}, {
			metrics: { decoded: decodedId, dispatchMs: dispatchMsId },
		});

		for (let i = 0; i < 10; i++) {
			coalescer.push(1, i, false);
			coalescer.drainAll();
		}

		const snap = metrics.snapshot();
		// The decoded counter is not heavy-gated, so it still advances...
		expect(snap.counters.values[decodedId]!).toBe(10);
		// ...but the dispatchMs ring was never written on the light tier.
		expect(snap.rings.values[dispatchMsId]!.length).toBe(0);

		metrics.reset();
	});
});
