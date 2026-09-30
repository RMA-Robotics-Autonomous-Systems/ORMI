import type { JsonSchema } from "@jsonforms/core";

/**
 * The heading of one row in an array list.
 *
 * Rows must be told apart at a glance with every row collapsed, so the heading
 * is whatever actually distinguishes this row, in this order:
 *
 * 1. the property the uischema names in `elementLabelProp`, when set;
 * 2. the row's own `name`, `label` or `title`;
 * 3. the topic the row is bound to (`/imu` or `/odom → pose.position.x`);
 * 4. an indexed fallback named after the array: "Series 2".
 *
 * A name equal to the property's schema `default` does not count for 2: every
 * freshly added row carries it, so it names nothing. A declared
 * `elementLabelProp` counts even at its default, because the author stated
 * that this property is what tells rows apart (a teleop axis bound to
 * `linear.x` is exactly that, default or not). What never happens is picking
 * an arbitrary first property, which made every new teleop axis read
 * "linear.x" with nothing declaring it. Per the names-derive-from-topic rule, binding a topic
 * replaces a placeholder name anyway, so a row that still shows its fallback
 * is one nobody has configured yet.
 */

/** Properties that hold an operator-facing name, in precedence order. */
export const NAME_PROPERTIES = ["name", "label", "title"] as const;

/** Inputs to {@link deriveRowTitle}. */
export interface RowTitleInput {
	/** The row's data. */
	item: unknown;
	/** The array's item schema. */
	itemSchema?: JsonSchema;
	/** Zero-based row index. */
	index: number;
	/** Singular title-case noun for the fallback: "Series". */
	noun: string;
	/** uischema `elementLabelProp`, when the author declared one. */
	labelProp?: string;
}

/**
 * Whether a value is a plain object (not an array, not null).
 *
 * @param value - Anything.
 * @returns True for a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A value's text when it can stand as a heading: a non-blank string or a
 * finite number.
 *
 * @param value - Candidate value.
 * @returns Trimmed text, or undefined.
 */
function asHeadingText(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	return undefined;
}

/**
 * Read a property as heading text unless it still holds its schema default.
 *
 * @param item - The row object.
 * @param itemSchema - The row's schema.
 * @param prop - Property name.
 * @returns Heading text, or undefined when absent, blank or the default.
 */
function distinctiveValue(
	item: Record<string, unknown>,
	itemSchema: JsonSchema | undefined,
	prop: string,
): string | undefined {
	const text = asHeadingText(item[prop]);
	if (text === undefined) return undefined;
	const fallback = asHeadingText(itemSchema?.properties?.[prop]?.default);
	return text === fallback ? undefined : text;
}

/**
 * Text for a topic binding: the topic name, and the property when one is bound.
 *
 * Accepts the `SelectedTopic` shape a `TopicSelect` writes (`{ topic, property?
 * }`) and a bare topic string.
 *
 * @param value - A property value that may be a topic binding.
 * @returns "/odom → pose.position.x", "/imu", or undefined.
 */
export function describeTopicBinding(value: unknown): string | undefined {
	if (typeof value === "string") return asHeadingText(value);
	if (!isRecord(value)) return undefined;
	const topic = asHeadingText(value.topic);
	if (typeof value.topic !== "string" || topic === undefined)
		return undefined;
	const property = asHeadingText(value.property);
	return property ? `${topic} → ${property}` : topic;
}

/**
 * The topic a row is bound to, if any.
 *
 * Looks at the row's `topic` property first (either a binding object or a
 * string), then at the row itself when the row *is* a binding, then at any
 * other property holding a binding object.
 *
 * @param item - The row object.
 * @returns Binding text, or undefined.
 */
export function findRowTopic(
	item: Record<string, unknown>,
): string | undefined {
	const direct = describeTopicBinding(item.topic);
	if (direct) return direct;

	for (const [key, value] of Object.entries(item)) {
		if (key === "topic" || !isRecord(value)) continue;
		const nested = describeTopicBinding(value);
		if (nested) return nested;
	}
	return undefined;
}

/**
 * The indexed fallback heading: "Series 2".
 *
 * @param noun - Singular title-case noun.
 * @param index - Zero-based row index.
 * @returns The fallback.
 */
export function fallbackRowTitle(noun: string, index: number): string {
	return `${noun} ${index + 1}`;
}

/**
 * Derive the heading of one array row. Never empty.
 *
 * @param input - The row, its schema, its index and the array's noun.
 * @returns The heading text.
 */
export function deriveRowTitle({
	item,
	itemSchema,
	index,
	noun,
	labelProp,
}: RowTitleInput): string {
	if (!isRecord(item)) {
		return asHeadingText(item) ?? fallbackRowTitle(noun, index);
	}

	if (labelProp) {
		const declared = asHeadingText(item[labelProp]);
		if (declared) return declared;
	}

	for (const prop of NAME_PROPERTIES) {
		const named = distinctiveValue(item, itemSchema, prop);
		if (named) return named;
	}

	return findRowTopic(item) ?? fallbackRowTitle(noun, index);
}
