import { describe, expect, test } from "bun:test";

import {
	buildDatasourceSelectOptions,
	DATASOURCE_SELECT_AUTO_VALUE,
	DATASOURCE_SELECT_KEYWORD,
	datasourceSelectProperty,
	readDatasourceSelectMarker,
	type DatasourceInstanceLike,
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

const C2 = "c2-control-source";
const FOX = "foxglove-source";

const configured = [
	makeDatasource(C2, "datasource_a", "C2 Alpha"),
	makeDatasource(FOX, "datasource_f", "Robot"),
	makeDatasource(C2, "datasource_b", "C2 Bravo"),
];

const names: Record<string, string> = { [C2]: "C2 Control", [FOX]: "Foxglove" };
const typeName = (id: string) => names[id];

describe("datasourceSelectProperty", () => {
	test("emits a plain string schema carrying the marker", () => {
		const schema = datasourceSelectProperty({
			title: "C2 datasource",
			definitionIds: C2,
			autoLabel: "Automatic",
		});
		expect(schema).toEqual({
			type: "string",
			title: "C2 datasource",
			[DATASOURCE_SELECT_KEYWORD]: {
				definitionIds: [C2],
				autoLabel: "Automatic",
			},
		});
		// No oneOf/enum: validation never depends on what is configured.
		expect("oneOf" in schema).toBe(false);
		expect("enum" in schema).toBe(false);
	});

	test("omits the type filter when every datasource is accepted", () => {
		const schema = datasourceSelectProperty({ title: "Datasource" });
		expect(schema[DATASOURCE_SELECT_KEYWORD]).toEqual({});
		expect(
			datasourceSelectProperty({ title: "D", definitionIds: [] })[
				DATASOURCE_SELECT_KEYWORD
			],
		).toEqual({});
	});

	test("round-trips through readDatasourceSelectMarker", () => {
		const schema = datasourceSelectProperty({
			title: "T",
			definitionIds: [C2, FOX],
			autoLabel: "Auto",
		});
		expect(readDatasourceSelectMarker(schema)).toEqual({
			definitionIds: [C2, FOX],
			autoLabel: "Auto",
		});
	});
});

describe("readDatasourceSelectMarker", () => {
	test("returns undefined for an unmarked or malformed schema", () => {
		expect(readDatasourceSelectMarker(undefined)).toBeUndefined();
		expect(readDatasourceSelectMarker({ type: "string" })).toBeUndefined();
		expect(
			readDatasourceSelectMarker({ [DATASOURCE_SELECT_KEYWORD]: true }),
		).toBeUndefined();
		expect(
			readDatasourceSelectMarker({ [DATASOURCE_SELECT_KEYWORD]: [C2] }),
		).toBeUndefined();
	});

	test("drops non-string ids and a blank auto label", () => {
		expect(
			readDatasourceSelectMarker({
				[DATASOURCE_SELECT_KEYWORD]: {
					definitionIds: [C2, 4, "", null],
					autoLabel: "  ",
				},
			}),
		).toEqual({ definitionIds: [C2] });
	});
});

describe("buildDatasourceSelectOptions", () => {
	test("offers only accepted types, in configuration order, with type names", () => {
		const { options, configuredCount } = buildDatasourceSelectOptions(
			configured,
			{ definitionIds: [C2] },
			"",
			typeName,
		);
		expect(configuredCount).toBe(2);
		expect(options).toEqual([
			{
				value: "datasource_a",
				label: "C2 Alpha",
				typeName: "C2 Control",
				kind: "configured",
			},
			{
				value: "datasource_b",
				label: "C2 Bravo",
				typeName: "C2 Control",
				kind: "configured",
			},
		]);
	});

	test("accepts every configured datasource without a type filter", () => {
		const { options } = buildDatasourceSelectOptions(configured, {}, "");
		expect(options.map((o) => o.value)).toEqual([
			"datasource_a",
			"datasource_f",
			"datasource_b",
		]);
	});

	test("leads with the automatic option when the marker names one", () => {
		const { options } = buildDatasourceSelectOptions(
			configured,
			{ definitionIds: [C2], autoLabel: "Automatic (any C2 datasource)" },
			undefined,
		);
		expect(options[0]).toEqual({
			value: DATASOURCE_SELECT_AUTO_VALUE,
			label: "Automatic (any C2 datasource)",
			kind: "auto",
		});
	});

	test("keeps the automatic option with nothing configured", () => {
		const { options, configuredCount } = buildDatasourceSelectOptions(
			[],
			{ autoLabel: "Automatic" },
			"",
		);
		expect(configuredCount).toBe(0);
		expect(options.map((o) => o.kind)).toEqual(["auto"]);
	});

	test("names a stored id that matches no configured datasource", () => {
		const { options, configuredCount } = buildDatasourceSelectOptions(
			configured,
			{ definitionIds: [C2] },
			"datasource_gone",
			typeName,
		);
		expect(configuredCount).toBe(2);
		expect(options.at(-1)).toEqual({
			value: "datasource_gone",
			label: "Missing datasource (datasource_gone)",
			kind: "missing",
		});
	});

	test("keeps a stored id with nothing configured at all", () => {
		const { options } = buildDatasourceSelectOptions(
			undefined,
			{},
			"datasource_gone",
		);
		expect(options).toEqual([
			{
				value: "datasource_gone",
				label: "Missing datasource (datasource_gone)",
				kind: "missing",
			},
		]);
	});

	test("names a stored id of a configured datasource of the wrong type", () => {
		const { options } = buildDatasourceSelectOptions(
			configured,
			{ definitionIds: [C2] },
			"datasource_f",
			typeName,
		);
		expect(options.at(-1)).toEqual({
			value: "datasource_f",
			label: "Incompatible datasource (Robot)",
			typeName: "Foxglove",
			kind: "incompatible",
		});
	});

	test("adds no extra option when the stored id is offered", () => {
		const { options } = buildDatasourceSelectOptions(
			configured,
			{ definitionIds: [C2] },
			"datasource_b",
		);
		expect(options.map((o) => o.kind)).toEqual([
			"configured",
			"configured",
		]);
	});

	test("dedupes by instance id and falls back to the id for a label", () => {
		const { options } = buildDatasourceSelectOptions(
			[
				makeDatasource(C2, "datasource_a"),
				makeDatasource(C2, "datasource_a", "Duplicate"),
				{ datasource_id: C2, settings: { id: "" } },
			],
			{},
			"",
		);
		expect(options).toEqual([
			{
				value: "datasource_a",
				label: "datasource_a",
				kind: "configured",
			},
		]);
	});

	test("ignores a non-string stored value", () => {
		const { options } = buildDatasourceSelectOptions(configured, {}, 42);
		expect(options.every((o) => o.kind === "configured")).toBe(true);
	});
});
