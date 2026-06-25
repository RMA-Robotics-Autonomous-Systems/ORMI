import { describe, expect, it } from "bun:test";

import { collectSwarmLog, SwarmLogEntry } from "./swarm-log";

function sources(
	...entries: SwarmLogEntry[]
): Map<string, { data: unknown[] }> {
	return new Map([["topic", { data: entries }]]);
}

describe("collectSwarmLog", () => {
	const entries: SwarmLogEntry[] = [
		{ mission_id: "m1", log: "a", date: "t1", log_type: "INFO" },
		{ mission_id: "m2", log: "b", date: "t2", log_type: "WARN" },
		{ mission_id: "m1", log: "c", date: "t3", log_type: "INFO" },
	];

	it("returns all entries when no mission filter is set", () => {
		const out = collectSwarmLog(sources(...entries), null);
		expect(out.map((e) => e.log)).toEqual(["a", "b", "c"]);
	});

	it("filters to the active/pinned mission", () => {
		const out = collectSwarmLog(sources(...entries), "m1");
		expect(out.map((e) => e.log)).toEqual(["a", "c"]);
	});

	it("returns an empty list for a mission with no entries", () => {
		expect(collectSwarmLog(sources(...entries), "nope")).toEqual([]);
	});

	it("skips non-object buffer values", () => {
		const map = new Map([
			[
				"topic",
				{ data: [null, "junk", { mission_id: "m1", log: "ok" }] },
			],
		]);
		const out = collectSwarmLog(map, null);
		expect(out).toHaveLength(1);
		expect(out[0]!.log).toBe("ok");
	});
});
