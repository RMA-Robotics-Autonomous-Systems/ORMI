/**
 * Tests for configuration-dialog error surfacing.
 *
 * Critical: a config dialog only commits on valid input, so these errors are
 * the entire explanation an operator gets for a refused save. A raw AJV
 * message names no field and no path.
 */

import { describe, test, expect } from "bun:test";
import type { JsonSchema } from "@jsonforms/core";
import {
	formatConfigErrorNotice,
	hasConfigErrors,
	resolveErrorPath,
	resolveFieldLabel,
	summarizeConfigErrors,
	type ConfigValidationError,
} from "../config-errors";

const schema: JsonSchema = {
	type: "object",
	properties: {
		topic: { type: "object", title: "Speed topic" },
		maxPoints: { type: "number" },
		series: {
			type: "array",
			items: {
				type: "object",
				properties: {
					label: { type: "string", title: "Series label" },
				},
			},
		},
	},
	required: ["topic"],
};

/** AJV reports a missing property on the parent with an empty instancePath. */
const missingTopic: ConfigValidationError = {
	instancePath: "",
	keyword: "required",
	message: "must have required property 'topic'",
	params: { missingProperty: "topic" },
};

describe("hasConfigErrors", () => {
	test("is false for null, undefined and an empty list", () => {
		expect(hasConfigErrors(null)).toBe(false);
		expect(hasConfigErrors(undefined)).toBe(false);
		expect(hasConfigErrors([])).toBe(false);
	});

	test("is true as soon as one error is present", () => {
		expect(hasConfigErrors([missingTopic])).toBe(true);
	});
});

describe("resolveErrorPath", () => {
	test("appends the missing property of a required error", () => {
		expect(resolveErrorPath(missingTopic)).toEqual(["topic"]);
	});

	test("splits an instance pointer into segments", () => {
		expect(resolveErrorPath({ instancePath: "/series/0/label" })).toEqual([
			"series",
			"0",
			"label",
		]);
	});

	test("decodes escaped pointer segments", () => {
		expect(resolveErrorPath({ instancePath: "/a~1b/c~0d" })).toEqual([
			"a/b",
			"c~d",
		]);
	});

	test("is empty for an error that attaches to no field", () => {
		expect(
			resolveErrorPath({ instancePath: "", keyword: "minProperties" }),
		).toEqual([]);
	});
});

describe("resolveFieldLabel", () => {
	test("prefers the schema title the control renders", () => {
		expect(resolveFieldLabel(schema, ["topic"])).toBe("Speed topic");
	});

	test("humanizes a camelCase key when there is no title", () => {
		expect(resolveFieldLabel(schema, ["maxPoints"])).toBe("Max points");
	});

	test("walks array items", () => {
		expect(resolveFieldLabel(schema, ["series", "0", "label"])).toBe(
			"Series label",
		);
	});

	test("falls back to the nearest named segment for an unknown path", () => {
		expect(resolveFieldLabel(schema, ["unknown", "frame_id"])).toBe(
			"Frame id",
		);
	});

	test("is empty for an empty path", () => {
		expect(resolveFieldLabel(schema, [])).toBe("");
	});
});

describe("summarizeConfigErrors", () => {
	test("names the field instead of repeating the raw AJV message", () => {
		const summary = summarizeConfigErrors([missingTopic], schema);

		expect(summary.fields).toEqual(["Speed topic"]);
		expect(summary.messages).toEqual([]);
	});

	test("deduplicates repeated errors on one field", () => {
		const summary = summarizeConfigErrors(
			[
				{ instancePath: "/maxPoints", message: "must be number" },
				{ instancePath: "/maxPoints", message: "must be >= 1" },
			],
			schema,
		);

		expect(summary.fields).toEqual(["Max points"]);
	});

	test("keeps the message of an error that attaches to no field", () => {
		const summary = summarizeConfigErrors(
			[{ instancePath: "", message: "must NOT have fewer than 1 items" }],
			schema,
		);

		expect(summary.fields).toEqual([]);
		expect(summary.messages).toEqual(["must NOT have fewer than 1 items"]);
	});

	test("handles no errors", () => {
		expect(summarizeConfigErrors(null, schema)).toEqual({
			fields: [],
			messages: [],
		});
	});
});

describe("formatConfigErrorNotice", () => {
	test("is null when there is nothing to report", () => {
		expect(
			formatConfigErrorNotice({ fields: [], messages: [] }),
		).toBeNull();
	});

	test("points at a single field by name", () => {
		expect(
			formatConfigErrorNotice({ fields: ["Speed topic"], messages: [] }),
		).toBe("This configuration is incomplete. Check Speed topic.");
	});

	test("joins several fields readably", () => {
		expect(
			formatConfigErrorNotice({
				fields: ["Speed topic", "Max points", "Title"],
				messages: [],
			}),
		).toBe(
			"This configuration is incomplete. Check Speed topic, Max points and Title.",
		);
	});

	test("spells out unattached messages as sentences", () => {
		expect(
			formatConfigErrorNotice({
				fields: [],
				messages: ["must NOT have fewer than 1 items"],
			}),
		).toBe(
			"This configuration is incomplete. Must NOT have fewer than 1 items.",
		);
	});

	test("end to end: a missing topic reads as a field name", () => {
		const notice = formatConfigErrorNotice(
			summarizeConfigErrors([missingTopic], schema),
		);

		expect(notice).toBe(
			"This configuration is incomplete. Check Speed topic.",
		);
	});
});
