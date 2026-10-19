/**
 * Controls as the configuration dialogs render them, through the real
 * `shadcnRenderer` registry, on static markup.
 */
import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CellProps, JsonSchema, UISchemaElement } from "@jsonforms/core";
import { JsonForms } from "@jsonforms/react";

import { shadcnCells, shadcnRenderer } from "../../index";
import { ShadcnTextCell } from "../cells/ShadcnTextCell";
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

describe("secret text controls", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: {
			url: { type: "string", title: "URL" },
			token: { type: "string", title: "Token", writeOnly: true },
		},
	} as JsonSchema;

	it("masks a writeOnly string and offers a reveal toggle", () => {
		const html = render(
			schema,
			{ type: "Control", scope: "#/properties/token" } as UISchemaElement,
			{ token: "s3cr3t" },
		);
		expect(html).toContain('type="password"');
		expect(html).toContain('autoComplete="new-password"');
		expect(html).toContain('aria-label="Show value"');
		expect(html).toContain('aria-pressed="false"');
		expect(html).not.toContain('type="text"');
	});

	it("leaves an ordinary string as a plain text input", () => {
		const html = render(
			schema,
			{ type: "Control", scope: "#/properties/url" } as UISchemaElement,
			{ url: "https://tiles.example" },
		);
		expect(html).toContain('type="text"');
		expect(html).not.toContain('type="password"');
		expect(html).not.toContain("Show value");
	});

	it("masks a writeOnly string in the text cell", () => {
		const cellProps = {
			data: "abc",
			id: "cell",
			path: "value",
			enabled: true,
			visible: true,
			handleChange: () => {},
			rootSchema: {},
			uischema: { type: "Control", scope: "#" },
			errors: "",
			isValid: true,
		} as unknown as CellProps;
		const masked = renderToStaticMarkup(
			<ShadcnTextCell
				{...cellProps}
				schema={{ type: "string", writeOnly: true } as JsonSchema}
			/>,
		);
		const plain = renderToStaticMarkup(
			<ShadcnTextCell {...cellProps} schema={{ type: "string" }} />,
		);
		expect(masked).toContain('type="password"');
		expect(masked).toContain('aria-label="Show value"');
		expect(plain).toContain('type="text"');
		expect(plain).not.toContain('type="password"');
	});
});

describe("oneOf layout", () => {
	const schema = {
		type: "object",
		properties: {
			auth: {
				title: "Authentication",
				type: "object",
				default: { kind: "none" },
				oneOf: [
					{
						title: "None",
						type: "object",
						properties: {
							kind: { const: "none", default: "none" },
						},
						required: ["kind"],
					},
					{
						title: "Bearer token",
						type: "object",
						properties: {
							kind: { const: "bearer", default: "bearer" },
							token: {
								type: "string",
								title: "Token",
								writeOnly: true,
							},
						},
						required: ["kind", "token"],
					},
				],
			},
		},
	} as JsonSchema;
	const uischema = {
		type: "VerticalLayout",
		elements: [{ type: "Control", scope: "#/properties/auth" }],
	} as UISchemaElement;

	it("renders one tab per branch and the fitting branch's fields", () => {
		const html = render(schema, uischema, {
			auth: { kind: "bearer", token: "" },
		});
		expect(html).not.toContain("No options available");
		expect(html).toContain(">None</button>");
		expect(html).toContain(">Bearer token</button>");
		expect(html).toMatch(
			/<input type="password"[^>]*id="#\/properties\/token\d*"/,
		);
	});
});
