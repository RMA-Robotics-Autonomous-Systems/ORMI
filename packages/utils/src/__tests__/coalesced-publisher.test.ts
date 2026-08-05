/**
 * Tests for {@link createCoalescedPublisher}, the thin opt-in wrapper over
 * {@link MessageCoalescer}: it must decode on the drain tick (not on push),
 * forward the decoded fields (incl. the transfer list) to the sink, honour
 * lossy-latest vs lossless-queue, skip emits when `decode` returns null, keep
 * keys independent, pass the per-topic decode-rate cap through, and expose a
 * lifecycle (start/stop/remove).
 *
 * Drains are driven directly via `drainAll()` with an injected clock — never
 * through live timers — so every case is deterministic.
 */

import { describe, test, expect } from "bun:test";

import {
	createCoalescedPublisher,
	type DecodedMessage,
} from "../coalesced-publisher";

interface Raw {
	seq: number;
	topic: string;
}

interface SinkCall {
	topic: string;
	data: unknown;
	time?: number;
	frame?: string;
	transfer?: Transferable[];
}

/**
 * Build a publisher with recording sink + decode. `now` is a controllable clock
 * (defaults to a constant 0, so the drain budget never trips). `decode`
 * defaults to a pass-through that records each call.
 */
const setup = (options?: {
	decode?: (raw: Raw, key: number) => DecodedMessage | null;
	now?: () => number;
}) => {
	const sinkCalls: SinkCall[] = [];
	const decodedKeys: Array<{ seq: number; key: number }> = [];

	const defaultDecode = (raw: Raw, key: number): DecodedMessage | null => {
		decodedKeys.push({ seq: raw.seq, key });
		return {
			topic: raw.topic,
			data: { seq: raw.seq },
			time: raw.seq,
			frame: `frame-${raw.seq}`,
		};
	};

	const publisher = createCoalescedPublisher<Raw, number>(
		(topic, data, time, frame, transfer) =>
			sinkCalls.push({ topic, data, time, frame, transfer }),
		options?.decode ?? defaultDecode,
		{ now: options?.now ?? (() => 0) },
	);

	return { publisher, sinkCalls, decodedKeys };
};

describe("createCoalescedPublisher — decode + emit on drain", () => {
	test("push does not decode; drain decodes then emits once with all fields", () => {
		const buffer = new Uint8Array([1, 2, 3]).buffer;
		const { publisher, sinkCalls, decodedKeys } = setup({
			decode: (raw) => ({
				topic: raw.topic,
				data: { seq: raw.seq },
				time: 42,
				frame: "base_link",
				transfer: [buffer],
			}),
		});

		publisher.push(1, { seq: 1, topic: "/a" }, false);
		// Nothing decoded or emitted before the drain tick.
		expect(decodedKeys.length).toBe(0);
		expect(sinkCalls.length).toBe(0);

		publisher.drainAll();

		expect(sinkCalls.length).toBe(1);
		expect(sinkCalls[0]).toEqual({
			topic: "/a",
			data: { seq: 1 },
			time: 42,
			frame: "base_link",
			transfer: [buffer],
		});
	});
});

describe("createCoalescedPublisher — lossy-latest", () => {
	test("two pushes on one key before drain → emits only the latest and counts an overwrite", () => {
		const { publisher, sinkCalls } = setup();

		publisher.push(1, { seq: 1, topic: "/pose" }, false);
		publisher.push(1, { seq: 2, topic: "/pose" }, false);

		expect(publisher.overwriteCount).toBe(1);

		publisher.drainAll();

		expect(sinkCalls.length).toBe(1);
		expect(sinkCalls[0]!.data).toEqual({ seq: 2 });
	});
});

describe("createCoalescedPublisher — lossless-queue", () => {
	test("two pushes on one key lossless → both drained in arrival order", () => {
		const { publisher, sinkCalls } = setup();

		publisher.push(1, { seq: 1, topic: "/tf" }, true);
		publisher.push(1, { seq: 2, topic: "/tf" }, true);

		expect(publisher.overwriteCount).toBe(0);

		publisher.drainAll();

		expect(sinkCalls.map((c) => c.data)).toEqual([{ seq: 1 }, { seq: 2 }]);
	});
});

describe("createCoalescedPublisher — decode returning null", () => {
	test("a null decode skips the emit for that item", () => {
		const { publisher, sinkCalls } = setup({
			decode: (raw) =>
				raw.seq === 1
					? null
					: { topic: raw.topic, data: { seq: raw.seq } },
		});

		publisher.push(1, { seq: 1, topic: "/a" }, true);
		publisher.push(1, { seq: 2, topic: "/a" }, true);

		publisher.drainAll();

		// seq 1 decoded to null (skipped); seq 2 emitted.
		expect(sinkCalls.length).toBe(1);
		expect(sinkCalls[0]!.data).toEqual({ seq: 2 });
	});
});

describe("createCoalescedPublisher — independent keys", () => {
	test("keys drain independently in one pass", () => {
		const { publisher, sinkCalls } = setup();

		publisher.push(1, { seq: 1, topic: "/a" }, false);
		publisher.push(2, { seq: 2, topic: "/b" }, false);

		publisher.drainAll();

		const byTopic = new Map(sinkCalls.map((c) => [c.topic, c.data]));
		expect(sinkCalls.length).toBe(2);
		expect(byTopic.get("/a")).toEqual({ seq: 1 });
		expect(byTopic.get("/b")).toEqual({ seq: 2 });
	});
});

describe("createCoalescedPublisher — per-topic decode-rate cap", () => {
	test("minDecodeIntervalMs defers a lossy key that decoded too recently", () => {
		let clock = 0;
		const { publisher, sinkCalls } = setup({ now: () => clock });

		// First frame decodes at t=0.
		publisher.push(1, { seq: 1, topic: "/cloud" }, false, 100);
		publisher.drainAll();
		expect(sinkCalls.length).toBe(1);

		// Second frame arrives and drains 10ms later — inside the 100ms cap, so
		// it is held (not decoded) and the newest is kept.
		clock = 10;
		publisher.push(1, { seq: 2, topic: "/cloud" }, false, 100);
		publisher.drainAll();
		expect(sinkCalls.length).toBe(1);

		// Past the cap → the held newest frame decodes.
		clock = 120;
		publisher.drainAll();
		expect(sinkCalls.length).toBe(2);
		expect(sinkCalls[1]!.data).toEqual({ seq: 2 });
	});
});

describe("createCoalescedPublisher — lifecycle", () => {
	test("start is idempotent and stop discards undrained payloads", () => {
		const { publisher, sinkCalls } = setup();

		publisher.start();
		publisher.start(); // idempotent — must not throw or double-schedule.

		publisher.push(1, { seq: 1, topic: "/a" }, false);
		publisher.stop(); // discards the undrained frame and clears the tick.

		publisher.drainAll();
		expect(sinkCalls.length).toBe(0);
	});

	test("remove(key) drops one stream without touching others", () => {
		const { publisher, sinkCalls } = setup();

		publisher.push(1, { seq: 1, topic: "/a" }, false);
		publisher.push(2, { seq: 2, topic: "/b" }, false);
		publisher.remove(1);

		publisher.drainAll();

		expect(sinkCalls.length).toBe(1);
		expect(sinkCalls[0]!.topic).toBe("/b");
	});

	test("remove(key, true) flushes the queued payloads before dropping", () => {
		const { publisher, sinkCalls } = setup();

		publisher.push(1, { seq: 1, topic: "/tf" }, true);
		publisher.push(1, { seq: 2, topic: "/tf" }, true);
		publisher.remove(1, true);

		// Flushed synchronously on remove — no drain needed.
		expect(sinkCalls.map((c) => c.data)).toEqual([{ seq: 1 }, { seq: 2 }]);

		publisher.drainAll();
		expect(sinkCalls.length).toBe(2);
	});
});
