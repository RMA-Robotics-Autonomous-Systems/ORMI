/**
 * Controls as the configuration dialogs render them, through the real
 * `shadcnRenderer` registry, on static markup.
 */
import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonSchema, UISchemaElement } from "@jsonforms/core";
import { JsonForms } from "@jsonforms/react";

import { shadcnCells, shadcnRenderer } from "../../index";
import { isAutomaticColor } from "../simples/ShadcnColorControl";

/**
 * Render a form.
 *
 * @param schema - JSON schema.
 * @param uischema - UI schema.
 * @param data - Form data.
 * @returns Static markup.
 */
function render(
	schema: JsonSchema,
	uischema: UISchemaElement,
	data: unknown,
): string {
	return renderToStaticMarkup(
		<JsonForms
			schema={schema}
			uischema={uischema}
			data={data}
			renderers={shadcnRenderer}
			cells={shadcnCells}
		/>,
	);
}

describe("group layout", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: { x: { type: "number", title: "X" } },
	};

	it("renders the group's label", () => {
		const html = render(
			schema,
			{
				type: "Group",
				label: "Position (m)",
				elements: [{ type: "Control", scope: "#/properties/x" }],
			} as UISchemaElement,
			{ x: 0 },
		);
		expect(html).toContain("Position (m)");
	});
});

describe("enum controls", () => {
	it("do not repeat the field label as the placeholder", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				condition: {
					type: "string",
					title: "Condition",
					enum: ["<", ">"],
				},
				mode: {
					type: "string",
					title: "Mode",
					oneOf: [
						{ const: "a", title: "A" },
						{ const: "b", title: "B" },
					],
				},
			},
		};
		const html = render(
			schema,
			{
				type: "VerticalLayout",
				elements: [
					{ type: "Control", scope: "#/properties/condition" },
					{ type: "Control", scope: "#/properties/mode" },
				],
			} as UISchemaElement,
			{},
		);
		// Once as the label, never again inside the select.
		expect(html.split("Condition").length - 1).toBe(1);
		expect(html.split("Mode").length - 1).toBe(1);
		expect(html).toContain("Select");
	});
});

describe("colour control", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: { color: { type: "string", title: "Color" } },
	};
	const uischema = {
		type: "Control",
		scope: "#/properties/color",
		options: { color: true },
	} as UISchemaElement;

	it("shows an empty colour as automatic, not black", () => {
		const html = render(schema, uischema, {});
		expect(html).toContain("Automatic");
		expect(html).not.toContain("#000000");
		expect(html).not.toContain("background-color");
	});

	it("shows a picked colour and offers a reset to automatic", () => {
		const html = render(schema, uischema, { color: "#3b82f6" });
		expect(html).toContain("background-color:#3b82f6");
		expect(html).toContain("#3b82f6");
		expect(html).toContain("Automatic");
	});

	it("offers no reset where the schema has a default", () => {
		const html = render(
			{
				type: "object",
				properties: {
					color: {
						type: "string",
						title: "Color",
						default: "#3b82f6",
					},
				},
			},
			uischema,
			{ color: "#ff0000" },
		);
		expect(html).not.toContain("Automatic");
	});

	it("treats blank values as automatic", () => {
		expect(isAutomaticColor(undefined)).toBe(true);
		expect(isAutomaticColor("")).toBe(true);
		expect(isAutomaticColor("  ")).toBe(true);
		expect(isAutomaticColor("#ffffff")).toBe(false);
	});
});
