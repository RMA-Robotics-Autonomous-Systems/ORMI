import { describe, expect, it } from "bun:test";

import {
	SwarmLogType,
	parseSwarmLogType,
	swarmLogRowClass,
	swarmLogTypeClass,
	swarmLogTypeLabel,
} from "./log-type";

/**
 * `log_type` used to be rendered as a bare integer, so a FATAL line read `[3]`.
 *
 * ⚠ The mapping follows `centralized_msgs/json/Enums.hpp`
 * (`INFO=0, WARNING=1, ERROR=2, FATAL=3`) and deliberately NOT the backend's own
 * `EnumsTools.hpp` helper, whose switch is missing `break` statements.
 */

describe("parseSwarmLogType", () => {
	it("decodes the numeric enum (the wire form)", () => {
		expect(parseSwarmLogType(0)).toBe(SwarmLogType.INFO);
		expect(parseSwarmLogType(1)).toBe(SwarmLogType.WARNING);
		expect(parseSwarmLogType(2)).toBe(SwarmLogType.ERROR);
		expect(parseSwarmLogType(3)).toBe(SwarmLogType.FATAL);
	});

	it("decodes a numeric string", () => {
		expect(parseSwarmLogType("2")).toBe(SwarmLogType.ERROR);
	});

	it("decodes a name, in either spelling and any case", () => {
		expect(parseSwarmLogType("ERROR")).toBe(SwarmLogType.ERROR);
		expect(parseSwarmLogType("warn")).toBe(SwarmLogType.WARNING);
		expect(parseSwarmLogType("Warning")).toBe(SwarmLogType.WARNING);
	});

	it("refuses to guess at an unknown value", () => {
		// A widened backend enum must not be silently mislabelled as INFO.
		expect(parseSwarmLogType(4)).toBeNull();
		expect(parseSwarmLogType(-1)).toBeNull();
		expect(parseSwarmLogType(1.5)).toBeNull();
		expect(parseSwarmLogType("chatty")).toBeNull();
		expect(parseSwarmLogType(null)).toBeNull();
		expect(parseSwarmLogType(undefined)).toBeNull();
	});
});

describe("swarmLogTypeLabel", () => {
	it("names each severity", () => {
		expect(swarmLogTypeLabel(0)).toBe("INFO");
		expect(swarmLogTypeLabel(1)).toBe("WARN");
		expect(swarmLogTypeLabel(2)).toBe("ERROR");
		expect(swarmLogTypeLabel(3)).toBe("FATAL");
	});

	it("shows an undecodable value rather than dropping it", () => {
		expect(swarmLogTypeLabel(9)).toBe("9");
		expect(swarmLogTypeLabel(null)).toBe("?");
	});
});

describe("severity styling", () => {
	it("escalates: INFO muted, FATAL loudest", () => {
		expect(swarmLogTypeClass(0)).toContain("muted");
		expect(swarmLogTypeClass(1)).toContain("warning");
		expect(swarmLogTypeClass(2)).toContain("destructive");
		expect(swarmLogTypeClass(3)).toContain("destructive");
	});

	it("leaves INFO rows unhighlighted — it is 96% of the volume", () => {
		expect(swarmLogRowClass(0)).toBe("");
		expect(swarmLogRowClass(2)).not.toBe("");
	});

	it("falls back to muted styling for an undecodable value", () => {
		expect(swarmLogTypeClass(99)).toContain("muted");
		expect(swarmLogRowClass(99)).toBe("");
	});
});
