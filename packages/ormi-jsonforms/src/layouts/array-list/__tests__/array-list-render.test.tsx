/**
 * The array list as a configuration dialog renders it, through the real
 * `shadcnRenderer` registry. Asserted on static markup, so rows are collapsed:
 * what matters here is the heading of each row, the facts beside the list and
 * which renderer the registry picked.
 */
import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ControlElement, JsonSchema, UISchemaElement } from "@jsonforms/core";
import { JsonForms } from "@jsonforms/react";

import { shadcnCells, shadcnRenderer } from "../../../index";
import { arrayListTester, resolveOrderable } from "../ArrayListRenderer";

/** Chart settings with a series array, as the time series chart declares it. */
const CHART_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		topics: {
			type: "array",
			title: "Series",
			items: {
				type: "object",
				properties: {
					topic: { type: "object", title: "Topic" },
					title: { type: "string", title: "Series title" },
					axis: {
						type: "object",
						properties: { yMin: { type: "number" } },
					},
				},
				required: ["topic"],
			},
		},
		tfTopics: {
			type: "array",
			title: "Transform Tree Topics",
			items: { type: "string" },
		},
		modes: {
			type: "array",
			uniqueItems: true,
			items: { type: "string", enum: ["a", "b"] },
		},
	},
	required: ["topics"],
};

/**
 * Render the form around the given settings.
 *
 * @param data - Form data.
 * @param uischema - Optional uischema.
 * @returns Static markup.
 */
function render(data: unknown, uischema?: UISchemaElement): string {
	return renderToStaticMarkup(
		<JsonForms
			schema={CHART_SCHEMA}
			uischema={uischema}
			data={data}
			renderers={shadcnRenderer}
			cells={shadcnCells}
			validationMode="ValidateAndShow"
		/>,
	);
}

/**
 * A control scoped to a top-level property.
 *
 * @param prop - Property name.
 * @returns The control element.
 */
function control(prop: string): ControlElement {
	return { type: "Control", scope: `#/properties/${prop}` };
}

describe("array list rendering", () => {
	it("names every row and never prints a placeholder", () => {
		const html = render(
			{
				topics: [
					{ topic: { topic: "/imu", type: "IMU" } },
					{ title: "Battery" },
					{},
				],
				tfTopics: ["/tf"],
			},
			{
				type: "VerticalLayout",
				elements: [control("topics")],
			} as UISchemaElement,
		);
		expect(html).toContain("/imu");
		expect(html).toContain("Battery");
		expect(html).toContain("Series 3");
		expect(html).not.toContain("No title found");
		expect(html).toContain("Remove /imu");
		expect(html).toContain("Move Battery up");
		expect(html).toContain("Add series");
	});

	it("states incomplete rows by field name, never the raw AJV string", () => {
		const html = render(
			{ topics: [{ title: "a" }, { topic: { topic: "/x" } }] },
			{
				type: "VerticalLayout",
				elements: [control("topics")],
			} as UISchemaElement,
		);
		expect(html).toContain("Topic missing");
		expect(html).toContain("1 incomplete");
		expect(html).not.toContain("is a required property");
	});

	it("states an empty list as a fact", () => {
		const html = render({ topics: [] }, {
			type: "VerticalLayout",
			elements: [control("topics")],
		} as UISchemaElement);
		expect(html).toContain("No series.");
	});

	it("renders scalar rows as inputs with a remove per row", () => {
		const html = render({ topics: [], tfTopics: ["/tf", "/tf_static"] }, {
			type: "VerticalLayout",
			elements: [control("tfTopics")],
		} as UISchemaElement);
		expect(html).toContain('value="/tf_static"');
		expect(html).toContain("Remove /tf_static");
		expect(html).toContain("Add transform tree topic");
		expect(html).not.toContain("Move /tf up");
		expect(html).not.toContain("No applicable");
	});
});

describe("arrayListTester", () => {
	const context = { rootSchema: CHART_SCHEMA, config: {} };

	it("claims object and scalar arrays above every material renderer", () => {
		expect(arrayListTester(control("topics"), CHART_SCHEMA, context)).toBe(
			10,
		);
		expect(
			arrayListTester(control("tfTopics"), CHART_SCHEMA, context),
		).toBe(10);
	});

	it("leaves a unique enum array to the checkbox renderer", () => {
		expect(
			arrayListTester(control("modes"), CHART_SCHEMA, context),
		).toBeLessThan(0);
	});
});

describe("resolveOrderable", () => {
	it("is on for object rows and off for scalar rows by default", () => {
		expect(resolveOrderable({}, false)).toBe(true);
		expect(resolveOrderable({}, true)).toBe(false);
	});

	it("follows orderable and showSortButtons either way", () => {
		expect(resolveOrderable({ orderable: false }, false)).toBe(false);
		expect(resolveOrderable({ showSortButtons: false }, false)).toBe(false);
		expect(resolveOrderable({ orderable: true }, true)).toBe(true);
		expect(resolveOrderable({ showSortButtons: true }, true)).toBe(true);
	});
});
