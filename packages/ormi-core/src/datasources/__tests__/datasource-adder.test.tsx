/**
 * How the add-datasource picker reacts to the known-configurations read.
 *
 * The provider module is replaced here so each status can be rendered
 * directly; the no-provider regression lives in its own file, because a
 * replaced module cannot also answer as the real one.
 */

import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DatasourceDefinition } from "../datasource-interface";
import type { KnownDatasourcesContextValue } from "../known-datasources-provider";

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

/** What the mocked `useKnownDatasources` answers, per test. */
let knownValue: KnownDatasourcesContextValue = {
	state: { status: "idle" },
	refresh: () => {},
};

await mock.module("../known-datasources-provider", () => ({
	useKnownDatasources: () => knownValue,
}));

// The section is mocked out: what it renders has its own test, and the real
// one reads dashboard state this picker is deliberately not coupled to. Put
// back afterwards, because module mocks are process-wide and that test runs
// in the same process.
const realListExports = {
	...(await import("../components/known-datasource-list")),
};

await mock.module("../components/known-datasource-list", () => ({
	...realListExports,
	KnownDatasourceSection: () => <div>KNOWN-SECTION</div>,
}));

afterAll(async () => {
	await mock.module(
		"../components/known-datasource-list",
		() => realListExports,
	);
});

const { default: DatasourceAdder } =
	await import("../components/datasource-adder");

/**
 * Render the picker.
 *
 * @returns The static markup.
 */
function render(): string {
	return renderToStaticMarkup(<DatasourceAdder handleAdd={() => {}} />);
}

beforeEach(() => {
	knownValue = { state: { status: "idle" }, refresh: () => {} };
});

describe("DatasourceAdder and the known-configurations read", () => {
	test("a pending read says so — never 'you have none'", () => {
		knownValue = { state: { status: "loading" }, refresh: () => {} };

		const markup = render();

		expect(markup).toContain("Looking for datasources you have already");
		expect(markup).not.toContain("KNOWN-SECTION");
		// The catalogue is untouched throughout.
		expect(markup).toContain("Foxglove");
	});

	test("a failed read leaves the catalogue alone and offers a retry", () => {
		knownValue = { state: { status: "error" }, refresh: () => {} };

		const markup = render();

		expect(markup).toContain("Could not load datasources");
		expect(markup).toContain("Retry");
		expect(markup).toContain("Foxglove");
		expect(markup).not.toContain("KNOWN-SECTION");
	});

	test("a delivered list is rendered below the catalogue", () => {
		knownValue = {
			state: {
				status: "ready",
				configs: [
					{
						key: "a",
						datasource_id: "foxglove",
						settings: { id: "", title: "Rover", enable: true },
						title: "Rover",
						alternateTitles: [],
						workspaceCount: 1,
						workspaceNames: ["Lab"],
						lastUsedAt: "2026-05-01T00:00:00.000Z",
					},
				],
			},
			refresh: () => {},
		};

		const markup = render();

		expect(markup).toContain("KNOWN-SECTION");
		// Setting one up from scratch comes first; reuse follows it.
		expect(markup.indexOf("Foxglove websocket")).toBeLessThan(
			markup.indexOf("KNOWN-SECTION"),
		);
	});

	test("the catalogue stays a block of its own, labelled, beside the reuse list", () => {
		// The regression this guards: the reuse rows and the catalogue rows are
		// the same outline buttons in the same two-column grid, so with no
		// heading between them the two read as one list and the from-scratch
		// path looks like it was removed. It was reported as exactly that.
		knownValue = {
			state: {
				status: "ready",
				configs: [
					{
						key: "a",
						datasource_id: "foxglove",
						settings: { id: "", title: "Rover", enable: true },
						title: "Rover",
						alternateTitles: [],
						workspaceCount: 1,
						workspaceNames: ["Lab"],
						lastUsedAt: "2026-05-01T00:00:00.000Z",
					},
				],
			},
			refresh: () => {},
		};

		const markup = render();

		// Named, so neither block can be mistaken for more of the other.
		expect(markup).toContain("Set up a new one");
		expect(markup).toContain('id="datasource-catalogue-heading"');
		// And ruled off, rather than flowing straight on.
		expect(markup).toContain("border-t");
		// The catalogue heading introduces the integrations beneath it, and
		// the reuse list follows both.
		expect(markup.indexOf("Set up a new one")).toBeLessThan(
			markup.indexOf("Foxglove websocket"),
		);
		expect(markup.indexOf("Foxglove websocket")).toBeLessThan(
			markup.indexOf("KNOWN-SECTION"),
		);
	});

	test("the catalogue needs no rule when it is the only block", () => {
		knownValue = {
			state: { status: "ready", configs: [] },
			refresh: () => {},
		};

		const markup = render();

		expect(markup).toContain("Set up a new one");
		expect(markup).not.toContain("border-t");
	});

	test("an empty delivered list adds nothing", () => {
		knownValue = {
			state: { status: "ready", configs: [] },
			refresh: () => {},
		};

		const markup = render();

		expect(markup).not.toContain("KNOWN-SECTION");
		expect(markup).not.toContain("Looking for datasources");
		expect(markup).not.toContain("Could not load datasources");
	});
});
