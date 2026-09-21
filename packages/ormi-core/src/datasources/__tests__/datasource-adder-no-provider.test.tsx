/**
 * The regression that protects every surface this feature was not built for.
 *
 * The C2 and EMI plugin pages assemble their own shells and mount no
 * `KnownDatasourcesProvider`. `useKnownDatasources` tolerating that absence —
 * answering `idle` and a no-op refresh — is the only thing standing between
 * this feature and those pages, so the picker is rendered here with the real
 * hook and nothing above it.
 *
 * Kept in its own file because the sibling test replaces that module, and a
 * replaced module cannot also answer as the real one.
 */

import { describe, test, expect, mock, afterAll } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DatasourceDefinition } from "../datasource-interface";

/** Definitions the mocked plugins manager reports. */
const definitions: DatasourceDefinition[] = [
	{
		id: "foxglove",
		name: "Foxglove",
		description: "Foxglove websocket",
		schema: {},
		data: { id: "", title: "", enable: true },
		Provider: () => null,
	} as unknown as DatasourceDefinition,
	{
		id: "rest",
		name: "REST",
		description: "Polled HTTP endpoint",
		schema: {},
		data: { id: "", title: "", enable: true },
		Provider: () => null,
	} as unknown as DatasourceDefinition,
];

// Only `usePluginsManager` is replaced, and it is put back afterwards: module
// mocks are process-wide for the whole `bun test` run, so replacing the real
// `PluginsManager` here would break every other file in the suite.
const realPluginsExports = { ...(await import("@workspace/ormi-plugins")) };

await mock.module("@workspace/ormi-plugins", () => ({
	...realPluginsExports,
	usePluginsManager: () => ({
		applyFilter: () => definitions,
	}),
}));

afterAll(async () => {
	await mock.module("@workspace/ormi-plugins", () => realPluginsExports);
});

const { default: DatasourceAdder } =
	await import("../components/datasource-adder");

describe("DatasourceAdder without a KnownDatasourcesProvider", () => {
	test("renders exactly the catalogue, as it does today", () => {
		const markup = renderToStaticMarkup(
			<DatasourceAdder handleAdd={() => {}} />,
		);

		expect(markup).toContain("Add a datasource");
		for (const definition of definitions) {
			expect(markup).toContain(definition.name);
			expect(markup).toContain(definition.description);
		}

		// Nothing the known-configurations feature contributes is present:
		// not the list, not a pending state, not an error, not a retry.
		expect(markup).not.toContain("From your other dashboards");
		expect(markup).not.toContain("Looking for datasources");
		expect(markup).not.toContain("Could not load datasources");
		expect(markup).not.toContain("Retry");
		expect(markup).not.toContain("Already in this dashboard");

		// One button per definition and not one more.
		expect(markup.split("<button").length - 1).toBe(definitions.length);
	});
});
