import { describe, expect, it } from "bun:test";

import {
	PlannerStateCode,
	parsePlannerState,
	plannerStateFromCode,
	plannerStateSignature,
} from "./planner-state";

/** A minimal valid planner-state payload JSON string. */
function plannerJson(entries: { mission_id: string; state: number }[]): string {
	return JSON.stringify({ planners: entries });
}

/** A `std_msgs/String` wire message wrapping a planner-state JSON string. */
function stringMsg(json: string): { data: string } {
	return { data: json };
}

describe("plannerStateFromCode", () => {
	it("maps the four known integer codes", () => {
		expect(plannerStateFromCode(PlannerStateCode.INITIALIZED)).toBe(
			"initialized",
		);
		expect(plannerStateFromCode(PlannerStateCode.PLANNING)).toBe(
			"planning",
		);
		expect(plannerStateFromCode(PlannerStateCode.PLANNED)).toBe("planned");
		expect(plannerStateFromCode(PlannerStateCode.FAILED)).toBe("failed");
	});

	it("returns null for an unknown code (never crashes)", () => {
		expect(plannerStateFromCode(99)).toBeNull();
		expect(plannerStateFromCode(-1)).toBeNull();
	});
});

describe("parsePlannerState", () => {
	it("returns an empty map for null/undefined", () => {
		expect(parsePlannerState(null)).toEqual({});
		expect(parsePlannerState(undefined)).toEqual({});
	});

	it("parses the std_msgs/String `data` wrapper into a per-mission map", () => {
		const msg = stringMsg(
			plannerJson([
				{ mission_id: "m1", state: PlannerStateCode.FAILED },
				{ mission_id: "m2", state: PlannerStateCode.PLANNING },
			]),
		);
		expect(parsePlannerState(msg)).toEqual({
			m1: "failed",
			m2: "planning",
		});
	});

	it("parses a raw JSON string directly", () => {
		const json = plannerJson([
			{ mission_id: "m1", state: PlannerStateCode.PLANNED },
		]);
		expect(parsePlannerState(json)).toEqual({ m1: "planned" });
	});

	it("tolerates an already-parsed payload object (no wrapper)", () => {
		const payload = {
			planners: [
				{ mission_id: "m3", state: PlannerStateCode.INITIALIZED },
			],
		};
		expect(parsePlannerState(payload)).toEqual({ m3: "initialized" });
	});

	it("returns an empty map on malformed JSON (never throws)", () => {
		expect(parsePlannerState(stringMsg("not-json"))).toEqual({});
		expect(parsePlannerState("{ broken")).toEqual({});
	});

	it("returns an empty map when `planners` is missing or not an array", () => {
		expect(parsePlannerState(stringMsg(JSON.stringify({})))).toEqual({});
		expect(
			parsePlannerState(stringMsg(JSON.stringify({ planners: "nope" }))),
		).toEqual({});
	});

	it("skips entries missing a string mission_id", () => {
		const msg = stringMsg(
			JSON.stringify({
				planners: [
					{ state: PlannerStateCode.FAILED },
					{ mission_id: 42, state: PlannerStateCode.FAILED },
					{ mission_id: "ok", state: PlannerStateCode.FAILED },
				],
			}),
		);
		expect(parsePlannerState(msg)).toEqual({ ok: "failed" });
	});

	it("skips entries with a non-numeric or unknown state code", () => {
		const msg = stringMsg(
			JSON.stringify({
				planners: [
					{ mission_id: "a", state: "failed" },
					{ mission_id: "b", state: 99 },
					{ mission_id: "c", state: PlannerStateCode.PLANNED },
				],
			}),
		);
		expect(parsePlannerState(msg)).toEqual({ c: "planned" });
	});

	it("returns an empty map (not null) when no entry is parseable", () => {
		expect(parsePlannerState(stringMsg(plannerJson([])))).toEqual({});
	});
});

describe("plannerStateSignature", () => {
	it("is identical for identical maps regardless of key order", () => {
		const a = plannerStateSignature({ m1: "failed", m2: "planned" });
		const b = plannerStateSignature({ m2: "planned", m1: "failed" });
		expect(a).toBe(b);
	});

	it("differs when a mission's state changes", () => {
		const before = plannerStateSignature({ m1: "planning" });
		const after = plannerStateSignature({ m1: "failed" });
		expect(before).not.toBe(after);
	});

	it("differs when a mission is added or removed", () => {
		const one = plannerStateSignature({ m1: "planned" });
		const two = plannerStateSignature({ m1: "planned", m2: "planning" });
		expect(one).not.toBe(two);
	});

	it("is empty for an empty map", () => {
		expect(plannerStateSignature({})).toBe("");
	});
});
