import { describe, expect, it } from "bun:test";

import {
	getMissionIssue,
	isPlannerReachabilityIssue,
	missionIssueLabel,
	missionIssueSeverity,
} from "./issue-labels";

describe("getMissionIssue", () => {
	it("decodes a known warn code", () => {
		const issue = getMissionIssue(14);
		expect(issue).not.toBeNull();
		expect(issue?.code).toBe(14);
		expect(issue?.severity).toBe("warn");
		expect(issue?.label).toBe("Swarm planner unreachable");
		expect(issue?.description.length).toBeGreaterThan(0);
	});

	it("decodes a known fail code", () => {
		const issue = getMissionIssue(23);
		expect(issue).not.toBeNull();
		expect(issue?.code).toBe(23);
		expect(issue?.severity).toBe("fail");
		expect(issue?.label).toBe("Swarm planner unreachable (failed)");
		expect(issue?.description.length).toBeGreaterThan(0);
	});

	it("returns null for code 0 (NONE) and for null/undefined", () => {
		expect(getMissionIssue(0)).toBeNull();
		expect(getMissionIssue(null)).toBeNull();
		expect(getMissionIssue(undefined)).toBeNull();
	});

	it("falls back for an unknown non-zero code without losing the code", () => {
		const issue = getMissionIssue(999);
		expect(issue).not.toBeNull();
		expect(issue?.code).toBe(999);
		expect(issue?.label).toBe("Issue 999");
		expect(issue?.severity).toBe("warn");
		expect(issue?.description).toBe("Unrecognized mission issue code.");
	});
});

describe("missionIssueLabel / missionIssueSeverity", () => {
	it("returns the short label or null", () => {
		expect(missionIssueLabel(14)).toBe("Swarm planner unreachable");
		expect(missionIssueLabel(0)).toBeNull();
		expect(missionIssueLabel(null)).toBeNull();
	});

	it("returns the severity, defaulting to none for no issue", () => {
		expect(missionIssueSeverity(23)).toBe("fail");
		expect(missionIssueSeverity(14)).toBe("warn");
		expect(missionIssueSeverity(0)).toBe("none");
		expect(missionIssueSeverity(undefined)).toBe("none");
	});
});

describe("isPlannerReachabilityIssue", () => {
	it("is true only for the swarm-planner-reachability codes 14 and 23", () => {
		expect(isPlannerReachabilityIssue(14)).toBe(true);
		expect(isPlannerReachabilityIssue(23)).toBe(true);
	});

	it("is false for other issue codes and for none", () => {
		for (const code of [0, 11, 15, 21, 24, 41, 999]) {
			expect(isPlannerReachabilityIssue(code)).toBe(false);
		}
		expect(isPlannerReachabilityIssue(null)).toBe(false);
		expect(isPlannerReachabilityIssue(undefined)).toBe(false);
	});
});
