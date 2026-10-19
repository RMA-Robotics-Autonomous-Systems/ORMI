import { describe, expect, it } from "bun:test";
import type { JsonSchema, UISchemaElement } from "@jsonforms/core";

import { datasourceDefinition } from "../export";
import { urlWithButtonTester } from "../url-with-button-renderer";

const control = {
	type: "Control",
	scope: "#/properties/url",
} as UISchemaElement;

function rank(rootSchema: JsonSchema): number {
	return urlWithButtonTester(
		control,
		(rootSchema.properties?.url ?? {}) as JsonSchema,
		{ rootSchema, config: {} },
	);
}

describe("urlWithButtonTester", () => {
	it("takes a datasource's url field", () => {
		expect(rank(datasourceDefinition.schema as JsonSchema)).toBe(100);
	});

	it("leaves a url field in any other form alone", () => {
		expect(
			rank({
				type: "object",
				properties: { url: { type: "string", title: "URL" } },
			}),
		).toBeLessThan(0);
	});
});
