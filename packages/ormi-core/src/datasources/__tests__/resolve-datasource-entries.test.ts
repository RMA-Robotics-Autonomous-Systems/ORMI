import { describe, expect, test } from "bun:test";

import { resolveDatasourceEntries } from "../components/global-datasource-provider";
import type {
	Datasource,
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../datasource-interface";

/** Minimal definition stub — only identity and Provider matter here. */
function definition(
	id: string,
): DatasourceDefinition<DatasourceProviderSettings> {
	return {
		id,
		name: id,
		description: `${id} description`,
		schema: { type: "object" },
		data: { id: "", title: "", enable: true },
		Provider: () => null,
	};
}

/** Minimal configured datasource instance. */
function instance(datasource_id: string, id: string): Datasource {
	return {
		datasource_id,
		title: `${datasource_id} instance`,
		settings: { id, title: `${datasource_id} instance`, enable: true },
	};
}

describe("resolveDatasourceEntries", () => {
	test("pairs a configured datasource with its definition", () => {
		const defs = new Map([["rosbridge", definition("rosbridge")]]);
		const entries = resolveDatasourceEntries(
			[instance("rosbridge", "a")],
			defs,
		);

		expect(entries).toHaveLength(1);
		expect(entries[0]!.kind).toBe("supported");
		if (entries[0]!.kind !== "supported") throw new Error("unreachable");
		expect(entries[0]!.definition.id).toBe("rosbridge");
		expect(entries[0]!.datasource.settings.id).toBe("a");
	});

	test("marks a datasource whose definition is missing as unsupported instead of throwing", () => {
		const defs = new Map<
			string,
			DatasourceDefinition<DatasourceProviderSettings>
		>();

		expect(() =>
			resolveDatasourceEntries([instance("dev-only-plugin", "a")], defs),
		).not.toThrow();

		const entries = resolveDatasourceEntries(
			[instance("dev-only-plugin", "a")],
			defs,
		);

		expect(entries).toHaveLength(1);
		expect(entries[0]!.kind).toBe("unsupported");
		expect(entries[0]!.datasource.datasource_id).toBe("dev-only-plugin");
	});

	test("keeps supported datasources usable alongside unsupported ones", () => {
		const defs = new Map([["rosbridge", definition("rosbridge")]]);
		const entries = resolveDatasourceEntries(
			[
				instance("rosbridge", "a"),
				instance("dev-only-plugin", "b"),
				instance("rosbridge", "c"),
			],
			defs,
		);

		expect(entries.map((entry) => entry.kind)).toEqual([
			"supported",
			"unsupported",
			"supported",
		]);
	});

	test("preserves input order and never drops an entry", () => {
		const defs = new Map([["rosbridge", definition("rosbridge")]]);
		const configured = new Map<string, Datasource>([
			["a", instance("dev-only-plugin", "a")],
			["b", instance("rosbridge", "b")],
		]);

		const entries = resolveDatasourceEntries(configured.values(), defs);

		expect(entries.map((entry) => entry.datasource.settings.id)).toEqual([
			"a",
			"b",
		]);
	});

	test("returns no entries for an empty workspace", () => {
		expect(resolveDatasourceEntries([], new Map())).toEqual([]);
	});
});
