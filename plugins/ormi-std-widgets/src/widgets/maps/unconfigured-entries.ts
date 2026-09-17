/**
 * Detection of map entries that cannot be drawn from their stored settings.
 *
 * The map's topic lists are arrays of entries, and every entry names one or
 * more topics. A topic slot is filled one at a time, and a saved workspace can
 * carry an entry whose slots were never all filled — the topic-first router
 * writes a single topic into an array item, so it produces exactly this state
 * whenever the item declares more than one required topic.
 *
 * Such an entry used to be handed to a marker anyway, which read
 * `topic.source.id` and took the whole tile down with a `TypeError`. It is not
 * an error: it is a widget the operator has not finished configuring. This
 * module names the state so the map can say so and keep drawing everything
 * else.
 *
 * Pure and free of React so both the layers (which skip these entries) and the
 * viewer (which reports them) agree on one answer, and so the predicates can
 * be tested — they fail silently in both directions, hiding a working entry or
 * re-admitting a crashing one.
 */

import { isBoundTopic } from "@workspace/utils";

/**
 * One topic slot an entry must carry to be drawable.
 *
 * `key` is the settings property; `label` is the slot's title as the
 * configuration dialog shows it, so the operator is told which field to fill
 * in the words they will read there.
 */
export interface EntryTopicSlot {
	/** Settings property holding the topic. */
	key: string;
	/** Slot title as shown in the widget's configuration dialog. */
	label: string;
}

/**
 * Topic slots a GPS entry needs. Its own coordinates are the whole entry; the
 * heatmap weighting channel is optional and deliberately absent here.
 */
export const GPS_ENTRY_SLOTS: readonly EntryTopicSlot[] = [
	{ key: "topic", label: "Topic" },
];

/**
 * Topic slots a local-frame entry needs. Mirrors `required` on the
 * `pathTopics` / `imuTopics` item schemas: a local frame is meaningless
 * without the GPS origin it is placed against.
 */
export const LOCAL_ENTRY_SLOTS: readonly EntryTopicSlot[] = [
	{ key: "topic", label: "Topic" },
	{ key: "gpsOriginTopic", label: "GPS Origin" },
];

/**
 * A map entry, read structurally.
 *
 * Deliberately not `Record<string, unknown>`: the entry types are declared
 * interfaces without index signatures, and widening them at every call site to
 * satisfy one lookup would spread `as` casts through the layers. Slots are read
 * through {@link slotValue} instead, which keeps the cast in one place.
 */
type MapEntry = object & { name?: unknown };

/**
 * Read one settings property of an entry without knowing its declared shape.
 *
 * @param entry - Entry from one of the map's topic arrays.
 * @param key - Settings property to read.
 * @returns The stored value, or `undefined` when the property is absent.
 */
const slotValue = (entry: MapEntry | null | undefined, key: string): unknown =>
	(entry as Record<string, unknown> | null | undefined)?.[key];

/** One map entry that cannot be drawn, and what it is waiting for. */
export interface UnconfiguredMapEntry {
	/** Stable identity for a React key. */
	id: string;
	/** Settings section the entry lives in, so the operator knows where to look. */
	section: string;
	/** Operator-given name of the entry, or a positional fallback. */
	name: string;
	/** Labels of the topic slots that are still empty. */
	missing: string[];
}

/**
 * Whether every topic slot the entry needs carries a bound topic.
 *
 * @param entry - Entry from one of the map's topic arrays.
 * @param slots - Topic slots the entry must fill to be drawable.
 * @returns True when the entry can be handed to a marker.
 */
export function isEntryConfigured(
	entry: MapEntry | null | undefined,
	slots: readonly EntryTopicSlot[],
): boolean {
	if (!entry) return false;
	return slots.every((slot) => isBoundTopic(slotValue(entry, slot.key)));
}

/**
 * List the entries of one settings array that cannot be drawn yet.
 *
 * The index is part of the reported name and of the id: entries are addressed
 * by position in the configuration dialog, and an unnamed entry has nothing
 * else to be called.
 *
 * @param entries - The settings array, possibly absent.
 * @param section - Settings section title the array is shown under.
 * @param slots - Topic slots an entry of this array must fill.
 * @returns One record per entry that is still missing a topic.
 */
export function findUnconfiguredEntries(
	entries: readonly (MapEntry | null | undefined)[] | null | undefined,
	section: string,
	slots: readonly EntryTopicSlot[],
): UnconfiguredMapEntry[] {
	if (!entries || entries.length === 0) return [];

	const unconfigured: UnconfiguredMapEntry[] = [];

	entries.forEach((entry, index) => {
		if (isEntryConfigured(entry, slots)) return;

		const missing = slots
			.filter((slot) => !isBoundTopic(slotValue(entry, slot.key)))
			.map((slot) => slot.label);

		const name =
			typeof entry?.name === "string" && entry.name.trim() !== ""
				? entry.name.trim()
				: `Entry ${index + 1}`;

		unconfigured.push({
			id: `${section}:${index}`,
			section,
			name,
			missing,
		});
	});

	return unconfigured;
}
