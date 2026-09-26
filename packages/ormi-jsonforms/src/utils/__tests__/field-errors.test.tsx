import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonSchema, UISchemaElement } from "@jsonforms/core";
import { JsonForms } from "@jsonforms/react";

import { shadcnCells, shadcnRenderer } from "../../index";
import {
	describeFieldError,
	describeFieldErrors,
	GENERIC_FIELD_ERROR,
} from "../field-errors";

describe("describeFieldError", () => {
	it.each([
		[
			{ keyword: "required", params: { missingProperty: "name" } },
			"Required",
		],
		[{ keyword: "minimum", params: { limit: 0 } }, "Must be at least 0"],
		[{ keyword: "maximum", params: { limit: 10 } }, "Must be at most 10"],
		[
			{ keyword: "exclusiveMinimum", params: { limit: 0 } },
			"Must be more than 0",
		],
		[
			{ keyword: "exclusiveMaximum", params: { limit: 1 } },
			"Must be less than 1",
		],
		[
			{ keyword: "multipleOf", params: { multipleOf: 5 } },
			"Must be a multiple of 5",
		],
		[{ keyword: "type", params: { type: "number" } }, "Must be a number"],
		[
			{ keyword: "type", params: { type: "integer" } },
			"Must be a whole number",
		],
		[
			{ keyword: "type", params: { type: ["string", "null"] } },
			"Must be text",
		],
		[
			{ keyword: "enum", params: { allowedValues: ["a"] } },
			"Choose one of the options",
		],
		[
			{ keyword: "const", params: { allowedValue: "a" } },
			"Choose one of the options",
		],
		[
			{ keyword: "oneOf", params: { passingSchemas: null } },
			"Choose one of the options",
		],
		[{ keyword: "minLength", params: { limit: 1 } }, "Required"],
		[
			{ keyword: "minLength", params: { limit: 3 } },
			"At least 3 characters",
		],
		[
			{ keyword: "maxLength", params: { limit: 8 } },
			"At most 8 characters",
		],
		[{ keyword: "pattern", params: { pattern: "^ws" } }, "Invalid format"],
		[
			{ keyword: "format", params: { format: "uri" } },
			"Must be a valid URL",
		],
		[{ keyword: "format", params: { format: "weird" } }, "Invalid format"],
		[{ keyword: "minItems", params: { limit: 1 } }, "At least 1"],
		[{ keyword: "maxItems", params: { limit: 4 } }, "At most 4"],
		[
			{ keyword: "uniqueItems", params: { i: 1, j: 0 } },
			"Values must be unique",
		],
		[{ keyword: "somethingNew", params: {} }, GENERIC_FIELD_ERROR],
		[{ keyword: "minimum", params: {} }, GENERIC_FIELD_ERROR],
	])("%o → %s", (error, fact) => {
		expect(describeFieldError(error)).toBe(fact);
	});

	it("skips summaries reported at the real location", () => {
		expect(describeFieldError({ keyword: "allOf" })).toBeUndefined();
		expect(describeFieldError({ keyword: "if" })).toBeUndefined();
		expect(
			describeFieldError({ keyword: "additionalProperties" }),
		).toBeUndefined();
	});
});

describe("describeFieldErrors", () => {
	it("states each fact once, as sentences", () => {
		expect(
			describeFieldErrors([
				{ keyword: "type", params: { type: "number" } },
				{ keyword: "minimum", params: { limit: 0 } },
				{ keyword: "type", params: { type: "number" } },
				{ keyword: "allOf" },
			]),
		).toBe("Must be a number. Must be at least 0");
		expect(describeFieldErrors([])).toBe("");
	});
});

describe("controls print facts, never AJV wording", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: {
			name: { type: "string", title: "Name" },
			rate: { type: "number", title: "Rate", minimum: 1 },
			mode: { type: "string", title: "Mode", enum: ["a", "b"] },
			on: { type: "boolean", title: "On" },
		},
		required: ["name", "on"],
	};
	const uischema = {
		type: "VerticalLayout",
		elements: ["name", "rate", "mode", "on"].map((p) => ({
			type: "Control",
			scope: `#/properties/${p}`,
		})),
	} as UISchemaElement;

	it("under inputs, selects and switches", () => {
		const html = renderToStaticMarkup(
			<JsonForms
				schema={schema}
				uischema={uischema}
				data={{ rate: 0, mode: "c" }}
				renderers={shadcnRenderer}
				cells={shadcnCells}
			/>,
		);
		expect(html).not.toContain("is a required property");
		expect(html).not.toContain("must be");
		expect(html).not.toContain("allowed values");
		expect(html.split(">Required<").length - 1).toBe(2);
		expect(html).toContain("Must be at least 1");
		expect(html).toContain("Choose one of the options");
	});
});
