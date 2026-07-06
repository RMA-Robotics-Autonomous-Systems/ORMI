import { describe, expect, it } from "bun:test";

import { PlannerStateCode } from "../types/planner-state";
import { latestPlannerState } from "./planner-state-source";

/** A `std_msgs/String` message wrapping a planner-state JSON payload. */
function plannerMsg(entries: { mission_id: string; state: number }[]): {
	data: string;
} {
	return { data: JSON.stringify({ planners: entries }) };
}

/** Build a size-1 buffered sources map from a list of buffer tails. */
function sourcesOf(...buffers: unknown[][]): Map<string, { data: unknown[] }> {
	const map = new Map<string, { data: unknown[] }>();
	buffers.forEach((data, i) => map.set(`topic-${i}`, { data }));
	return map;
}

describe("latestPlannerState", () => {
	it("returns an empty map for an empty sources map", () => {
		expect(latestPlannerState(new Map())).toEqual({});
	});

	it("returns an empty map when the buffer tail is null/undefined", () => {
		expect(latestPlannerState(sourcesOf([null]))).toEqual({});
		expect(latestPlannerState(sourcesOf([undefined]))).toEqual({});
	});

	it("parses the std_msgs/String planner-state message", () => {
		const sources = sourcesOf([
			plannerMsg([{ mission_id: "m1", state: PlannerStateCode.FAILED }]),
		]);
		expect(latestPlannerState(sources)).toEqual({ m1: "failed" });
	});

	it("reads the LAST element of a multi-element buffer", () => {
		const sources = sourcesOf([
			plannerMsg([
				{ mission_id: "m1", state: PlannerStateCode.PLANNING },
			]),
			plannerMsg([{ mission_id: "m1", state: PlannerStateCode.FAILED }]),
		]);
		expect(latestPlannerState(sources)).toEqual({ m1: "failed" });
	});

	it("keeps the last NON-EMPTY map — garbage never blanks a good map", () => {
		const sources = sourcesOf(
			[
				plannerMsg([
					{ mission_id: "ok", state: PlannerStateCode.PLANNED },
				]),
			],
			[{ data: "not-json" }],
		);
		expect(latestPlannerState(sources)).toEqual({ ok: "planned" });
	});

	it("returns an empty map when no source carries a parseable payload", () => {
		const sources = sourcesOf([{ data: "garbage" }]);
		expect(latestPlannerState(sources)).toEqual({});
	});
});
