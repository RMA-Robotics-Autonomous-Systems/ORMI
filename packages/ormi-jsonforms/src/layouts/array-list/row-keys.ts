/**
 * Stable React keys for array rows.
 *
 * JSON Forms addresses rows by index, so an index key keeps a row's component
 * state (an open picker, a settled topic list, the expanded card) at its
 * position while its data moves away under a reorder or a removal. The list
 * keeps a parallel array of keys instead and permutes it alongside every
 * operation it performs itself. A change it did not perform (the form reset
 * from saved settings) is reconciled by length only.
 *
 * Keys are derived, never random: a new key is one past the largest, so the
 * same operation computed twice (an add handler and a render-time
 * reconciliation racing in one batch) produces the same key.
 */

/**
 * The key a newly appended row gets.
 *
 * @param keys - Current keys.
 * @returns One past the largest key, or 0.
 */
export function nextRowKey(keys: readonly number[]): number {
	let max = -1;
	for (const key of keys) if (key > max) max = key;
	return max + 1;
}

/**
 * Bring the key list to `count` entries, appending or truncating at the end.
 *
 * @param keys - Current keys.
 * @param count - Number of rows in the data.
 * @returns `keys` itself when it already fits, otherwise a new array.
 */
export function reconcileRowKeys(
	keys: readonly number[],
	count: number,
): readonly number[] {
	if (keys.length === count) return keys;
	if (keys.length > count) return keys.slice(0, count);
	const next = [...keys];
	while (next.length < count) next.push(nextRowKey(next));
	return next;
}

/**
 * Remove the key at `index`.
 *
 * @param keys - Current keys.
 * @param index - Row removed.
 * @returns New keys.
 */
export function removeRowKey(
	keys: readonly number[],
	index: number,
): readonly number[] {
	return keys.filter((_, i) => i !== index);
}

/**
 * Swap the key at `index` with its neighbour.
 *
 * @param keys - Current keys.
 * @param index - Row moved.
 * @param direction - -1 for up, +1 for down.
 * @returns New keys; `keys` itself when the move would leave the list.
 */
export function moveRowKey(
	keys: readonly number[],
	index: number,
	direction: -1 | 1,
): readonly number[] {
	const target = index + direction;
	if (index < 0 || index >= keys.length) return keys;
	if (target < 0 || target >= keys.length) return keys;
	const next = [...keys];
	[next[index], next[target]] = [next[target]!, next[index]!];
	return next;
}
