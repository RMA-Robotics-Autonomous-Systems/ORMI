/**
 * The datasource pick-list reads the configured datasources when it renders.
 *
 * Asserted against a real `JsonForms` tree because the defect this control
 * replaces was invisible at the unit level: the list used to be baked into
 * the schema by the registry, which resolves before the datasources are
 * known, so every dialog opened on a free-text box. Here the datasources are
 * written to the app store and the control must pick them up, at the top
 * level and inside an array item's detail layout.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JsonSchema, UISchemaElement } from "@jsonforms/core";

import { datasourceSelectProperty } from "@workspace/utils";
import type { Datasource } from "../../datasources/datasource-interface";
import { datasourcesAtom } from "../../dashboard/atoms";
import { appStore } from "../../store";

const C2 = "c2-control-source";
const FOX = "foxglove-source";

/**
 * Build a configured datasource.
 * @param datasource_id - Definition id.
 * @param id - Instance id.
 * @param title - Instance title.
 * @returns A datasource instance.
 */
function makeDatasource(
	datasource_id: string,
	id: string,
	title: string,
): Datasource {
	return {
		datasource_id,
		title,
		settings: { id, title, enable: true },
	} as Datasource;
}

let render: (props: {
	schema: JsonSchema;
	uischema?: UISchemaElement;
	data: Record<string, unknown>;
}) => string;

// Module mocks are process-wide for the whole `bun test` run, so only
// `usePluginsManager` is replaced and the real module is put back afterwards.
const realPluginsExports = { ...(await import("@workspace/ormi-plugins")) };

afterAll(async () => {
	await mock.module("@workspace/ormi-plugins", () => realPluginsExports);
});

beforeAll(async () => {
	const pluginsModule = realPluginsExports;
	const manager = {
		applyFilter: <T,>(name: string, initial: T): T =>
			(name === pluginsModule.PluginsHooks.DATASOURCES_LIST
				? [
						{ id: C2, name: "C2 Control" },
						{ id: FOX, name: "Foxglove" },
					]
				: initial) as T,
	};
	await mock.module("@workspace/ormi-plugins", () => ({
		...pluginsModule,
		usePluginsManager: () => manager,
	}));

	const { JsonForms } = await import("@jsonforms/react");
	const { shadcnRenderer, shadcnCells } =
		await import("@workspace/ormi-jsonforms");
	const { coreRenderer } = await import("../index");

	render = ({ schema, uischema, data }) =>
		renderToStaticMarkup(
			<JsonForms
				schema={schema}
				uischema={uischema}
				data={data}
				renderers={[...shadcnRenderer, ...coreRenderer]}
				cells={shadcnCells}
				onChange={() => {}}
			/>,
		);
});

afterEach(() => {
	appStore.set(datasourcesAtom, new Map());
});

/**
 * Configure datasources on the app store.
 * @param datasources - Datasources to configure.
 */
function configure(...datasources: Datasource[]) {
	appStore.set(
		datasourcesAtom,
		new Map(datasources.map((ds) => [ds.settings.id, ds])),
	);
}

const c2Schema: JsonSchema = {
	type: "object",
	properties: {
		datasource_id: datasourceSelectProperty({
			title: "C2 datasource",
			definitionIds: C2,
			autoLabel: "Automatic (any C2 datasource)",
		}),
	},
} as JsonSchema;

describe("DatasourceSelectControl", () => {
	test("renders a pick-list, never a free-text box", () => {
		configure(makeDatasource(C2, "datasource_a", "C2 Alpha"));
		const html = render({ schema: c2Schema, data: {} });

		expect(html).toContain("data-datasource-select");
		expect(html).toContain('role="combobox"');
		expect(html).not.toContain("<input");
		expect(html).not.toContain("No matching datasource");
	});

	test("shows the selected configured datasource by title", () => {
		configure(
			makeDatasource(FOX, "datasource_f", "Robot"),
			makeDatasource(C2, "datasource_a", "C2 Alpha"),
		);
		const html = render({
			schema: c2Schema,
			data: { datasource_id: "datasource_a" },
		});
		expect(html).toContain("C2 Alpha");
		expect(html).toContain("C2 Control");
	});

	test("reads the store at render: a later configuration is picked up", () => {
		expect(render({ schema: c2Schema, data: {} })).toContain(
			"No matching datasource in this workspace.",
		);
		configure(makeDatasource(C2, "datasource_a", "C2 Alpha"));
		expect(render({ schema: c2Schema, data: {} })).not.toContain(
			"No matching datasource",
		);
	});

	test("names a stored id that is no longer configured and keeps it", () => {
		configure(makeDatasource(C2, "datasource_a", "C2 Alpha"));
		const html = render({
			schema: c2Schema,
			data: { datasource_id: "datasource_gone" },
		});
		expect(html).toContain("Missing datasource (datasource_gone)");
	});

	test("the tester matches a marked property nested in an array item", async () => {
		const { datasourceSelectTester } =
			await import("../datasource-select-renderer");
		const itemSchema = {
			type: "object",
			properties: {
				source: datasourceSelectProperty({ title: "Datasource" }),
				rootFrame: { type: "string" },
			},
		} as JsonSchema;
		const rootSchema = {
			type: "object",
			properties: { anchors: { type: "array", items: itemSchema } },
		} as JsonSchema;
		const context = { rootSchema, config: {} };
		const control = (scope: string) =>
			({ type: "Control", scope }) as UISchemaElement;

		// An array detail layout resolves its controls against the item schema.
		expect(
			datasourceSelectTester(
				control("#/properties/source"),
				itemSchema,
				context,
			),
		).toBeGreaterThan(3);
		expect(
			datasourceSelectTester(
				control("#/properties/anchors/items/properties/source"),
				rootSchema,
				context,
			),
		).toBeGreaterThan(3);
		expect(
			datasourceSelectTester(
				control("#/properties/rootFrame"),
				itemSchema,
				context,
			),
		).toBe(-1);
	});
});
