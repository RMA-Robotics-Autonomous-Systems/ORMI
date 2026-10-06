import { describe, expect, it } from "bun:test";

import {
	describePin,
	diagnosticKey,
	readPinned,
	togglePin,
} from "../diagnostic-pins";

describe("readPinned", () => {
	it("reads a missing or malformed setting as no pins", () => {
		expect(readPinned(undefined)).toEqual([]);
		expect(readPinned(null)).toEqual([]);
		expect(readPinned("a::b::c")).toEqual([]);
		expect(readPinned({ 0: "a" })).toEqual([]);
	});

	it("skips non-string and empty items and keeps the order", () => {
		expect(readPinned(["b", 3, "", null, "a"])).toEqual(["b", "a"]);
	});

	it("drops duplicates, first occurrence wins", () => {
		expect(readPinned(["a", "b", "a"])).toEqual(["a", "b"]);
	});
});

describe("togglePin", () => {
	it("appends a new pin so existing pins keep their place", () => {
		expect(togglePin(["a", "b"], "c")).toEqual(["a", "b", "c"]);
	});

	it("removes an existing pin without reordering the rest", () => {
		expect(togglePin(["a", "b", "c"], "b")).toEqual(["a", "c"]);
	});

	it("never mutates its input", () => {
		const pinned = ["a"];
		togglePin(pinned, "b");
		togglePin(pinned, "a");
		expect(pinned).toEqual(["a"]);
	});
});

describe("describePin", () => {
	it("recovers the hardware id and name from a key", () => {
		const key = diagnosticKey(
			"src-1",
			"lidar_front",
			"/lidar/driver: rate",
		);
		expect(describePin(key)).toEqual({
			hardwareId: "lidar_front",
			name: "/lidar/driver: rate",
		});
	});

	it("handles an empty hardware id", () => {
		expect(describePin(diagnosticKey("src-1", "", "cpu"))).toEqual({
			hardwareId: "",
			name: "cpu",
		});
	});

	it("keeps a separator that belongs to the status name", () => {
		const key = diagnosticKey("src-1", "hw", "nav::Planner: status");
		expect(describePin(key).name).toBe("nav::Planner: status");
	});

	it("names a key it cannot parse by the key itself", () => {
		expect(describePin("garbage")).toEqual({
			hardwareId: "",
			name: "garbage",
		});
	});
});
