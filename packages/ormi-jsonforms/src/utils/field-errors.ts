import { useJsonForms } from "@jsonforms/react";
import { errorAt, JsonSchema } from "@jsonforms/core";

/**
 * Validation errors as short facts under a field.
 *
 * JSON Forms hands a control its errors as one string of AJV messages
 * ("is a required property", "must be >= 0", "must be equal to one of the
 * allowed values"), which is validator vocabulary: an operator reads it as the
 * dashboard being broken. Every shadcn control prints {@link describeFieldError}
 * instead, built from the structured error (keyword + params), never by
 * rewriting AJV's English, so a wording change upstream cannot leak through.
 */

/** The subset of an AJV `ErrorObject` the mappers read. */
export interface ValidationErrorLike {
	/** JSON pointer to the failing value: "/topics/0/topic". */
	instancePath?: string;
	/** Legacy AJV v6 name for `instancePath`, dot-separated. */
	dataPath?: string;
	/** AJV keyword: "required", "type", "minimum"… */
	keyword: string;
	/** Keyword parameters: `missingProperty`, `limit`, `type`, `format`… */
	params?: Record<string, unknown>;
}

/**
 * Combinator keywords whose failure only summarises errors AJV reports
 * separately at the real location. Shared with the array list's row mapping.
 */
export const SUMMARY_KEYWORDS: ReadonlySet<string> = new Set([
	"if",
	"anyOf",
	"oneOf",
	"allOf",
	"additionalProperties",
]);

/** The fact shown when an error carries nothing more specific. */
export const GENERIC_FIELD_ERROR = "Invalid value";

/** How a JSON type is named to an operator. */
const TYPE_FACT: Record<string, string> = {
	number: "Must be a number",
	integer: "Must be a whole number",
	string: "Must be text",
	boolean: "Must be on or off",
	array: "Must be a list",
	object: "Required",
	null: "Must be empty",
};

/** How a string format is named to an operator. */
const FORMAT_NAME: Record<string, string> = {
	uri: "URL",
	"uri-reference": "URL",
	url: "URL",
	email: "email address",
	date: "date",
	"date-time": "date and time",
	time: "time",
	ipv4: "IPv4 address",
	ipv6: "IPv6 address",
	hostname: "host name",
	uuid: "UUID",
};

/**
 * A numeric keyword parameter.
 *
 * @param params - AJV params.
 * @param key - Parameter name.
 * @returns The number, or undefined.
 */
function numberParam(
	params: Record<string, unknown> | undefined,
	key: string,
): number | undefined {
	const value = params?.[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

/**
 * Describe one AJV error as a short fact about the field it belongs to.
 *
 * @param error - A structured validation error.
 * @returns "Required", "Must be at least 0", "Choose one of the options"…, or
 *   undefined for a combinator summary that is reported elsewhere.
 */
export function describeFieldError(
	error: ValidationErrorLike,
): string | undefined {
	const { keyword, params } = error;
	switch (keyword) {
		case "required":
			return "Required";
		case "minimum": {
			const limit = numberParam(params, "limit");
			return limit === undefined
				? GENERIC_FIELD_ERROR
				: `Must be at least ${limit}`;
		}
		case "exclusiveMinimum": {
			const limit = numberParam(params, "limit");
			return limit === undefined
				? GENERIC_FIELD_ERROR
				: `Must be more than ${limit}`;
		}
		case "maximum": {
			const limit = numberParam(params, "limit");
			return limit === undefined
				? GENERIC_FIELD_ERROR
				: `Must be at most ${limit}`;
		}
		case "exclusiveMaximum": {
			const limit = numberParam(params, "limit");
			return limit === undefined
				? GENERIC_FIELD_ERROR
				: `Must be less than ${limit}`;
		}
		case "multipleOf": {
			const step = numberParam(params, "multipleOf");
			return step === undefined
				? GENERIC_FIELD_ERROR
				: `Must be a multiple of ${step}`;
		}
		case "type": {
			const raw = params?.type;
			const first = Array.isArray(raw) ? raw[0] : raw;
			return (
				(typeof first === "string" ? TYPE_FACT[first] : undefined) ??
				GENERIC_FIELD_ERROR
			);
		}
		case "enum":
		case "const":
		case "oneOf":
		case "anyOf":
			// A oneOf / anyOf error only reaches a control when its schema is
			// a oneOf-of-consts enum (JSON Forms filters the rest), so it is a
			// choice among options too.
			return "Choose one of the options";
		case "minLength": {
			const limit = numberParam(params, "limit");
			if (limit === undefined) return GENERIC_FIELD_ERROR;
			return limit <= 1 ? "Required" : `At least ${limit} characters`;
		}
		case "maxLength": {
			const limit = numberParam(params, "limit");
			return limit === undefined
				? GENERIC_FIELD_ERROR
				: `At most ${limit} characters`;
		}
		case "pattern":
			return "Invalid format";
		case "format": {
			const format = params?.format;
			const name =
				typeof format === "string" ? FORMAT_NAME[format] : undefined;
			return name ? `Must be a valid ${name}` : "Invalid format";
		}
		case "minItems": {
			const limit = numberParam(params, "limit");
			return limit === undefined
				? GENERIC_FIELD_ERROR
				: `At least ${limit}`;
		}
		case "maxItems": {
			const limit = numberParam(params, "limit");
			return limit === undefined
				? GENERIC_FIELD_ERROR
				: `At most ${limit}`;
		}
		case "uniqueItems":
			return "Values must be unique";
		default:
			return SUMMARY_KEYWORDS.has(keyword)
				? undefined
				: GENERIC_FIELD_ERROR;
	}
}

/**
 * Describe all errors of one field: each fact once, in order, as sentences.
 *
 * @param errors - The field's structured errors.
 * @returns "Required", "Must be a number. Must be at least 0", or "" when
 *   there is nothing to show.
 */
export function describeFieldErrors(
	errors: readonly ValidationErrorLike[],
): string {
	const facts: string[] = [];
	for (const error of errors) {
		const fact = describeFieldError(error);
		if (fact && !facts.includes(fact)) facts.push(fact);
	}
	return facts.join(". ");
}

/** Inputs to {@link useFieldErrorText}: what every control already has. */
export interface FieldErrorInputs {
	/** The control's data path. */
	path: string;
	/** The control's resolved schema. */
	schema: JsonSchema;
	/** JSON Forms' own error string, used only to decide there is an error. */
	errors: string;
}

/**
 * The error text a control prints under itself.
 *
 * Reads the structured errors JSON Forms attributed to this control (the same
 * `errorAt` query that produced `errors`, so validation mode and additional
 * errors are honoured) and describes them. When JSON Forms reports an error
 * this cannot attribute, the field still reads as invalid, generically.
 *
 * @param inputs - The control's path, schema and error string.
 * @returns The fact(s) to print, or "" when the field is valid.
 */
export function useFieldErrorText({
	path,
	schema,
	errors,
}: FieldErrorInputs): string {
	const core = useJsonForms().core;
	if (!errors) return "";
	const structured = core
		? (errorAt(path, schema)(core) as ValidationErrorLike[])
		: [];
	return describeFieldErrors(structured) || GENERIC_FIELD_ERROR;
}
