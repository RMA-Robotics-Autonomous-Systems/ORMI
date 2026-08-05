import { describe, expect, it } from "bun:test";

import { agentStateLabel } from "./agent-state-labels";

describe("agentStateLabel", () => {
	it("labels the known numeric states", () => {
		expect(agentStateLabel(0)).toBe("Inactive");
		expect(agentStateLabel(1)).toBe("Active");
	});

	it("labels numeric-string states", () => {
		expect(agentStateLabel("0")).toBe("Inactive");
		expect(agentStateLabel("1")).toBe("Active");
	});

	it("labels enum-name strings (case-insensitive)", () => {
		expect(agentStateLabel("ACTIVE")).toBe("Active");
		expect(agentStateLabel("inactive")).toBe("Inactive");
	});

	it("returns Unknown for null/undefined/empty", () => {
		expect(agentStateLabel(null)).toBe("Unknown");
		expect(agentStateLabel(undefined)).toBe("Unknown");
		expect(agentStateLabel("")).toBe("Unknown");
	});

	it("falls back generically for an unknown code", () => {
		expect(agentStateLabel(7)).toBe("State 7");
		expect(agentStateLabel("9")).toBe("State 9");
	});

	it("passes through an unrecognized non-numeric string", () => {
		expect(agentStateLabel("BOOTING")).toBe("BOOTING");
	});
});
