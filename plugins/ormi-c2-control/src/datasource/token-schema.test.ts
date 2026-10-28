import { describe, expect, it } from "bun:test";

import { datasourceDefinition } from "../export";

describe("C2 datasource schema", () => {
	it("marks the Mission Control token writeOnly so the dialog masks it", () => {
		const token = (
			datasourceDefinition.schema as {
				properties: Record<
					string,
					{ type?: string; writeOnly?: boolean }
				>;
			}
		).properties.missionControlToken;
		expect(token).toEqual(
			expect.objectContaining({ type: "string", writeOnly: true }),
		);
	});
});
