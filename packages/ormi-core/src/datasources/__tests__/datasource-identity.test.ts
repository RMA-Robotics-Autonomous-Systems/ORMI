/**
 * Configuration identity and grouping.
 *
 * Two properties are what the feature rests on and neither is visible at a
 * glance: the key must ignore exactly the base settings fields (so the same
 * robot named twice is one row), and grouping must be total over arbitrary
 * historical `Workspace.content` (so one malformed legacy row cannot break the
 * endpoint for that operator forever).
 */

import { describe, test, expect } from "bun:test";

import {
	DATASOURCE_IDENTITY_IGNORED_KEYS,
	canonicalSettingsJson,
	datasourceConfigKey,
	groupKnownDatasources,
	type KnownDatasourceWorkspaceRow,
} from "../datasource-identity";
import type { Datasource } from "../datasource-interface";

/**
 * Build a datasource instance.
 *
 * @param datasourceId - Definition id.
 * @param settings - Settings blob, merged over the base fields.
 * @param title - Instance title; defaults to the settings title.
 * @returns A datasource instance.
 */
function makeDatasource(
	datasourceId: string,
	settings: Record<string, unknown>,
	title = "Robot",
): Datasource {
	return {
		datasource_id: datasourceId,
		title,
		settings: {
			id: "datasource_abc",
			title,
			enable: true,
			...settings,
		},
	} as unknown as Datasource;
}

describe("datasourceConfigKey", () => {
	test("ignores exactly the DatasourceProviderSettings base fields", () => {
		expect([...DATASOURCE_IDENTITY_IGNORED_KEYS].sort()).toEqual([
			"enable",
			"id",
			"title",
		]);
	});

	test("id, title and enable do not change the key", () => {
		const base = makeDatasource("foxglove", { url: "ws://robot:8765" });
		const renamed = makeDatasource(
			"foxglove",
			{ url: "ws://robot:8765" },
			"Another name",
		);
		renamed.settings.id = "datasource_zzz";
		renamed.settings.enable = false;

		expect(datasourceConfigKey(renamed)).toBe(datasourceConfigKey(base));
	});

	test("stable under property insertion order, recursively", () => {
		const a = makeDatasource("foxglove", {
			url: "ws://robot:8765",
			options: { a: 1, nested: { x: true, y: [1, 2] } },
		});
		const b = makeDatasource("foxglove", {
			options: { nested: { y: [1, 2], x: true }, a: 1 },
			url: "ws://robot:8765",
		});

		expect(datasourceConfigKey(b)).toBe(datasourceConfigKey(a));
	});

	test("arrays are order-significant: two orderings are two configurations", () => {
		// Intended. A settings array is a list the plugin gave meaning to, and
		// sorting it would merge two configurations that are not the same.
		const a = makeDatasource("rest", { endpoints: ["a", "b"] });
		const b = makeDatasource("rest", { endpoints: ["b", "a"] });

		expect(datasourceConfigKey(a)).not.toBe(datasourceConfigKey(b));
	});

	test("an undefined value is the same as an absent key", () => {
		const withUndefined = makeDatasource("rest", {
			url: "http://robot",
			token: undefined,
		});
		const without = makeDatasource("rest", { url: "http://robot" });

		expect(datasourceConfigKey(withUndefined)).toBe(
			datasourceConfigKey(without),
		);
	});

	test("the same settings under a different definition are different keys", () => {
		const a = makeDatasource("foxglove", { url: "ws://robot:8765" });
		const b = makeDatasource("rosbridge", { url: "ws://robot:8765" });

		expect(datasourceConfigKey(a)).not.toBe(datasourceConfigKey(b));
	});

	test("a settings blob that gains a field is a new configuration", () => {
		// Intended and documented: the added field is part of what the plugin
		// declared, so the two connect differently.
		const before = makeDatasource("foxglove", { url: "ws://robot:8765" });
		const after = makeDatasource("foxglove", {
			url: "ws://robot:8765",
			compression: "cbor",
		});

		expect(datasourceConfigKey(before)).not.toBe(
			datasourceConfigKey(after),
		);
	});

	test("canonicalSettingsJson tolerates a non-object", () => {
		expect(canonicalSettingsJson(null as unknown as undefined)).toBe("{}");
		expect(canonicalSettingsJson(undefined)).toBe("{}");
		expect(
			canonicalSettingsJson(
				"nope" as unknown as Parameters<
					typeof canonicalSettingsJson
				>[0],
			),
		).toBe("{}");
	});
});

/**
 * Build a workspace row.
 *
 * @param id - Workspace id.
 * @param name - Workspace name.
 * @param updatedAT - Last update.
 * @param datasources - Instances, keyed by instance id.
 * @returns A workspace row for grouping.
 */
function makeRow(
	id: number,
	name: string,
	updatedAT: string,
	datasources: Record<string, unknown>,
): KnownDatasourceWorkspaceRow {
	return {
		id,
		name,
		updatedAT: new Date(updatedAT),
		content: { layouts: {}, widgets: {}, datasources, locked: false },
	};
}

describe("groupKnownDatasources", () => {
	test("collapses one configuration across workspaces", () => {
		const configs = groupKnownDatasources([
			makeRow(1, "Field trial", "2026-01-01T00:00:00.000Z", {
				d1: makeDatasource("foxglove", { url: "ws://a:8765" }, "Rover"),
			}),
			makeRow(2, "Lab", "2026-02-01T00:00:00.000Z", {
				d2: makeDatasource("foxglove", { url: "ws://a:8765" }, "Rover"),
			}),
		]);

		expect(configs).toHaveLength(1);
		expect(configs[0]!.workspaceCount).toBe(2);
		expect(configs[0]!.workspaceNames).toEqual(["Lab", "Field trial"]);
	});

	test("the most recently updated workspace supplies the primary title", () => {
		const configs = groupKnownDatasources([
			makeRow(1, "Old", "2026-01-01T00:00:00.000Z", {
				d1: makeDatasource("foxglove", { url: "ws://a" }, "Old name"),
			}),
			makeRow(2, "New", "2026-03-01T00:00:00.000Z", {
				d2: makeDatasource("foxglove", { url: "ws://a" }, "New name"),
			}),
			makeRow(3, "Middle", "2026-02-01T00:00:00.000Z", {
				d3: makeDatasource("foxglove", { url: "ws://a" }, "Mid name"),
				d4: makeDatasource("foxglove", { url: "ws://a" }, "New name"),
			}),
		]);

		expect(configs).toHaveLength(1);
		expect(configs[0]!.title).toBe("New name");
		// Newest first, deduped, primary excluded.
		expect(configs[0]!.alternateTitles).toEqual(["Mid name", "Old name"]);
	});

	test("lastUsedAt is the max updatedAT across the workspaces", () => {
		const configs = groupKnownDatasources([
			makeRow(1, "Old", "2026-01-01T00:00:00.000Z", {
				d1: makeDatasource("foxglove", { url: "ws://a" }),
			}),
			makeRow(2, "New", "2026-03-04T05:06:07.000Z", {
				d2: makeDatasource("foxglove", { url: "ws://a" }),
			}),
		]);

		expect(configs[0]!.lastUsedAt).toBe("2026-03-04T05:06:07.000Z");
	});

	test("the payload is seed-ready: no instance id, enabled, primary title", () => {
		const instance = makeDatasource(
			"foxglove",
			{ url: "ws://a", enable: false },
			"Rover",
		);
		instance.settings.id = "datasource_original";

		const configs = groupKnownDatasources([
			makeRow(1, "Lab", "2026-01-01T00:00:00.000Z", { d1: instance }),
		]);

		expect(configs[0]!.settings.id).toBe("");
		expect(configs[0]!.settings.enable).toBe(true);
		expect(configs[0]!.settings.title).toBe("Rover");
		expect(
			(configs[0]!.settings as unknown as Record<string, unknown>).url,
		).toBe("ws://a");
	});

	test("the payload does not alias the row it came from", () => {
		const instance = makeDatasource("foxglove", {
			options: { deep: true },
		});
		const configs = groupKnownDatasources([
			makeRow(1, "Lab", "2026-01-01T00:00:00.000Z", { d1: instance }),
		]);

		const payload = configs[0]!.settings as unknown as Record<
			string,
			Record<string, unknown>
		>;
		payload.options!.deep = false;

		expect(
			(instance.settings as unknown as Record<string, { deep: boolean }>)
				.options!.deep,
		).toBe(true);
	});

	test("rows come back most recently used first", () => {
		const configs = groupKnownDatasources([
			makeRow(1, "Old", "2026-01-01T00:00:00.000Z", {
				d1: makeDatasource("foxglove", { url: "ws://old" }),
			}),
			makeRow(2, "New", "2026-05-01T00:00:00.000Z", {
				d2: makeDatasource("foxglove", { url: "ws://new" }),
			}),
		]);

		expect(
			configs.map(
				(config) =>
					(config.settings as unknown as Record<string, unknown>).url,
			),
		).toEqual(["ws://new", "ws://old"]);
	});

	test("two configurations sharing a title stay two rows", () => {
		const configs = groupKnownDatasources([
			makeRow(1, "Lab", "2026-01-01T00:00:00.000Z", {
				d1: makeDatasource("foxglove", { url: "ws://a" }, "Rover"),
				d2: makeDatasource("foxglove", { url: "ws://b" }, "Rover"),
			}),
		]);

		expect(configs).toHaveLength(2);
	});

	test("a string updatedAT is read the same as a Date", () => {
		const configs = groupKnownDatasources([
			{
				id: 1,
				name: "Lab",
				updatedAT: "2026-04-01T00:00:00.000Z",
				content: {
					datasources: {
						d1: makeDatasource("foxglove", { url: "ws://a" }),
					},
				},
			},
		]);

		expect(configs[0]!.lastUsedAt).toBe("2026-04-01T00:00:00.000Z");
	});

	describe("total over garbage", () => {
		/** Every malformed `content` shape a historical workspace can hold. */
		const malformed: Array<[string, unknown]> = [
			["null content", null],
			["undefined content", undefined],
			["array content", [1, 2, 3]],
			["string content", "not json"],
			["number content", 42],
			["missing datasources", { layouts: {}, widgets: {} }],
			["null datasources", { datasources: null }],
			["array datasources", { datasources: [] }],
			["string datasources", { datasources: "nope" }],
			["entry is null", { datasources: { d1: null } }],
			["entry is a string", { datasources: { d1: "nope" } }],
			["entry is an array", { datasources: { d1: [] } }],
			["entry has no datasource_id", { datasources: { d1: {} } }],
			[
				"entry has an empty datasource_id",
				{ datasources: { d1: { datasource_id: "", settings: {} } } },
			],
			[
				"entry has no settings",
				{ datasources: { d1: { datasource_id: "foxglove" } } },
			],
			[
				"entry has null settings",
				{
					datasources: {
						d1: { datasource_id: "foxglove", settings: null },
					},
				},
			],
			[
				"entry has non-object settings",
				{
					datasources: {
						d1: { datasource_id: "foxglove", settings: "nope" },
					},
				},
			],
			[
				"entry has array settings",
				{
					datasources: {
						d1: { datasource_id: "foxglove", settings: [] },
					},
				},
			],
		];

		for (const [label, content] of malformed) {
			test(`${label} contributes nothing and does not throw`, () => {
				expect(() =>
					groupKnownDatasources([
						{
							id: 1,
							name: "Broken",
							updatedAT: new Date("2026-01-01T00:00:00.000Z"),
							content,
						},
					]),
				).not.toThrow();

				expect(
					groupKnownDatasources([
						{
							id: 1,
							name: "Broken",
							updatedAT: new Date("2026-01-01T00:00:00.000Z"),
							content,
						},
					]),
				).toEqual([]);
			});
		}

		test("one malformed row does not hide the healthy rows beside it", () => {
			const configs = groupKnownDatasources([
				{
					id: 1,
					name: "Broken",
					updatedAT: "not a date",
					content: { datasources: { d1: 7 } },
				},
				makeRow(2, "Lab", "2026-01-01T00:00:00.000Z", {
					d2: makeDatasource("foxglove", { url: "ws://a" }, "Rover"),
				}),
			]);

			expect(configs).toHaveLength(1);
			expect(configs[0]!.title).toBe("Rover");
		});

		test("an unreadable updatedAT still produces a valid ISO timestamp", () => {
			const configs = groupKnownDatasources([
				{
					id: 1,
					name: "Lab",
					updatedAT: "not a date",
					content: {
						datasources: {
							d1: makeDatasource("foxglove", { url: "ws://a" }),
						},
					},
				},
			]);

			expect(Number.isNaN(Date.parse(configs[0]!.lastUsedAt))).toBe(
				false,
			);
		});

		test("an empty row list is an empty result", () => {
			expect(groupKnownDatasources([])).toEqual([]);
		});
	});
});
