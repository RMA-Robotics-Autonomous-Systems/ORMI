import type { JsonSchema } from "@jsonforms/core";
import startCase from "lodash/startCase";

import {
	SUMMARY_KEYWORDS,
	type ValidationErrorLike,
} from "../../utils/field-errors";

/**
 * Validation errors, attributed to the array row they belong to.
 *
 * AGENTS.md ("Config dialogs commit only on valid input") reports errors by
 * field name, never as the raw AJV string. The list heading used to print
 * JSON Forms' aggregate error text ("is a required property is a required
 * property"), which names neither the row nor the field. Here each AJV error
 * is walked back to its row index and to the row's top-level field, so the
 * row heading can say "Topic missing" while the field itself keeps its inline
 * message.
 */

export type { ValidationErrorLike };

/** What is wrong with a field. */
export type RowIssueKind = "missing" | "incomplete" | "invalid";

/** One field of one row that fails validation. */
export interface RowIssue {
	/** Top-level property of the row; "" for a scalar row. */
	field: string;
	/** Operator-facing field name: the schema title, or the start-cased key. */
	title: string;
	/**
	 * `missing`: the field itself is absent. `incomplete`: something inside
	 * it is absent. `invalid`: present but rejected.
	 */
	kind: RowIssueKind;
}

/** A fact about the array as a whole, e.g. too few rows. */
export interface ArrayIssue {
	keyword: "minItems" | "maxItems";
	limit: number;
}

/** Precedence when one field has several errors: absent beats rejected. */
const KIND_RANK: Record<RowIssueKind, number> = {
	missing: 0,
	incomplete: 1,
	invalid: 2,
};

/**
 * Decode one JSON pointer segment (RFC 6901).
 *
 * @param segment - Encoded segment.
 * @returns Decoded segment.
 */
function decodePointerSegment(segment: string): string {
	return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Split an error's location into data path segments.
 *
 * @param error - An AJV error.
 * @returns Segments, e.g. ["topics", "0", "topic"].
 */
function errorSegments(error: ValidationErrorLike): string[] {
	if (error.instancePath !== undefined) {
		return error.instancePath
			.split("/")
			.filter((s) => s.length > 0)
			.map(decodePointerSegment);
	}
	return (error.dataPath ?? "").split(".").filter((s) => s.length > 0);
}

/**
 * Split a JSON Forms control path ("layers.0.topics") into segments.
 *
 * @param path - Dot-separated data path.
 * @returns Segments.
 */
function pathSegments(path: string): string[] {
	return path.split(".").filter((s) => s.length > 0);
}

/**
 * Operator-facing title of a row field.
 *
 * @param itemSchema - The array's item schema.
 * @param field - Property name; "" for a scalar row.
 * @returns The schema title, the start-cased key, or "Value".
 */
export function fieldTitle(
	itemSchema: JsonSchema | undefined,
	field: string,
): string {
	if (!field) return itemSchema?.title ?? "Value";
	return itemSchema?.properties?.[field]?.title ?? startCase(field);
}

/**
 * Attribute validation errors to the rows of one array.
 *
 * @param errors - All AJV errors of the form.
 * @param arrayPath - The array's JSON Forms path ("topics", "layers.0.topics").
 * @param itemSchema - The array's item schema, for field titles.
 * @returns Issues by row index, each row's fields deduplicated and ordered by
 *   first appearance. Rows without errors are absent.
 */
export function mapErrorsToRows(
	errors: readonly ValidationErrorLike[],
	arrayPath: string,
	itemSchema?: JsonSchema,
): Map<number, RowIssue[]> {
	const base = pathSegments(arrayPath);
	const byRow = new Map<number, Map<string, RowIssue>>();

	for (const error of errors) {
		if (SUMMARY_KEYWORDS.has(error.keyword)) continue;

		const segments = errorSegments(error);
		if (segments.length <= base.length) continue;
		if (!base.every((segment, i) => segments[i] === segment)) continue;

		const indexSegment = segments[base.length]!;
		if (!/^\d+$/.test(indexSegment)) continue;
		const index = Number(indexSegment);

		const rest = segments.slice(base.length + 1);
		const missing =
			error.keyword === "required" &&
			typeof error.params?.missingProperty === "string"
				? error.params.missingProperty
				: undefined;

		let field: string;
		let kind: RowIssueKind;
		if (rest.length === 0) {
			// The row itself: a missing property of the row, or a scalar row
			// that is rejected outright.
			field = missing ?? "";
			kind = missing !== undefined ? "missing" : "invalid";
		} else {
			field = rest[0]!;
			kind = missing !== undefined ? "incomplete" : "invalid";
		}

		let fields = byRow.get(index);
		if (!fields) {
			fields = new Map();
			byRow.set(index, fields);
		}
		const existing = fields.get(field);
		if (!existing || KIND_RANK[kind] < KIND_RANK[existing.kind]) {
			fields.set(field, {
				field,
				title: fieldTitle(itemSchema, field),
				kind,
			});
		}
	}

	const result = new Map<number, RowIssue[]>();
	for (const [index, fields] of byRow) {
		result.set(index, [...fields.values()]);
	}
	return result;
}

/**
 * Array-level facts: too few or too many rows.
 *
 * @param errors - All AJV errors of the form.
 * @param arrayPath - The array's JSON Forms path.
 * @returns The `minItems` / `maxItems` failures at exactly that path.
 */
export function mapErrorsToArray(
	errors: readonly ValidationErrorLike[],
	arrayPath: string,
): ArrayIssue[] {
	const base = pathSegments(arrayPath);
	const issues: ArrayIssue[] = [];
	for (const error of errors) {
		if (error.keyword !== "minItems" && error.keyword !== "maxItems") {
			continue;
		}
		const segments = errorSegments(error);
		if (
			segments.length !== base.length ||
			!base.every((segment, i) => segments[i] === segment)
		) {
			continue;
		}
		const limit = Number(error.params?.limit);
		if (Number.isFinite(limit)) {
			issues.push({ keyword: error.keyword, limit });
		}
	}
	return issues;
}

/** Word each kind is reported with. */
const KIND_WORD: Record<RowIssueKind, string> = {
	missing: "missing",
	incomplete: "incomplete",
	invalid: "invalid",
};

/**
 * One short fact for a row heading: "Topic missing", "Topic, Color missing;
 * Width invalid".
 *
 * @param issues - A row's issues.
 * @returns The summary, or "" when there are none.
 */
export function summarizeRowIssues(issues: readonly RowIssue[]): string {
	const groups: string[] = [];
	for (const kind of ["missing", "incomplete", "invalid"] as const) {
		const titles = issues
			.filter((i) => i.kind === kind)
			.map((i) => i.title);
		if (titles.length > 0) {
			groups.push(`${titles.join(", ")} ${KIND_WORD[kind]}`);
		}
	}
	return groups.join("; ");
}

/**
 * The array heading's fact for a too-short or too-long list.
 *
 * @param issue - The array-level issue.
 * @returns "Minimum 1" or "Maximum 4".
 */
export function describeArrayIssue(issue: ArrayIssue): string {
	return issue.keyword === "minItems"
		? `Minimum ${issue.limit}`
		: `Maximum ${issue.limit}`;
}
