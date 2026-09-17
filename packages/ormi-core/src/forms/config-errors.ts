import type { JsonSchema } from "@jsonforms/core";

/**
 * A validation error as produced by AJV and handed to the JsonForms `onChange`
 * callback. Declared structurally so this module carries no AJV dependency.
 */
export interface ConfigValidationError {
	/** JSON pointer to the offending value, `""` for the root object. */
	instancePath?: string;
	/** Raw AJV message, e.g. `must have required property 'topic'`. */
	message?: string;
	/** AJV keyword that failed, e.g. `required`, `minItems`. */
	keyword?: string;
	/** Keyword parameters, e.g. `{ missingProperty: "topic" }`. */
	params?: Record<string, unknown>;
}

/**
 * Validation errors of a configuration form, split by whether the operator can
 * see them on the form itself.
 */
export interface ConfigErrorSummary {
	/**
	 * Labels of the fields that carry an error. Their control renders the
	 * detail inline, so only the field name is needed to point at them.
	 */
	fields: string[];
	/**
	 * Messages for errors that resolve to no field, and therefore appear
	 * nowhere on the form.
	 */
	messages: string[];
}

/**
 * Whether the form currently holds errors that must block a commit.
 * @param errors - Errors reported by JsonForms, if any.
 * @returns True when at least one error is present.
 */
export function hasConfigErrors(
	errors: ConfigValidationError[] | null | undefined,
): boolean {
	return Array.isArray(errors) && errors.length > 0;
}

/** Decode a single JSON pointer segment (`~1` is `/`, `~0` is `~`). */
function decodePointerSegment(segment: string): string {
	return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Resolve the data path of an error, as segments.
 *
 * A `required` error is reported on the *parent* object with an empty
 * `instancePath`; the missing property name is the only thing that names the
 * field, so it is appended to the path.
 *
 * @param error - Validation error to resolve.
 * @returns Path segments, empty when the error attaches to no field.
 */
export function resolveErrorPath(error: ConfigValidationError): string[] {
	const pointer =
		typeof error.instancePath === "string" ? error.instancePath : "";

	const segments = pointer
		.split("/")
		.filter((segment) => segment.length > 0)
		.map(decodePointerSegment);

	if (error.keyword === "required") {
		const missing = error.params?.missingProperty;
		if (typeof missing === "string" && missing.length > 0) {
			segments.push(missing);
		}
	}

	return segments;
}

/** Turn a property key into an operator-facing label. */
function humanize(key: string): string {
	const spaced = key
		.replace(/[_-]+/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.trim()
		.toLowerCase();

	if (spaced.length === 0) return key;

	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Find the label a field is shown under, preferring the schema `title` the
 * control renders and falling back to a humanized property key.
 *
 * @param schema - Schema the form is rendered from.
 * @param path - Data path segments of the field.
 * @returns Field label, or an empty string when the path is empty.
 */
export function resolveFieldLabel(
	schema: JsonSchema | undefined,
	path: string[],
): string {
	if (path.length === 0) return "";

	let node: any = schema;

	for (const segment of path) {
		if (!node || typeof node !== "object") {
			node = undefined;
			break;
		}

		node = /^\d+$/.test(segment) ? node.items : node.properties?.[segment];
	}

	if (node && typeof node.title === "string" && node.title.length > 0) {
		return node.title;
	}

	// Array indices name no field; the nearest named ancestor does.
	const named = [...path].reverse().find((segment) => !/^\d+$/.test(segment));

	return named ? humanize(named) : humanize(path[path.length - 1]!);
}

/**
 * Split validation errors into the fields the form already highlights and the
 * messages that would otherwise be invisible.
 *
 * @param errors - Errors reported by JsonForms, if any.
 * @param schema - Schema the form is rendered from.
 * @returns Deduplicated field labels and unattached messages.
 */
export function summarizeConfigErrors(
	errors: ConfigValidationError[] | null | undefined,
	schema: JsonSchema | undefined,
): ConfigErrorSummary {
	const fields: string[] = [];
	const messages: string[] = [];

	for (const error of errors ?? []) {
		const path = resolveErrorPath(error);

		if (path.length === 0) {
			const message = (error.message ?? "").trim();
			if (message.length > 0 && !messages.includes(message)) {
				messages.push(message);
			}
			continue;
		}

		const label = resolveFieldLabel(schema, path);
		if (label.length > 0 && !fields.includes(label)) {
			fields.push(label);
		}
	}

	return { fields, messages };
}

/** Join labels as `a`, `a and b`, `a, b and c`. */
function joinLabels(labels: string[]): string {
	if (labels.length <= 1) return labels[0] ?? "";

	return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** End a fragment with a single full stop. */
function asSentence(text: string): string {
	const trimmed = text.trim();
	const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

	return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/**
 * Build the notice shown when a configuration dialog refuses to commit.
 *
 * Errors that a control renders inline are only *named* here, so the operator
 * is pointed at the field instead of reading a duplicate of what the field
 * already says. Errors that attach to no field are spelled out, because the
 * notice is the only place they appear.
 *
 * @param summary - Summary produced by `summarizeConfigErrors`.
 * @returns Notice text, or null when there is nothing to report.
 */
export function formatConfigErrorNotice(
	summary: ConfigErrorSummary,
): string | null {
	const parts: string[] = [];

	if (summary.fields.length > 0) {
		parts.push(asSentence(`Check ${joinLabels(summary.fields)}`));
	}

	for (const message of summary.messages) {
		parts.push(asSentence(message));
	}

	if (parts.length === 0) return null;

	return ["This configuration is incomplete.", ...parts].join(" ");
}
