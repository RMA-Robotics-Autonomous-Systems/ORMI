import { describe, expect, it } from "bun:test";

import type { SwarmLogEntry } from "./swarm-log";
import {
	ALL_MISSIONS_KEY,
	MAX_MISSION_BUCKETS,
	PER_MISSION_CAP,
	clearSwarmLog,
	createSwarmLogBuffer,
	ingestSwarmLog,
	readSwarmLog,
} from "./swarm-log-buffer";

/**
 * One shared 200-message buffer used to be filtered per mission, so a busy
 * mission starved the selected one's log.
 */

function entry(mission: string, log: string): SwarmLogEntry {
	return { mission_id: mission, log, log_type: 0 };
}

describe("ingestSwarmLog", () => {
	it("keeps each mission's history in its own ring", () => {
		const buffer = createSwarmLogBuffer();
		ingestSwarmLog(buffer, [entry("m1", "a"), entry("m2", "b")]);
		expect(readSwarmLog(buffer, "m1").map((e) => e.log)).toEqual(["a"]);
		expect(readSwarmLog(buffer, "m2").map((e) => e.log)).toEqual(["b"]);
	});

	it("a flood on one mission does not evict another's log", () => {
		// The measured reality: one mission emitted 265,784 lines in ~9.8 h. Under
		// the old shared buffer that flushed the watched mission's log away in
		// seconds and the widget showed "no entries" for a mission that had spoken.
		const buffer = createSwarmLogBuffer();
		ingestSwarmLog(buffer, [entry("quiet", "the one line that matters")]);
		const flood = Array.from({ length: 5000 }, (_, i) =>
			entry("noisy", `spam ${i}`),
		);
		ingestSwarmLog(buffer, flood);

		expect(readSwarmLog(buffer, "quiet").map((e) => e.log)).toEqual([
			"the one line that matters",
		]);
		expect(readSwarmLog(buffer, "noisy")).toHaveLength(200);
	});

	it("caps each ring and keeps the NEWEST entries", () => {
		const buffer = createSwarmLogBuffer();
		ingestSwarmLog(
			buffer,
			Array.from({ length: 250 }, (_, i) => entry("m1", `line ${i}`)),
			10,
		);
		const kept = readSwarmLog(buffer, "m1").map((e) => e.log);
		expect(kept).toHaveLength(10);
		expect(kept[0]).toBe("line 240");
		expect(kept[9]).toBe("line 249");
	});

	it("is idempotent over an overlapping arrival window", () => {
		// The transport hands back a rolling window that overlaps the previous
		// flush; re-ingesting it must not duplicate entries.
		const buffer = createSwarmLogBuffer();
		const a = entry("m1", "a");
		const b = entry("m1", "b");
		const c = entry("m1", "c");
		expect(ingestSwarmLog(buffer, [a, b])).toBe(2);
		expect(ingestSwarmLog(buffer, [a, b, c])).toBe(1);
		expect(readSwarmLog(buffer, "m1").map((e) => e.log)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("keeps byte-identical repeated lines — dedup is by identity", () => {
		// This system emits the SAME message a quarter-million times; collapsing
		// duplicates by content would hide exactly the runaway loop that matters.
		const buffer = createSwarmLogBuffer();
		const repeated = "Requested status change not allowed: 1";
		ingestSwarmLog(buffer, [
			entry("m1", repeated),
			entry("m1", repeated),
			entry("m1", repeated),
		]);
		expect(readSwarmLog(buffer, "m1")).toHaveLength(3);
	});

	it("collects every mission into the unfiltered view, in arrival order", () => {
		const buffer = createSwarmLogBuffer();
		ingestSwarmLog(buffer, [
			entry("m1", "a"),
			entry("m2", "b"),
			entry("m1", "c"),
		]);
		expect(readSwarmLog(buffer, null).map((e) => e.log)).toEqual([
			"a",
			"b",
			"c",
		]);
		expect(readSwarmLog(buffer, ALL_MISSIONS_KEY)).toHaveLength(3);
	});

	it("buckets entries with no mission_id without losing them", () => {
		const buffer = createSwarmLogBuffer();
		ingestSwarmLog(buffer, [{ log: "orphan" }]);
		expect(readSwarmLog(buffer, null).map((e) => e.log)).toEqual([
			"orphan",
		]);
	});

	it("skips non-object buffer values", () => {
		const buffer = createSwarmLogBuffer();
		expect(
			ingestSwarmLog(buffer, [null, "junk", 7, entry("m1", "ok")]),
		).toBe(1);
	});

	it("bumps `version` only when something was appended", () => {
		const buffer = createSwarmLogBuffer();
		const a = entry("m1", "a");
		ingestSwarmLog(buffer, [a]);
		const after = buffer.version;
		ingestSwarmLog(buffer, [a]);
		expect(buffer.version).toBe(after);
	});

	it("returns an empty list for an unknown mission", () => {
		expect(readSwarmLog(createSwarmLogBuffer(), "nope")).toEqual([]);
	});
});

describe("mission bucket eviction", () => {
	it("evicts the least-recently-written mission beyond the bucket limit", () => {
		const buffer = createSwarmLogBuffer();
		const opts = { maxMissions: 2 };
		ingestSwarmLog(buffer, [entry("m1", "a")], PER_MISSION_CAP, opts);
		ingestSwarmLog(buffer, [entry("m2", "b")], PER_MISSION_CAP, opts);
		// m1 written again: m2 is now the least recent.
		ingestSwarmLog(buffer, [entry("m1", "c")], PER_MISSION_CAP, opts);
		ingestSwarmLog(buffer, [entry("m3", "d")], PER_MISSION_CAP, opts);

		expect(readSwarmLog(buffer, "m2")).toEqual([]);
		expect(readSwarmLog(buffer, "m1").map((e) => e.log)).toEqual([
			"a",
			"c",
		]);
		expect(readSwarmLog(buffer, "m3").map((e) => e.log)).toEqual(["d"]);
		// The unfiltered view is not a mission and is never evicted.
		expect(readSwarmLog(buffer, null)).toHaveLength(4);
	});

	it("never evicts the mission being viewed, however quiet", () => {
		const buffer = createSwarmLogBuffer();
		const opts = { maxMissions: 2, keep: "quiet" };
		ingestSwarmLog(buffer, [entry("quiet", "q")], PER_MISSION_CAP, opts);
		for (let i = 0; i < 10; i += 1) {
			ingestSwarmLog(
				buffer,
				[entry(`busy-${i}`, "x")],
				PER_MISSION_CAP,
				opts,
			);
		}
		expect(readSwarmLog(buffer, "quiet").map((e) => e.log)).toEqual(["q"]);
		expect(readSwarmLog(buffer, "busy-9")).toHaveLength(1);
		expect(readSwarmLog(buffer, "busy-0")).toEqual([]);
	});

	it("bounds the bucket count at the default limit", () => {
		const buffer = createSwarmLogBuffer();
		for (let i = 0; i < MAX_MISSION_BUCKETS * 3; i += 1) {
			ingestSwarmLog(buffer, [entry(`m${i}`, "x")]);
		}
		// Mission buckets plus the "all missions" bucket.
		expect(buffer.byMission.size).toBe(MAX_MISSION_BUCKETS + 1);
	});
});

describe("clearSwarmLog", () => {
	it("drops everything and re-accepts previously seen entries", () => {
		const buffer = createSwarmLogBuffer();
		const a = entry("m1", "a");
		ingestSwarmLog(buffer, [a]);
		clearSwarmLog(buffer);
		expect(readSwarmLog(buffer, "m1")).toEqual([]);
		expect(ingestSwarmLog(buffer, [a])).toBe(1);
	});
});

describe("UUID mission ids (unique_identifier_msgs/UUID)", () => {
	const BYTES = [
		0x3f, 0x2a, 0x9c, 0x10, 0x5b, 0x7e, 0x4d, 0x21, 0x8a, 0x0b, 0xc4, 0xde,
		0xf0, 0x12, 0x34, 0x56,
	];
	const ID = "3f2a9c10-5b7e-4d21-8a0b-c4def0123456";

	it("files a { uuid: bytes } entry under the mission's string id", () => {
		const buffer = createSwarmLogBuffer();
		ingestSwarmLog(buffer, [
			{ mission_id: { uuid: BYTES }, log: "from the wire", log_type: 0 },
		]);
		expect(readSwarmLog(buffer, ID).map((e) => e.log)).toEqual([
			"from the wire",
		]);
		// Not in the no-mission bucket, which is where it used to land.
		expect(readSwarmLog(buffer, ALL_MISSIONS_KEY)).toHaveLength(1);
	});

	it("matches a base64 uuid and an upper-case selection", () => {
		const buffer = createSwarmLogBuffer();
		ingestSwarmLog(buffer, [
			{
				mission_id: { uuid: btoa(String.fromCharCode(...BYTES)) },
				log: "rosbridge",
			},
		]);
		expect(readSwarmLog(buffer, ID.toUpperCase())).toHaveLength(1);
	});

	it("tolerates an entry without `date`", () => {
		const buffer = createSwarmLogBuffer();
		ingestSwarmLog(buffer, [{ mission_id: { uuid: BYTES }, log: "x" }]);
		expect(readSwarmLog(buffer, ID)[0]?.date).toBeUndefined();
	});
});
