/**
 * The Authentication field as Settings > Map servers renders it: the real
 * `mapServerAuthProperty` schema through the renderer set that dialog uses
 * (material, then shadcn, then core). Static markup; the repo has no DOM
 * harness.
 */

import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JsonSchema } from "@jsonforms/core";
import { JsonForms } from "@jsonforms/react";
import {
	materialCells,
	materialRenderers,
} from "@jsonforms/material-renderers";
import { shadcnCells, shadcnRenderer } from "@workspace/ormi-jsonforms";

import { mapServerAuthProperty, type MapServerAuthCapability } from "../auth";

const GEOSERVER: MapServerAuthCapability = {
	kinds: ["none", "basic", "query-token"],
	queryParam: "authkey",
};

async function render(
	cap: MapServerAuthCapability,
	data: Record<string, unknown>,
): Promise<string> {
	const { coreRenderer } = await import("../../renderers");
	const schema = {
		type: "object",
		properties: {
			url: { type: "string", title: "Server URL" },
			auth: mapServerAuthProperty(cap),
		},
		required: ["url"],
	} as JsonSchema;
	return renderToStaticMarkup(
		<JsonForms
			schema={schema}
			data={data}
			renderers={[
				...materialRenderers,
				...shadcnRenderer,
				...coreRenderer,
			]}
			cells={[...materialCells, ...shadcnCells]}
		/>,
	);
}

/** Every `<input>` tag, class attributes dropped. */
function inputs(html: string): string[] {
	return (html.match(/<input[^>]*>/g) ?? []).map((tag) =>
		tag.replace(/ class="[^"]*"/g, ""),
	);
}

describe("Authentication field", () => {
	it("offers every declared kind as a choice", async () => {
		const html = await render(GEOSERVER, {
			url: "http://h/geoserver",
			auth: { kind: "none" },
		});
		expect(html).not.toContain("No options available");
		expect(html).toContain(">None</button>");
		expect(html).toContain(">Username and password</button>");
		expect(html).toContain(">Token in URL</button>");
		expect(html).not.toContain(">Bearer token</button>");
	});

	it("shows the selected kind's fields, the secret masked", async () => {
		const html = await render(GEOSERVER, {
			url: "http://h/geoserver",
			auth: { kind: "basic", username: "viewer", password: "" },
		});
		const fields = inputs(html);
		expect(fields.some((tag) => /value="viewer"/.test(tag))).toBe(true);
		const password = fields.filter((tag) => /type="password"/.test(tag));
		expect(password).toHaveLength(1);
		expect(password[0]).toContain('autoComplete="new-password"');
	});

	it("names the fixed query parameter and masks the token", async () => {
		const html = await render(GEOSERVER, {
			url: "http://h/geoserver",
			auth: { kind: "query-token", token: "" },
		});
		expect(html).toContain("Token (authkey)");
		expect(
			inputs(html).filter((tag) => /type="password"/.test(tag)),
		).toHaveLength(1);
		expect(html).not.toContain("Parameter name");
	});

	it("asks for the header name in clear and the value masked", async () => {
		const html = await render(
			{ kinds: ["none", "header"] },
			{
				url: "http://h",
				auth: { kind: "header", name: "X-Key", value: "" },
			},
		);
		const fields = inputs(html);
		expect(
			fields.some(
				(tag) => /type="text"/.test(tag) && /value="X-Key"/.test(tag),
			),
		).toBe(true);
		expect(
			fields.filter((tag) => /type="password"/.test(tag)),
		).toHaveLength(1);
	});
});
