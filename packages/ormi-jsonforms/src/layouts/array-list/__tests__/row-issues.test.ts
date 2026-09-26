import { describe, expect, it } from "bun:test";
import type { JsonSchema } from "@jsonforms/core";

import {
	describeArrayIssue,
	mapErrorsToArray,
	mapErrorsToRows,
	summarizeRowIssues,
	ValidationErrorLike,
} from "../row-issues";

/** A chart series item (abridged). */
const SERIES_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		topic: { type: "object", title: "Topic" },
		title: { type: "string", title: "Series title" },
		lineWidth: { type: "number", title: "Line width" },
		axis: {
			type: "object",
			title: "Axis",
			properties: { side: { type: "string" } },
			required: ["side"],
		},
		fillOpacity: { type: "number" },
	},
	required: ["topic"],
};

/**
 * What AJV reports for a chart with two incomplete series, plus the error
 * JSON Forms used to print verbatim beside the heading.
 */
const ERRORS: ValidationErrorLike[] = [
	{
		instancePath: "",
		keyword: "required",
		params: { missingProperty: "title" },
	},
	{
		instancePath: "/topics/0",
		keyword: "required",
		params: { missingProperty: "topic" },
	},
	{
		instancePath: "/topics/2",
		keyword: "required",
		params: { missingProperty: "topic" },
	},
	{
		instancePath: "/topics/2/lineWidth",
		keyword: "minimum",
		params: { limit: 0 },
	},
	{
		instancePath: "/topics/2/axis",
		keyword: "required",
		params: { missingProperty: "side" },
	},
];

describe("mapErrorsToRows", () => {
	it("attributes each error to its row and names the field", () => {
		const rows = mapErrorsToRows(ERRORS, "topics", SERIES_SCHEMA);
		expect([...rows.keys()]).toEqual([0, 2]);
		expect(rows.get(0)).toEqual([
			{ field: "topic", title: "Topic", kind: "missing" },
		]);
		expect(rows.get(2)).toEqual([
			{ field: "topic", title: "Topic", kind: "missing" },
			{ field: "lineWidth", title: "Line width", kind: "invalid" },
			{ field: "axis", title: "Axis", kind: "incomplete" },
		]);
	});

	it("ignores errors outside the array, and summary keywords", () => {
		const rows = mapErrorsToRows(
			[
				...ERRORS,
				{ instancePath: "/topics/1", keyword: "oneOf", params: {} },
				{ instancePath: "/topicsExtra/0", keyword: "type", params: {} },
			],
			"topics",
			SERIES_SCHEMA,
		);
		expect(rows.has(1)).toBe(false);
		expect(rows.size).toBe(2);
	});

	it("resolves nested arrays by their full path", () => {
		const rows = mapErrorsToRows(
			[
				{
					instancePath: "/layers/1/topics/3",
					keyword: "required",
					params: { missingProperty: "topic" },
				},
				{
					instancePath: "/layers/0/topics/3",
					keyword: "type",
					params: {},
				},
			],
			"layers.1.topics",
			SERIES_SCHEMA,
		);
		expect([...rows.keys()]).toEqual([3]);
		expect(rows.get(3)![0]!.kind).toBe("missing");
	});

	it("keeps the strongest kind when a field has several errors", () => {
		const rows = mapErrorsToRows(
			[
				{
					instancePath: "/topics/0/topic",
					keyword: "type",
					params: {},
				},
				{
					instancePath: "/topics/0",
					keyword: "required",
					params: { missingProperty: "topic" },
				},
			],
			"topics",
			SERIES_SCHEMA,
		);
		expect(rows.get(0)).toEqual([
			{ field: "topic", title: "Topic", kind: "missing" },
		]);
	});

	it("start-cases a field without a title", () => {
		const rows = mapErrorsToRows(
			[{ instancePath: "/topics/0/fillOpacity", keyword: "type" }],
			"topics",
			SERIES_SCHEMA,
		);
		expect(rows.get(0)![0]!.title).toBe("Fill Opacity");
	});

	it("reports a rejected scalar row as its value", () => {
		const rows = mapErrorsToRows(
			[{ instancePath: "/values/1", keyword: "type", params: {} }],
			"values",
			{ type: "number" },
		);
		expect(rows.get(1)).toEqual([
			{ field: "", title: "Value", kind: "invalid" },
		]);
	});

	it("decodes JSON pointer escapes", () => {
		const rows = mapErrorsToRows(
			[{ instancePath: "/a~1b/0/c", keyword: "type" }],
			"a/b",
		);
		expect(rows.has(0)).toBe(true);
	});

	it("reads the AJV v6 dataPath form", () => {
		const rows = mapErrorsToRows(
			[{ dataPath: ".topics.4.title", keyword: "type" }],
			"topics",
			SERIES_SCHEMA,
		);
		expect(rows.get(4)![0]!.title).toBe("Series title");
	});
});

describe("summarizeRowIssues", () => {
	it("states each kind once, fields by name", () => {
		const rows = mapErrorsToRows(ERRORS, "topics", SERIES_SCHEMA);
		expect(summarizeRowIssues(rows.get(0)!)).toBe("Topic missing");
		expect(summarizeRowIssues(rows.get(2)!)).toBe(
			"Topic missing; Axis incomplete; Line width invalid",
		);
		expect(summarizeRowIssues([])).toBe("");
	});

	it("never carries AJV wording", () => {
		const rows = mapErrorsToRows(ERRORS, "topics", SERIES_SCHEMA);
		for (const issues of rows.values()) {
			expect(summarizeRowIssues(issues)).not.toContain("property");
		}
	});
});

describe("mapErrorsToArray", () => {
	it("reports minItems and maxItems at the array itself", () => {
		const issues = mapErrorsToArray(
			[
				{
					instancePath: "/topics",
					keyword: "minItems",
					params: { limit: 1 },
				},
				{
					instancePath: "/other",
					keyword: "maxItems",
					params: { limit: 2 },
				},
				{
					instancePath: "/topics/0",
					keyword: "minItems",
					params: { limit: 3 },
				},
			],
			"topics",
		);
		expect(issues).toEqual([{ keyword: "minItems", limit: 1 }]);
		expect(describeArrayIssue(issues[0]!)).toBe("Minimum 1");
		expect(describeArrayIssue({ keyword: "maxItems", limit: 4 })).toBe(
			"Maximum 4",
		);
	});
});
