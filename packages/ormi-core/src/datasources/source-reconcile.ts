/**
 * Pure buffer-map reconciliation for {@link LocalDataSourcesProvider}.
 *
 * Two invariants live here, both of which are invisible in a type check and
 * both of which cost an operator real data when they break:
 *
 * - **A topic's identity is its content, not its array slot.** Every widget
 *   builds the `SelectedTopics` array inline (`[data.topic]`,
 *   `data.series.map(...)`), so the array is a fresh object on every React
 *   render while describing the exact same subscription. Keying the
 *   subscription effect on that array identity made every unrelated re-render
 *   tear the wire down and rebuild it. {@link createSourcesKey} turns the array
 *   into a value that only changes when the subscription genuinely changes.
 * - **Adding or removing one topic must not disturb the others.** Rebuilding
 *   the whole map is why appending a second series to a live chart restarted
 *   the first one from zero. {@link reconcileSources} keeps the buffer of every
 *   surviving topic.
 *
 * Kept free of React so both rules can be tested directly.
 */

import {
	createTopicKey,
	isBoundTopic,
	type TopicKeyInput,
} from "@workspace/utils";

/**
 * Buffered samples for one selected topic.
 *
 * `data` and `times` are parallel arrays trimmed to the resolved buffer depth;
 * `referenceFrameId` is the frame of the most recent sample.
 */
export interface TopicBuffer {
	data: unknown[];
	times: number[];
	referenceFrameId: string;
}

/** Separator that cannot occur inside a datasource id, topic name or property path. */
const KEY_SEPARATOR = "\n";

/**
 * Create an empty buffer for a newly added topic.
 *
 * @returns A fresh, empty {@link TopicBuffer}.
 */
export const createEmptyBuffer = (): TopicBuffer => ({
	data: [],
	times: [],
	referenceFrameId: "unknown",
});

/**
 * Collapse a selected-topic list to a stable, content-addressed string.
 *
 * Built from {@link createTopicKey} — the exact key the subscription registry
 * refcounts on (`dsId::topic[::property]`) — so the effect re-runs when, and
 * only when, the set of wires it owns changes. Order is significant and
 * deliberately preserved: it is cheaper to accept a re-subscribe on a reorder
 * than to sort on every render.
 *
 * Fields that do **not** change the subscription are excluded on purpose.
 * `bufferSize` is the notable one: it only feeds the trim depth, which the
 * flush pump reads live, so a depth change must not cost the operator the
 * history already collected.
 *
 * Unbound entries — a topic slot the operator has not configured yet — are
 * dropped rather than keyed. They own no wire, so `[a, undefined]` and `[a]`
 * describe the same subscription and must produce the same key: binding the
 * second slot of a widget is what changes the key, not the slot appearing in
 * the array. The list is accepted as possibly-unbound because every caller
 * builds it straight out of widget settings, where a half-configured slot is
 * an expected state.
 *
 * @param topics - Selected topics, in the order the widget declared them.
 * @returns A key equal (by `===`) for any two equivalent topic lists.
 */
export const createSourcesKey = (
	topics: readonly (TopicKeyInput | null | undefined)[],
): string =>
	topics
		.filter(isBoundTopic)
		.map((topic) => createTopicKey(topic))
		.join(KEY_SEPARATOR);

/**
 * Reconcile the buffer map against the topics currently selected.
 *
 * Surviving topics keep their buffer object by reference, newly added topics
 * start empty, and removed topics are dropped. When the wanted set already
 * matches the map exactly the **same map instance** is returned, so a
 * re-render that passes an equal-but-new array is a true no-op — Jotai bails
 * out on `Object.is` and no consumer re-renders.
 *
 * @param previous - The current buffer map.
 * @param keys - Topic keys from {@link createTopicKey}, in declaration order.
 * @returns The reconciled map, or `previous` when nothing changed.
 */
export const reconcileSources = (
	previous: ReadonlyMap<string, TopicBuffer>,
	keys: readonly string[],
): Map<string, TopicBuffer> => {
	const wanted = new Set(keys);

	let changed = wanted.size !== previous.size;
	if (!changed) {
		for (const key of wanted) {
			if (!previous.has(key)) {
				changed = true;
				break;
			}
		}
	}
	if (!changed) return previous as Map<string, TopicBuffer>;

	const next = new Map<string, TopicBuffer>();
	for (const key of wanted) {
		next.set(key, previous.get(key) ?? createEmptyBuffer());
	}
	return next;
};

/**
 * Drop entries of a pending-update map that no longer belong to any topic.
 *
 * Mutates in place — the pending map lives in a ref and is drained by the
 * flush pump. Entries for surviving topics are deliberately kept: they are
 * samples already delivered off the wire, and clearing them wholesale on an
 * unrelated topic change loses up to one flush interval of data per topic.
 *
 * @param pending - The pending-update map to prune.
 * @param keys - Topic keys that are still selected.
 */
export const prunePendingUpdates = <T>(
	pending: Map<string, T>,
	keys: readonly string[],
): void => {
	const wanted = new Set(keys);
	for (const key of pending.keys()) {
		if (!wanted.has(key)) pending.delete(key);
	}
};
