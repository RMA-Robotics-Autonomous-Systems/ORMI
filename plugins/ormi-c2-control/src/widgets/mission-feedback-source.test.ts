import { describe, expect, it } from "bun:test";

import { MissionStatus } from "../types/c2-types";
import { latestFeedback } from "./mission-feedback-source";

/** A minimal valid `mission_feedback` JSON payload for `mission_id`. */
function feedbackJson(missionId: string, status = MissionStatus.NONE): string {
	return JSON.stringify({
		mission_id: missionId,
		status,
		tasks: [],
	});
}

/** Build a size-1 buffered sources map from a list of buffer tails. */
function sourcesOf(...buffers: unknown[][]): Map<string, { data: unknown[] }> {
	const map = new Map<string, { data: unknown[] }>();
	buffers.forEach((data, i) => map.set(`topic-${i}`, { data }));
	return map;
}

describe("latestFeedback", () => {
	it("returns null for an empty sources map", () => {
		expect(latestFeedback(new Map())).toBeNull();
	});

	it("returns null when the buffer tail is null/undefined", () => {
		expect(latestFeedback(sourcesOf([null]))).toBeNull();
		expect(latestFeedback(sourcesOf([undefined]))).toBeNull();
	});

	it("parses the JSON-string `mission_feedback` wrapper field", () => {
		const sources = sourcesOf([
			{ mission_id: "m1", mission_feedback: feedbackJson("m1") },
		]);
		const result = latestFeedback(sources);
		expect(result).not.toBeNull();
		expect(result?.mission_id).toBe("m1");
	});

	it("tolerates an already-parsed feedback object (no wrapper string)", () => {
		const sources = sourcesOf([
			{ mission_id: "m2", status: MissionStatus.NONE, tasks: [] },
		]);
		const result = latestFeedback(sources);
		expect(result?.mission_id).toBe("m2");
	});

	it("reads the LAST element of a multi-element buffer", () => {
		const sources = sourcesOf([
			{ mission_id: "old", mission_feedback: feedbackJson("old") },
			{ mission_id: "new", mission_feedback: feedbackJson("new") },
		]);
		expect(latestFeedback(sources)?.mission_id).toBe("new");
	});

	it("returns the last successfully-parsed candidate across sources", () => {
		// First source parses; second is garbage and must not blank the result.
		const sources = sourcesOf(
			[{ mission_id: "ok", mission_feedback: feedbackJson("ok") }],
			[{ mission_feedback: "not-json" }],
		);
		expect(latestFeedback(sources)?.mission_id).toBe("ok");
	});

	it("returns null when no source carries a parseable mission id", () => {
		const sources = sourcesOf([{ foo: "bar" }] as unknown[]);
		expect(latestFeedback(sources)).toBeNull();
	});
});
