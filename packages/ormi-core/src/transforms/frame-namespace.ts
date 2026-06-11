/**
 * Frame-id namespacing.
 *
 * Transform-table keys are namespaced as `${source}::${rawFrame}` so that two datasources
 * publishing the same bare frame names (e.g. two robots each with `map`/`odom`/`base_link`)
 * stay in independent trees instead of colliding on the same key. The bare name is preserved
 * on `TransformEdge.rawFrameId` for display and for resolving legacy bare references.
 */

/** Separator between the source id and the raw frame name in a namespaced key. */
export const FRAME_NS_SEP = "::";

/** Build a namespaced frame key from a source id and a raw frame name. */
export function namespaceFrame(source: string, rawFrame: string): string {
	return `${source}${FRAME_NS_SEP}${rawFrame}`;
}

/** Whether a key is namespaced (contains the separator). */
export function isNamespacedFrame(key: string): boolean {
	return key.includes(FRAME_NS_SEP);
}

/** Extract the raw frame name from a (possibly namespaced) key. */
export function frameRawName(key: string): string {
	const i = key.indexOf(FRAME_NS_SEP);
	return i === -1 ? key : key.slice(i + FRAME_NS_SEP.length);
}

/** Extract the source id from a namespaced key (empty string if not namespaced). */
export function frameSource(key: string): string {
	const i = key.indexOf(FRAME_NS_SEP);
	return i === -1 ? "" : key.slice(0, i);
}
