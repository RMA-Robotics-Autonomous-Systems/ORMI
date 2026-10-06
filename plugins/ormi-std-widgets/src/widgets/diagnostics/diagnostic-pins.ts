/**
 * Pinned diagnostic statuses: pure helpers over the widget's persisted
 * `pinned` setting.
 *
 * A pin is the latch key of a status, `${sourceId}::${hardwareId}::${name}`,
 * so it survives a reload and names one status on one datasource. The list is
 * ordered: pinned rows render in the order they were pinned and never re-sort
 * by severity, which is the point of pinning one.
 */

/** Separator between the parts of a latch key. */
const KEY_SEPARATOR = "::";

/**
 * Build the latch key of a status.
 * @param sourceId - Datasource instance id.
 * @param hardwareId - `DiagnosticStatus.hardware_id` (may be empty).
 * @param name - `DiagnosticStatus.name`.
 * @returns The key identifying this status in the latch and in the pin list.
 */
export function diagnosticKey(
	sourceId: string,
	hardwareId: string,
	name: string,
): string {
	return [sourceId, hardwareId, name].join(KEY_SEPARATOR);
}

/**
 * Read the persisted pin list defensively. Stored settings outlive the build
 * that wrote them, so anything that is not a string is skipped and a
 * non-array reads as no pins. Duplicates are dropped, first occurrence wins.
 * @param value - The raw `pinned` setting.
 * @returns The ordered, de-duplicated pin keys.
 */
export function readPinned(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	for (const item of value) {
		if (typeof item === "string" && item.length > 0) seen.add(item);
	}
	return Array.from(seen);
}

/**
 * Pin an unpinned key (appended, so existing pins keep their place) or unpin a
 * pinned one.
 * @param pinned - Current pin keys.
 * @param key - Key to toggle.
 * @returns A new pin list.
 */
export function togglePin(pinned: readonly string[], key: string): string[] {
	return pinned.includes(key)
		? pinned.filter((item) => item !== key)
		: [...pinned, key];
}

/**
 * Name the status a pin refers to, for a pin that has no latched status yet
 * (after a reload, or a node that has not published). The source id is a uuid
 * and never contains the separator; a hardware id that does is the accepted
 * imprecision of a label that is only shown until the first message arrives.
 * @param key - A pin key built by {@link diagnosticKey}.
 * @returns The hardware id and status name encoded in the key.
 */
export function describePin(key: string): { hardwareId: string; name: string } {
	const [, hardwareId = "", ...rest] = key.split(KEY_SEPARATOR);
	if (rest.length === 0) return { hardwareId: "", name: hardwareId || key };
	return { hardwareId, name: rest.join(KEY_SEPARATOR) };
}
