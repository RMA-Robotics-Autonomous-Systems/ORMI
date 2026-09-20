import { describe, expect, it } from "bun:test";

import { describeFeedbackIssue } from "./issue-labels";
import { feedbackSignature, parseMissionFeedback } from "./mission-feedback";

/**
 * The optional `issue_code` / `issue_message` / `issue_conflicts` keys that
 * coordination sends next to the numeric `issue` while that issue is current.
 */

const BASE = { mission_id: "m-1", status: 3, tasks: [] };

describe("parseMissionFeedback — issue detail keys", () => {
	it("parses VEHICLE_BUSY with its conflicts", () => {
		const fb = parseMissionFeedback(
			JSON.stringify({
				...BASE,
				issue: 13,
				issue_code: "VEHICLE_BUSY",
				issue_message: "vehicle v1 is used by mission m2",
				issue_conflicts: [
					{ vehicle_id: "v1", mission_id: "m2" },
					{ vehicle_id: "v3" },
					{ mission_id: "no-vehicle" },
					"junk",
				],
			}),
		)!;
		expect(fb.issue).toBe(13);
		expect(fb.issue_code).toBe("VEHICLE_BUSY");
		expect(fb.issue_message).toBe("vehicle v1 is used by mission m2");
		expect(fb.issue_conflicts).toEqual([
			{ vehicle_id: "v1", mission_id: "m2" },
			{ vehicle_id: "v3", mission_id: "" },
		]);
	});

	it("parses EDGE_SILENT / TASK_DISPLACED without conflicts", () => {
		const fb = parseMissionFeedback({
			...BASE,
			issue: 22,
			issue_code: "TASK_DISPLACED",
			issue_message: "task replaced by mission m9",
		} as never)!;
		expect(fb.issue_code).toBe("TASK_DISPLACED");
		expect(fb.issue_conflicts).toBeUndefined();
	});

	it.each([
		[15, "EDGE_RESTARTED", "supervisor restarted; resent 3 of 5 waypoints"],
		[15, "TASK_RECOVERED", "robot reported task t-9; resent ours"],
		[24, "EDGE_LOST", "no edge feedback for 300 s"],
		[22, "EDGE_TASK_LOST", "task recovery failed after 3 attempts"],
	] as const)("parses %i / %s", (issue, code, message) => {
		const fb = parseMissionFeedback(
			JSON.stringify({
				...BASE,
				issue,
				issue_code: code,
				issue_message: message,
			}),
		)!;
		expect(fb.issue).toBe(issue);
		expect(fb.issue_code).toBe(code);
		expect(fb.issue_message).toBe(message);
		expect(fb.issue_conflicts).toBeUndefined();
	});

	it("an old document without the keys parses exactly as before", () => {
		const fb = parseMissionFeedback(
			JSON.stringify({ ...BASE, issue: 15 }),
		)!;
		expect(fb).toEqual({
			mission_id: "m-1",
			behavior: undefined,
			status: 3,
			requested_status: undefined,
			date: undefined,
			issue: 15,
			tasks: [],
		});
		expect("issue_code" in fb).toBe(false);
		expect("issue_message" in fb).toBe(false);
		expect("issue_conflicts" in fb).toBe(false);
	});

	it("drops wrongly-typed values", () => {
		const fb = parseMissionFeedback(
			JSON.stringify({
				...BASE,
				issue_code: 7,
				issue_message: "",
				issue_conflicts: "nope",
			}),
		)!;
		expect(fb.issue_code).toBeUndefined();
		expect(fb.issue_message).toBeUndefined();
		expect(fb.issue_conflicts).toBeUndefined();
	});

	it("the store signature changes when only the issue detail changes", () => {
		const a = parseMissionFeedback({ ...BASE, issue: 15 } as never)!;
		const b = parseMissionFeedback({
			...BASE,
			issue: 15,
			issue_code: "EDGE_SILENT",
			issue_message: "no edge feedback for 31 s",
		} as never)!;
		expect(feedbackSignature(a)).not.toBe(feedbackSignature(b));
	});
});

describe("describeFeedbackIssue", () => {
	it("numeric-only issue keeps the numeric label", () => {
		const view = describeFeedbackIssue({ issue: 13 })!;
		expect(view.label).toBe("Status change ignored");
		expect(view.reason).toBeNull();
		expect(view.detail).toBeNull();
	});
	it("issue_code sharpens the label; issue_message becomes the description", () => {
		const view = describeFeedbackIssue({
			issue: 13,
			issue_code: "VEHICLE_BUSY",
			issue_message: "vehicle v1 is used by mission m2",
		})!;
		expect(view.code).toBe(13);
		expect(view.label).toBe("Vehicle busy");
		expect(view.description).toBe("vehicle v1 is used by mission m2");
		expect(view.detail).toBe("vehicle v1 is used by mission m2");
		expect(view.reason).toBe("VEHICLE_BUSY");
	});
	it("EDGE_SILENT stays a warning; TASK_DISPLACED is a failure", () => {
		expect(
			describeFeedbackIssue({ issue: 15, issue_code: "EDGE_SILENT" })!
				.severity,
		).toBe("warn");
		expect(
			describeFeedbackIssue({ issue: 22, issue_code: "TASK_DISPLACED" })!
				.severity,
		).toBe("fail");
	});
	it.each([
		[
			15,
			"EDGE_RESTARTED",
			"Robot restarted — task recovered, paused",
			"warn",
		],
		[15, "TASK_RECOVERED", "Task recovered, paused", "warn"],
		[24, "EDGE_LOST", "Robot lost", "fail"],
		[22, "EDGE_TASK_LOST", "Task lost", "fail"],
	] as const)("issue %i / %s → %s (%s)", (issue, code, label, severity) => {
		const view = describeFeedbackIssue({ issue, issue_code: code })!;
		expect(view.code).toBe(issue);
		expect(view.label).toBe(label);
		expect(view.severity).toBe(severity);
		expect(view.reason).toBe(code);
		// Same label/severity when only the string key is present.
		const bare = describeFeedbackIssue({ issue: null, issue_code: code })!;
		expect(bare.label).toBe(label);
		expect(bare.severity).toBe(severity);
	});
	it("an unknown issue_code keeps the numeric label", () => {
		expect(
			describeFeedbackIssue({ issue: 15, issue_code: "SOMETHING_NEW" })!
				.label,
		).toBe("Edge module unreachable");
	});
	it("an unknown issue_code without a numeric issue is a warning", () => {
		const view = describeFeedbackIssue({
			issue: null,
			issue_code: "SOMETHING_NEW",
		})!;
		expect(view.label).toBe("SOMETHING_NEW");
		expect(view.severity).toBe("warn");
	});
	it("string keys without a numeric issue still show", () => {
		const view = describeFeedbackIssue({
			issue: null,
			issue_code: "TASK_DISPLACED",
			issue_message: "replaced",
		})!;
		expect(view.label).toBe("Task displaced");
		expect(view.severity).toBe("fail");
	});
	it("no issue at all is null", () => {
		expect(describeFeedbackIssue({ issue: null })).toBeNull();
		expect(describeFeedbackIssue({ issue: 0 })).toBeNull();
	});
});
