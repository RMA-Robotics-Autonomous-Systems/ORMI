/**
 * What the known-datasource list puts on screen, and — more importantly —
 * what it does not.
 *
 * Three properties are asserted here because each of them fails silently:
 * a configuration whose plugin this build lacks must vanish rather than
 * become a broken card; one this dashboard already carries must be *marked*
 * rather than dropped; and the only values out of the settings blob that reach
 * the DOM are the ones the definition named in `summaryProps`, because those
 * blobs carry credentials.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { KnownDatasourceList } from "../components/known-datasource-list";
import type { KnownDatasourceConfig } from "../datasource-identity";
import type { DatasourceDefinition } from "../datasource-interface";

/** A sentinel that must never be rendered. */
const TOKEN_SENTINEL = "sentinel-bearer-token-do-not-render";

/**
 * Build a datasource definition stub.
 *
 * @param id - Definition id.
 * @param name - Display name.
 * @param summaryProps - Settings keys this definition allows on screen.
 * @returns A definition with only what the list reads.
 */
function makeDefinition(
	id: string,
	name: string,
	summaryProps?: string[],
): DatasourceDefinition {
	return {
		id,
		name,
		description: `${name} description`,
		summaryProps,
		schema: {},
		data: { id: "", title: "", enable: true },
		Provider: () => null,
	} as unknown as DatasourceDefinition;
}

/**
 * Build a known configuration.
 *
 * @param overrides - Fields to override on the default configuration.
 * @returns A known configuration.
 */
function makeConfig(
	overrides: Partial<KnownDatasourceConfig> = {},
): KnownDatasourceConfig {
	return {
		key: "foxglove\u0000{}",
		datasource_id: "foxglove",
		settings: { id: "", title: "Rover", enable: true },
		title: "Rover",
		alternateTitles: [],
		workspaceCount: 1,
		workspaceNames: ["Lab"],
		lastUsedAt: "2026-05-01T00:00:00.000Z",
		...overrides,
	};
}

/**
 * Render the list.
 *
 * @param props - Overrides for the list's props.
 * @returns The static markup.
 */
function render(props: {
	configs: KnownDatasourceConfig[];
	definitions?: DatasourceDefinition[];
	presentKeys?: Set<string>;
}): string {
	return renderToStaticMarkup(
		<KnownDatasourceList
			configs={props.configs}
			definitions={
				props.definitions ?? [makeDefinition("foxglove", "Foxglove")]
			}
			presentKeys={props.presentKeys ?? new Set<string>()}
			onAdd={() => {}}
		/>,
	);
}

describe("KnownDatasourceList", () => {
	test("renders a row per configuration, grouped under its definition", () => {
		const markup = render({
			configs: [
				makeConfig({ key: "a", title: "Rover" }),
				makeConfig({ key: "b", title: "Drone" }),
			],
		});

		expect(markup).toContain("From your other dashboards");
		expect(markup).toContain("Foxglove");
		expect(markup).toContain("Rover");
		expect(markup).toContain("Drone");
	});

	test("a configuration whose definition this build lacks is not rendered", () => {
		const markup = render({
			configs: [
				makeConfig({ key: "a", title: "Rover" }),
				makeConfig({
					key: "b",
					title: "Gone Plugin Robot",
					datasource_id: "retired-plugin",
				}),
			],
		});

		expect(markup).toContain("Rover");
		expect(markup).not.toContain("Gone Plugin Robot");
	});

	test("nothing offerable renders nothing at all, not an empty heading", () => {
		const markup = render({
			configs: [
				makeConfig({ datasource_id: "retired-plugin", key: "b" }),
			],
		});

		expect(markup).toBe("");
	});

	test("a configuration already in this dashboard is marked, not hidden", () => {
		const markup = render({
			configs: [makeConfig({ key: "here", title: "Rover" })],
			presentKeys: new Set(["here"]),
		});

		expect(markup).toContain("Rover");
		expect(markup).toContain("Already in this dashboard");
		expect(markup).toContain("disabled");
	});

	test("rows already in this dashboard sort after actionable ones", () => {
		const markup = render({
			configs: [
				makeConfig({
					key: "here",
					title: "AlreadyHere",
					lastUsedAt: "2026-09-01T00:00:00.000Z",
				}),
				makeConfig({
					key: "elsewhere",
					title: "Addable",
					lastUsedAt: "2026-01-01T00:00:00.000Z",
				}),
			],
			presentKeys: new Set(["here"]),
		});

		expect(markup.indexOf("Addable")).toBeLessThan(
			markup.indexOf("AlreadyHere"),
		);
	});

	test("actionable rows are ordered most recently used first", () => {
		const markup = render({
			configs: [
				makeConfig({
					key: "old",
					title: "Older",
					lastUsedAt: "2026-01-01T00:00:00.000Z",
				}),
				makeConfig({
					key: "new",
					title: "Newer",
					lastUsedAt: "2026-08-01T00:00:00.000Z",
				}),
			],
		});

		expect(markup.indexOf("Newer")).toBeLessThan(markup.indexOf("Older"));
	});

	test("alternate titles and usage are spelled out", () => {
		const markup = render({
			configs: [
				makeConfig({
					title: "Rover",
					alternateTitles: ["Robot 1", "Old rover"],
					workspaceCount: 4,
					workspaceNames: ["Lab", "Field", "Demo", "Archive"],
				}),
			],
		});

		expect(markup).toContain("Robot 1, Old rover");
		expect(markup).toContain("in 4 dashboards");
		expect(markup).toContain("last used");
		// Capped at three names, the rest counted.
		expect(markup).toContain("Lab, Field, Demo +1");
		expect(markup).not.toContain("Archive");
	});

	test("a single workspace reads in the singular", () => {
		const markup = render({
			configs: [makeConfig({ workspaceCount: 1 })],
		});

		expect(markup).toContain("in 1 dashboard");
		expect(markup).not.toContain("in 1 dashboards");
	});

	test("a declared summary prop is rendered under the title", () => {
		const markup = render({
			configs: [
				makeConfig({
					title: "Rover",
					settings: {
						id: "",
						title: "Rover",
						enable: true,
						url: "ws://rover.internal:8765",
					} as KnownDatasourceConfig["settings"],
				}),
			],
			definitions: [makeDefinition("foxglove", "Foxglove", ["url"])],
		});

		expect(markup).toContain("ws://rover.internal:8765");
		// Directly under the name it identifies, above the usage lines.
		expect(markup.indexOf("Rover")).toBeLessThan(
			markup.indexOf("ws://rover.internal:8765"),
		);
		expect(markup.indexOf("ws://rover.internal:8765")).toBeLessThan(
			markup.indexOf("in 1 dashboard"),
		);
		// Reachable in full even when the row truncates it.
		expect(markup).toContain('title="ws://rover.internal:8765"');
		// And in the accessible name, which replaces the row's contents.
		expect(markup).toContain(
			'aria-label="Add Rover (Foxglove, ws://rover.internal:8765) from your other dashboards"',
		);
	});

	test("a definition declaring no summary props renders no summary line", () => {
		const markup = render({
			configs: [
				makeConfig({
					title: "Rover",
					settings: {
						id: "",
						title: "Rover",
						enable: true,
						url: "ws://rover.internal:8765",
					} as KnownDatasourceConfig["settings"],
				}),
			],
			definitions: [makeDefinition("foxglove", "Foxglove")],
		});

		expect(markup).toContain("Rover");
		expect(markup).not.toContain("rover.internal");
		expect(markup).not.toContain("8765");
	});

	test("only the declared key reaches the DOM: the url shows, the token never does", () => {
		// The settings of a real credential-carrying datasource, and the whole
		// point of the allowlist: a regression that swaps the two fields — or
		// reintroduces a name heuristic, where `missionControlUrl` and
		// `missionControlToken` share a prefix — breaks this test.
		const markup = render({
			configs: [
				makeConfig({
					datasource_id: "c2-control-source",
					key: "c2",
					title: "Mission control",
					settings: {
						id: "",
						title: "Mission control",
						enable: true,
						missionControlUrl: "http://c2.internal:5001",
						dbUrl: "http://c2.internal:5000",
						missionControlToken: TOKEN_SENTINEL,
					} as KnownDatasourceConfig["settings"],
				}),
			],
			definitions: [
				makeDefinition("c2-control-source", "C2 Mission Control", [
					"missionControlUrl",
				]),
			],
		});

		expect(markup).toContain("Mission control");
		expect(markup).toContain("http://c2.internal:5001");
		expect(markup).not.toContain(TOKEN_SENTINEL);
		// Undeclared, so it stays off screen even though it is a url too.
		expect(markup).not.toContain("5000");
	});
});
