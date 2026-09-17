import { describe, expect, test } from "bun:test";

import {
	buildDatasourceOneOf,
	createDatasourceSelectHook,
	DATASOURCE_SELECT_AUTO_VALUE,
	type DatasourceInstanceLike,
	type DatasourceListManagerLike,
} from "../datasource-select-schema";

/**
 * Build a configured datasource instance.
 * @param definitionId - Datasource definition id.
 * @param instanceId - Datasource instance id.
 * @param title - Instance title.
 * @returns A datasource instance.
 */
function makeDatasource(
	definitionId: string,
	instanceId: string,
	title?: string,
): DatasourceInstanceLike {
	return {
		datasource_id: definitionId,
		title,
		settings: { id: instanceId, title },
	};
}

/**
 * Minimal manager returning a fixed datasource list.
 * @param datasources - Datasources the manager exposes.
 * @returns A structural manager plus the hook names it was asked for.
 */
function makeManager(datasources: DatasourceInstanceLike[]) {
	const hooks: string[] = [];
	const manager: DatasourceListManagerLike = {
		applyFilter: <T>(name: string): T => {
			hooks.push(name);
			return datasources as unknown as T;
		},
	};
	return { manager, hooks };
}

describe("buildDatasourceOneOf", () => {
	test("maps matching instances to const/title members", () => {
		const members = buildDatasourceOneOf(
			[
				makeDatasource("c2-control-source", "datasource_a", "C2 Alpha"),
				makeDatasource("c2-control-source", "datasource_b", "C2 Bravo"),
			],
			{ definitionId: "c2-control-source" },
		);

		expect(members).toEqual([
			{ const: "datasource_a", title: "C2 Alpha" },
			{ const: "datasource_b", title: "C2 Bravo" },
		]);
	});

	test("ignores instances of other datasource definitions", () => {
		const members = buildDatasourceOneOf(
			[
				makeDatasource("c2-control-source", "datasource_a", "C2 Alpha"),
				makeDatasource("tello-data-source", "datasource_t", "Tello"),
				makeDatasource(
					"rosbridge-suite-source",
					"datasource_r",
					"Robot",
				),
			],
			{ definitionId: "tello-data-source" },
		);

		expect(members).toEqual([{ const: "datasource_t", title: "Tello" }]);
	});

	test("accepts several definition ids", () => {
		const members = buildDatasourceOneOf(
			[
				makeDatasource("rest-bag-source", "datasource_1", "Bags"),
				makeDatasource("tello-data-source", "datasource_2", "Tello"),
			],
			{ definitionId: ["rest-bag-source", "tello-data-source"] },
		);

		expect(members.map((member) => member.const)).toEqual([
			"datasource_1",
			"datasource_2",
		]);
	});

	test("prepends the automatic member when a label is given", () => {
		const members = buildDatasourceOneOf(
			[makeDatasource("c2-control-source", "datasource_a", "C2 Alpha")],
			{ definitionId: "c2-control-source", autoLabel: "Automatic" },
		);

		expect(members[0]).toEqual({
			const: DATASOURCE_SELECT_AUTO_VALUE,
			title: "Automatic",
		});
		expect(members).toHaveLength(2);
	});

	test("returns no members for an empty datasource list", () => {
		expect(
			buildDatasourceOneOf([], {
				definitionId: "c2-control-source",
				autoLabel: "Automatic",
			}),
		).toEqual([]);
		expect(
			buildDatasourceOneOf(undefined, {
				definitionId: "c2-control-source",
			}),
		).toEqual([]);
	});

	test("returns no members when nothing matches, even with an auto label", () => {
		expect(
			buildDatasourceOneOf(
				[makeDatasource("tello-data-source", "datasource_t", "Tello")],
				{ definitionId: "c2-control-source", autoLabel: "Automatic" },
			),
		).toEqual([]);
	});

	test("dedupes by instance id and falls back to the id as title", () => {
		const members = buildDatasourceOneOf(
			[
				makeDatasource("rest-bag-source", "datasource_1", "Bags"),
				makeDatasource("rest-bag-source", "datasource_1", "Bags again"),
				makeDatasource("rest-bag-source", "datasource_2"),
			],
			{ definitionId: "rest-bag-source" },
		);

		expect(members).toEqual([
			{ const: "datasource_1", title: "Bags" },
			{ const: "datasource_2", title: "datasource_2" },
		]);
	});
});

describe("createDatasourceSelectHook", () => {
	const baseDefinition = () => ({
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				datasource_id: {
					type: "string",
					title: "C2 datasource id (optional)",
				},
			},
			required: ["title"],
		} as Record<string, unknown> & {
			properties?: Record<string, unknown>;
		},
	});

	test("rewrites the field into a oneOf pick-list, keeping its title", () => {
		const { manager, hooks } = makeManager([
			makeDatasource("c2-control-source", "datasource_a", "C2 Alpha"),
		]);
		const definition = baseDefinition();

		const result = createDatasourceSelectHook({
			field: "datasource_id",
			definitionId: "c2-control-source",
			autoLabel: "Automatic",
		})(definition, manager);

		expect(result).toBe(definition);
		expect(hooks).toEqual(["plugins-datasources-availables"]);
		expect(definition.schema.properties?.datasource_id).toEqual({
			type: "string",
			title: "C2 datasource id (optional)",
			oneOf: [
				{ const: "", title: "Automatic" },
				{ const: "datasource_a", title: "C2 Alpha" },
			],
		});
		// Untouched siblings stay as they were.
		expect(definition.schema.properties?.title).toEqual({
			type: "string",
			title: "Title",
		});
	});

	test("is idempotent when applied to an already rewritten definition", () => {
		const { manager } = makeManager([
			makeDatasource("c2-control-source", "datasource_a", "C2 Alpha"),
		]);
		const hook = createDatasourceSelectHook({
			field: "datasource_id",
			definitionId: "c2-control-source",
			autoLabel: "Automatic",
		});
		const definition = baseDefinition();

		hook(definition, manager);
		const once = structuredClone(definition.schema.properties);
		hook(definition, manager);

		expect(definition.schema.properties).toEqual(once);
	});

	test("leaves the free-text field alone when no datasource matches", () => {
		const { manager } = makeManager([
			makeDatasource("tello-data-source", "datasource_t", "Tello"),
		]);
		const definition = baseDefinition();

		createDatasourceSelectHook({
			field: "datasource_id",
			definitionId: "c2-control-source",
			autoLabel: "Automatic",
		})(definition, manager);

		expect(definition.schema.properties?.datasource_id).toEqual({
			type: "string",
			title: "C2 datasource id (optional)",
		});
	});

	test("is a no-op for an unknown field", () => {
		const { manager } = makeManager([
			makeDatasource("c2-control-source", "datasource_a", "C2 Alpha"),
		]);
		const definition = baseDefinition();
		const before = structuredClone(definition.schema.properties);

		createDatasourceSelectHook({
			field: "missing_field",
			definitionId: "c2-control-source",
		})(definition, manager);

		expect(definition.schema.properties).toEqual(before);
	});

	test("applies the title override and keeps a description", () => {
		const { manager } = makeManager([
			makeDatasource("rest-bag-source", "datasource_1", "Bags"),
		]);
		const definition = {
			schema: {
				properties: {
					api_datasource_id: {
						type: "string",
						title: "API Datasource ID",
						description: "Bag API",
					},
				},
			} as { properties?: Record<string, unknown> },
		};

		createDatasourceSelectHook({
			field: "api_datasource_id",
			definitionId: "rest-bag-source",
			title: "Bag API datasource",
		})(definition, manager);

		expect(definition.schema.properties?.api_datasource_id).toEqual({
			type: "string",
			title: "Bag API datasource",
			description: "Bag API",
			oneOf: [{ const: "datasource_1", title: "Bags" }],
		});
	});
});
