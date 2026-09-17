/**
 * Detection for the two ways a saved widget can stop being renderable.
 *
 * Both are expected states, not exceptions: a workspace is persisted as
 * `{ widget_id, settings }` and outlives the build that created it. The plugin
 * that provided the type can be absent from this build, and a type that is
 * still present can have changed its schema under a config that was valid when
 * it was saved.
 *
 * Everything here is pure so the predicates can be tested directly — they are
 * the part that rots silently, because a wrong answer either hides a working
 * widget behind a card or lets a broken one render wrong numbers.
 */

import type { JsonSchema } from "@jsonforms/core";
import type { WidgetDefinition } from "../../widget-interface";
import { resolveFieldLabel } from "../../../forms/config-errors";

/**
 * Id of the placeholder definition the dashboard resolver returns when no
 * loaded plugin provides a stored `widget_id`.
 *
 * Kept here rather than in the placeholder module so {@link
 * isWidgetDefinitionMissing} stays free of JSX and testable on its own.
 */
export const WIDGET_DEFINITION_MISSING_ID = "widget-not-found";

/**
 * Whether a resolved widget definition is the missing-definition placeholder.
 *
 * The dashboard resolver (`useDashboardActions().getDefinition`) never returns
 * `null` — callers use `definition.Component` unconditionally — so the absence
 * of a definition is carried by a placeholder with a reserved id. This is the
 * single place that knowledge is encoded.
 *
 * @param definition - Definition resolved for a stored `widget_id`.
 * @returns True when no loaded plugin provides the widget type.
 */
export function isWidgetDefinitionMissing(
	definition: WidgetDefinition | null | undefined,
): boolean {
	return !definition || definition.id === WIDGET_DEFINITION_MISSING_ID;
}

/** Why one saved setting no longer satisfies the definition's schema. */
export type SettingsMismatchReason = "missing" | "type" | "enum";

/** One saved setting that the widget's current schema no longer accepts. */
export interface SettingsMismatch {
	/** Schema property key the mismatch is reported on. */
	property: string;
	/** Operator-facing label — the schema `title`, else a humanized key. */
	label: string;
	/** Which check failed. */
	reason: SettingsMismatchReason;
	/** One sentence naming what no longer fits, shown on the widget tile. */
	detail: string;
}

/** JSON Schema type names this module is willing to judge. */
const JUDGEABLE_TYPES = new Set([
	"string",
	"number",
	"integer",
	"boolean",
	"array",
	"object",
	"null",
]);

/**
 * Keywords whose presence makes a property's contract too subtle for the
 * shallow checks below. A property carrying any of them is skipped entirely
 * rather than guessed at.
 */
const COMBINATOR_KEYWORDS = ["oneOf", "anyOf", "allOf", "not", "$ref"] as const;

/** Structural view of the schema fields these checks read. */
interface PropertySchema {
	type?: unknown;
	enum?: unknown;
	default?: unknown;
	const?: unknown;
	[keyword: string]: unknown;
}

/** Structural view of an object schema. */
interface ObjectSchema {
	required?: unknown;
	properties?: Record<string, PropertySchema | undefined>;
}

/**
 * JSON Schema type name of a runtime value.
 * @param value - Value to classify.
 * @returns The JSON type name, or `null` when the value has no JSON type
 * (`undefined`, a function, a symbol, `NaN`) and must not be judged.
 */
function jsonTypeOf(value: unknown): string | null {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";

	switch (typeof value) {
		case "string":
			return "string";
		case "boolean":
			return "boolean";
		case "number":
			return Number.isFinite(value) ? "number" : null;
		case "object":
			return "object";
		default:
			return null;
	}
}

/** Whether a value is a primitive an `enum` membership test can compare. */
function isComparablePrimitive(value: unknown): boolean {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

/**
 * Normalize a schema `type` keyword to the list of names it allows.
 * @param type - Raw `type` keyword.
 * @returns The allowed type names, or `null` when the keyword is absent or not
 * something this module judges.
 */
function declaredTypes(type: unknown): string[] | null {
	const names =
		typeof type === "string"
			? [type]
			: Array.isArray(type) && type.every((t) => typeof t === "string")
				? (type as string[])
				: null;

	if (!names || names.length === 0) return null;
	return names.every((name) => JUDGEABLE_TYPES.has(name)) ? names : null;
}

/**
 * Whether a value contradicts every type its schema declares.
 * @param allowed - Declared type names.
 * @param value - Saved value.
 * @returns True only when the value is classifiable and matches none of them.
 */
function violatesDeclaredType(allowed: string[], value: unknown): boolean {
	const actual = jsonTypeOf(value);
	if (actual === null) return false;

	return !allowed.some((name) => {
		if (name === actual) return true;
		// A JSON `integer` arrives as a number; only a whole one satisfies it.
		if (name === "integer" && actual === "number") {
			return Number.isInteger(value);
		}
		return false;
	});
}

/** Whether a property schema is simple enough for the shallow checks. */
function isJudgeableProperty(property: PropertySchema): boolean {
	return !COMBINATOR_KEYWORDS.some((keyword) => keyword in property);
}

/** Render a saved value for an operator-facing sentence. */
function describeValue(value: unknown): string {
	if (typeof value === "string") return `"${value}"`;
	if (value === null) return "null";
	return String(value);
}

/** Join type names as `a`, `a or b`, `a, b or c`. */
function joinTypes(names: string[]): string {
	if (names.length <= 1) return names[0] ?? "";
	return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * Find the saved settings a widget's current schema no longer accepts.
 *
 * Deliberately shallow and conservative — a false positive hides a working
 * widget behind an unsupported-configuration card, which is worse than missing
 * a subtle incompatibility the widget itself can still report. Only three
 * checks run, all on top-level properties:
 *
 * 1. A property listed in `required` has no saved value **and** no schema
 *    `default` to stand in for one. A required property carrying a `default`
 *    is satisfiable from the definition alone, so its absence is not a defect.
 * 2. A saved value contradicts every type the property declares.
 * 3. A saved primitive is outside the property's `enum` — the shape a retired
 *    option leaves behind.
 *
 * A `null` value is exempt from checks 2 and 3: it is how a control reports a
 * cleared field, not a value the schema has outgrown.
 *
 * Properties carrying `oneOf` / `anyOf` / `allOf` / `not` / `$ref` are skipped
 * wholesale, as are nested objects and array items: their contracts are too
 * subtle to judge without a full validator, and guessing them is exactly how
 * this check would start lying.
 *
 * @param schema - Schema of the widget definition currently registered.
 * @param settings - Settings persisted with the widget instance.
 * @returns One entry per problem, in schema-declaration order; empty when the
 * saved settings still satisfy the schema as far as these checks can tell.
 */
export function findSettingsMismatches(
	schema: JsonSchema | undefined,
	settings: unknown,
): SettingsMismatch[] {
	if (!schema || typeof schema !== "object") return [];
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
		return [];
	}

	const objectSchema = schema as ObjectSchema;
	const properties = objectSchema.properties ?? {};
	const values = settings as Record<string, unknown>;
	const mismatches: SettingsMismatch[] = [];

	const required = Array.isArray(objectSchema.required)
		? objectSchema.required.filter(
				(key): key is string => typeof key === "string",
			)
		: [];

	for (const key of required) {
		if (values[key] !== undefined) continue;

		const property = properties[key];
		if (property && "default" in property) continue;

		mismatches.push({
			property: key,
			label: resolveFieldLabel(schema, [key]),
			reason: "missing",
			detail: `is required by this widget but the saved configuration has no value for it`,
		});
	}

	for (const [key, property] of Object.entries(properties)) {
		if (!property || typeof property !== "object") continue;
		if (!isJudgeableProperty(property)) continue;

		const value = values[key];
		// `null` is how a control reports "cleared", not a wrong value: judging
		// it would hide every widget with an emptied optional field behind an
		// unsupported card. A genuinely required property that is null is
		// caught by the widget's own gating, not here.
		if (value === undefined || value === null) continue;

		const allowed = declaredTypes(property.type);
		if (allowed && violatesDeclaredType(allowed, value)) {
			mismatches.push({
				property: key,
				label: resolveFieldLabel(schema, [key]),
				reason: "type",
				detail: `is saved as ${jsonTypeOf(value)} but this widget now expects ${joinTypes(allowed)}`,
			});
			continue;
		}

		const options = property.enum;
		if (
			Array.isArray(options) &&
			isComparablePrimitive(value) &&
			!options.includes(value)
		) {
			mismatches.push({
				property: key,
				label: resolveFieldLabel(schema, [key]),
				reason: "enum",
				detail: `is saved as ${describeValue(value)}, which this widget no longer offers`,
			});
		}
	}

	return mismatches;
}

/**
 * Whether the saved settings still satisfy the definition's schema.
 *
 * Convenience inverse of {@link findSettingsMismatches} for call sites that
 * only branch on it and never name the problems.
 *
 * @param schema - Schema of the widget definition currently registered.
 * @param settings - Settings persisted with the widget instance.
 * @returns True when no mismatch was found.
 */
export function settingsSatisfySchema(
	schema: JsonSchema | undefined,
	settings: unknown,
): boolean {
	return findSettingsMismatches(schema, settings).length === 0;
}
