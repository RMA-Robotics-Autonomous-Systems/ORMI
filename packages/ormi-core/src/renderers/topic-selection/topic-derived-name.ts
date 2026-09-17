/**
 * Name a thing after the topic it shows.
 *
 * The routing path already does this: an array item appended by
 * `seedArrayItem` takes the topic name into its `name`/`label` property, so a
 * chart series or a map layer created by clicking a topic arrives already
 * named. The configuration dialog did not, so every layer, series and marker
 * added by hand still opened with an empty title field that the operator had to
 * fill in by hand with the name of the topic they had just picked two rows
 * above.
 *
 * This module is that rule, stated once, for the dialog path:
 *
 * - the sibling must be a plain string property named `name`, `label` or
 *   `title` in the same object as the `TopicSelect` — the same matching
 *   `seedArrayItem` does, plus `title`, because a widget's own title property
 *   and a map layer's are the two the operator actually complained about;
 * - it is only written when it is a **placeholder**: absent, blank, still the
 *   schema's `default`, or still the name derived from the topic that was bound
 *   a moment ago. Anything else was typed by the operator and is theirs;
 * - a `secondary` slot never names anything. A heatmap's weighting channel is
 *   not what the layer is, so it cannot be what the layer is called.
 *
 * "Typed" is inferred rather than recorded, on purpose. A persisted `_derived`
 * flag would outlive the build that wrote it and become one more piece of
 * stored configuration a later build has to interpret; comparing against what
 * *would* be derived is the same answer with nothing to keep in sync.
 *
 * Everything here is pure: the caller reads the form's data and schema and
 * applies whatever comes back.
 */

import { JsonSchema } from "@jsonforms/core";

import { TopicSlotRole } from "../../widgets/widget-interface";

/**
 * Sibling property names that may be filled in from a bound topic, lowercased.
 *
 * `name` and `label` mirror `seedArrayItem` so the routing path and the dialog
 * path cannot drift. `title` is the dialog path's addition: a widget's
 * `titleProp` is `title` by convention, and so is a map layer's.
 */
export const TOPIC_NAME_SIBLING_PROPERTIES: readonly string[] = [
	"name",
	"label",
	"title",
];

/**
 * The name a topic gives to whatever displays it.
 *
 * Kept as its own function so the derivation the placeholder test compares
 * against is literally the derivation that would be written.
 *
 * @param topic - Topic binding, or the topic being bound.
 * @returns The derived name, or `""` when there is nothing to derive from.
 */
export const deriveNameFromTopic = (
	topic: { topic?: string } | undefined,
): string => (typeof topic?.topic === "string" ? topic.topic.trim() : "");

/** One sibling property to write, addressed by its absolute data path. */
export interface DerivedNameUpdate {
	/** Absolute dot path into the form data, as JsonForms addresses it. */
	path: string;
	/** Value to write. */
	value: string;
}

/** Inputs to {@link resolveDerivedNameUpdates}. */
export interface ResolveDerivedNameArgs {
	/** Root JSON schema of the form (the widget or datasource settings schema). */
	rootSchema?: JsonSchema | undefined;
	/** Root data object of the form. */
	rootData?: unknown;
	/** Data path of the `TopicSelect` control, e.g. `topics.0.topic`. */
	path: string;
	/** Binding being replaced, if the slot already held one. */
	previous?: { topic?: string } | undefined;
	/** Topic being bound now. */
	next: { topic?: string } | undefined;
	/** Declared role of the slot; defaults to `"primary"`. */
	role?: TopicSlotRole | undefined;
}

/** Read a dot path out of a data object, tolerating arrays and holes. */
const readAtPath = (root: unknown, path: string): unknown => {
	if (path === "") return root;

	let node: unknown = root;
	for (const segment of path.split(".")) {
		if (node === null || typeof node !== "object") return undefined;
		node = (node as Record<string, unknown>)[segment];
	}
	return node;
};

/**
 * Resolve the schema node a *data* path addresses.
 *
 * Unlike a JsonForms scope, a data path carries array indices, so a numeric
 * segment steps through `items` rather than `properties`.
 */
const schemaAtDataPath = (
	rootSchema: JsonSchema | undefined,
	path: string,
): JsonSchema | undefined => {
	if (!rootSchema) return undefined;
	if (path === "") return rootSchema;

	let node: JsonSchema | undefined = rootSchema;
	for (const segment of path.split(".")) {
		if (!node) return undefined;

		if (/^\d+$/.test(segment)) {
			const items: JsonSchema | JsonSchema[] | undefined = node.items as
				JsonSchema | JsonSchema[] | undefined;
			node = Array.isArray(items) ? items[Number(segment)] : items;
			continue;
		}

		const properties = node.properties as
			Record<string, JsonSchema> | undefined;
		node = properties?.[segment];
	}
	return node;
};

/** Drop the last segment of a dot path. */
const parentPath = (path: string): string => {
	const index = path.lastIndexOf(".");
	return index === -1 ? "" : path.slice(0, index);
};

/** Whether a schema node is a plain free-text string property. */
const isFreeTextString = (property: JsonSchema | undefined): boolean =>
	property?.type === "string" &&
	!Array.isArray(property.enum) &&
	property.const === undefined;

/**
 * Whether the value sitting in a name property is a placeholder this build put
 * there, rather than something the operator typed.
 */
const isPlaceholder = (
	current: unknown,
	property: JsonSchema,
	previousDerived: string,
): boolean => {
	if (current === undefined || current === null) return true;
	if (typeof current !== "string") return false;
	if (current.trim() === "") return true;
	if (previousDerived !== "" && current === previousDerived) return true;
	if (typeof property.default === "string" && current === property.default) {
		return true;
	}
	return false;
};

/**
 * Work out which sibling name properties a newly bound topic should fill in.
 *
 * @param args - Form schema and data, the slot's path and role, and the topic
 * bindings before and after.
 * @returns Writes to apply, in schema order; empty when nothing may be named.
 */
export const resolveDerivedNameUpdates = (
	args: ResolveDerivedNameArgs,
): DerivedNameUpdate[] => {
	const { rootSchema, rootData, path, previous, next, role } = args;

	if (role === "secondary") return [];

	const derived = deriveNameFromTopic(next);
	if (derived === "") return [];

	const objectPath = parentPath(path);
	const objectSchema = schemaAtDataPath(rootSchema, objectPath);
	const properties = objectSchema?.properties as
		Record<string, JsonSchema> | undefined;
	if (!properties) return [];

	const values = readAtPath(rootData, objectPath);
	const object =
		values && typeof values === "object" && !Array.isArray(values)
			? (values as Record<string, unknown>)
			: undefined;

	const previousDerived = deriveNameFromTopic(previous);
	const updates: DerivedNameUpdate[] = [];

	for (const [name, property] of Object.entries(properties)) {
		if (!TOPIC_NAME_SIBLING_PROPERTIES.includes(name.toLowerCase())) {
			continue;
		}
		if (!isFreeTextString(property)) continue;

		const current = object?.[name];
		if (current === derived) continue;
		if (!isPlaceholder(current, property, previousDerived)) continue;

		updates.push({
			path: objectPath === "" ? name : `${objectPath}.${name}`,
			value: derived,
		});
	}

	return updates;
};
