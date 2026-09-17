/**
 * Tests for the unsupported-widget-configuration predicates.
 *
 * Critical: these decide whether a saved widget renders or is replaced by an
 * unsupported-configuration card. A false positive hides a working panel from
 * an operator; a false negative lets stale settings reach a widget body, which
 * then reports a plausible wrong value. Neither failure is visible from the
 * outside, which is why the predicates are pure and tested directly.
 */

import { describe, test, expect } from "bun:test";
import type { JsonSchema } from "@jsonforms/core";

import {
	WIDGET_DEFINITION_MISSING_ID,
	findSettingsMismatches,
	isWidgetDefinitionMissing,
	settingsSatisfySchema,
} from "../components/widget-status/unsupported-settings";
import type { WidgetDefinition } from "../widget-interface";

/** Minimal definition stub — only `id` is read by the predicate. */
const definition = (id: string): WidgetDefinition =>
	({ id }) as unknown as WidgetDefinition;

describe("isWidgetDefinitionMissing", () => {
	test("reports a real definition as present", () => {
		expect(isWidgetDefinitionMissing(definition("gauge-widget"))).toBe(
			false,
		);
	});

	test("reports the reserved placeholder id as missing", () => {
		expect(
			isWidgetDefinitionMissing(definition(WIDGET_DEFINITION_MISSING_ID)),
		).toBe(true);
	});

	test("treats null and undefined as missing", () => {
		expect(isWidgetDefinitionMissing(null)).toBe(true);
		expect(isWidgetDefinitionMissing(undefined)).toBe(true);
	});
});

describe("findSettingsMismatches — required properties", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: {
			label: { type: "string", title: "Label" },
			unit: { type: "string", default: "m/s" },
		},
		required: ["label", "unit"],
	};

	test("accepts settings that carry every required value", () => {
		expect(
			findSettingsMismatches(schema, { label: "Speed", unit: "km/h" }),
		).toEqual([]);
	});

	test("reports a required property the saved settings never got", () => {
		const mismatches = findSettingsMismatches(schema, { unit: "km/h" });

		expect(mismatches).toHaveLength(1);
		expect(mismatches[0]!.property).toBe("label");
		expect(mismatches[0]!.reason).toBe("missing");
		// The schema `title` is what the config dialog labels the field with.
		expect(mismatches[0]!.label).toBe("Label");
	});

	test("does not report a required property that carries a schema default", () => {
		// `unit` is required but satisfiable from the definition alone, which is
		// the repo-wide rule for definitions being valid on open.
		expect(findSettingsMismatches(schema, { label: "Speed" })).toEqual([]);
	});

	test("labels a property with no title from its key", () => {
		const untitled: JsonSchema = {
			type: "object",
			properties: { maxDepth: { type: "number" } },
			required: ["maxDepth"],
		};

		expect(findSettingsMismatches(untitled, {})[0]!.label).toBe(
			"Max depth",
		);
	});

	test("treats an explicit null as a value, not an absence", () => {
		const nullable: JsonSchema = {
			type: "object",
			properties: { frame: { type: ["string", "null"] } },
			required: ["frame"],
		};

		expect(findSettingsMismatches(nullable, { frame: null })).toEqual([]);
	});
});

describe("findSettingsMismatches — declared types", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: {
			topics: { type: "array", title: "Topics" },
			rate: { type: "number" },
			count: { type: "integer" },
			enabled: { type: "boolean" },
		},
	};

	test("accepts values matching their declared type", () => {
		expect(
			settingsSatisfySchema(schema, {
				topics: [],
				rate: 1.5,
				count: 3,
				enabled: false,
			}),
		).toBe(true);
	});

	test("reports a value whose type the schema changed under it", () => {
		// The shape a retired single-topic widget leaves behind: a string where
		// the surviving widget now declares an array.
		const mismatches = findSettingsMismatches(schema, {
			topics: "/odom",
		});

		expect(mismatches).toHaveLength(1);
		expect(mismatches[0]!.property).toBe("topics");
		expect(mismatches[0]!.reason).toBe("type");
		expect(mismatches[0]!.detail).toContain("array");
	});

	test("rejects a fractional value for an integer property", () => {
		expect(findSettingsMismatches(schema, { count: 2.5 })[0]!.reason).toBe(
			"type",
		);
	});

	test("accepts a whole number for an integer property", () => {
		expect(findSettingsMismatches(schema, { count: 2 })).toEqual([]);
	});

	test("does not judge a property whose contract uses a combinator", () => {
		const combinator: JsonSchema = {
			type: "object",
			properties: {
				source: {
					type: "string",
					oneOf: [{ const: "a" }, { const: "b" }],
				},
			},
		};

		expect(findSettingsMismatches(combinator, { source: 42 })).toEqual([]);
	});

	test("ignores properties the schema does not declare", () => {
		// Settings left over from a wider schema are not a reason to hide the
		// widget — the widget simply stops reading them.
		expect(settingsSatisfySchema(schema, { legacyTopic: "/old" })).toBe(
			true,
		);
	});

	test("does not judge a cleared field", () => {
		// A control reporting "cleared" as null must not read as a value the
		// schema has outgrown — that would hide every widget with an emptied
		// optional field.
		expect(settingsSatisfySchema(schema, { rate: null })).toBe(true);
	});

	test("does not judge nested object contents", () => {
		const nested: JsonSchema = {
			type: "object",
			properties: {
				topic: {
					type: "object",
					properties: { name: { type: "string" } },
					required: ["name"],
				},
			},
		};

		expect(findSettingsMismatches(nested, { topic: {} })).toEqual([]);
	});
});

describe("findSettingsMismatches — enums", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: {
			mode: { type: "string", title: "Mode", enum: ["gauge", "dial"] },
		},
	};

	test("accepts a value still offered by the enum", () => {
		expect(settingsSatisfySchema(schema, { mode: "dial" })).toBe(true);
	});

	test("reports a value the widget no longer offers", () => {
		const mismatches = findSettingsMismatches(schema, { mode: "needle" });

		expect(mismatches).toHaveLength(1);
		expect(mismatches[0]!.reason).toBe("enum");
		expect(mismatches[0]!.label).toBe("Mode");
		expect(mismatches[0]!.detail).toContain('"needle"');
	});
});

describe("findSettingsMismatches — inputs it must not judge", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: { label: { type: "string" } },
		required: ["label"],
	};

	test("returns nothing when there is no schema", () => {
		expect(findSettingsMismatches(undefined, { label: 1 })).toEqual([]);
	});

	test("returns nothing when the settings are not an object", () => {
		expect(findSettingsMismatches(schema, null)).toEqual([]);
		expect(findSettingsMismatches(schema, ["label"])).toEqual([]);
	});

	test("reports each problem once per property", () => {
		const both: JsonSchema = {
			type: "object",
			properties: {
				mode: { type: "string", enum: ["a", "b"] },
			},
			required: ["mode"],
		};

		// A wrong type is reported instead of, not in addition to, an enum miss.
		expect(findSettingsMismatches(both, { mode: 7 })).toHaveLength(1);
	});
});
