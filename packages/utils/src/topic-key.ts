/**
 * Stable string keying for datasource-selected topics.
 *
 * This module is intentionally dependency-free (no React, no `ormi-core`,
 * no `ormi-plugins`) so that both the core `LocalDataSourcesProvider`
 * consumer and the subscription registry agree on the exact same wire key
 * byte-for-byte. It was previously a private helper in
 * `packages/ormi-core/src/datasources/components/local-datasource-provider.tsx`.
 */

/**
 * Minimal structural shape of a selected topic required to compute its key.
 *
 * Mirrors the relevant fields of `SelectedTopic` from `@workspace/ormi-core`
 * without importing core, keeping `@workspace/utils` decoupled. The real
 * `SelectedTopic` satisfies this interface structurally.
 */
export interface TopicKeyInput {
	/** Datasource provider settings; only `id` is read for keying. */
	source: { id: string };
	/** Topic name. */
	topic: string;
	/** Optional sub-property path within the message (e.g. `pose.position`). */
	property?: string;
	/**
	 * Consumer needs every message, not the latest per drain tick.
	 *
	 * Mirrors `DatasourceTopic.lossless`. Deliberately **not** part of the key:
	 * the flag is a property of the consumer, the key identifies the wire, and
	 * two subscribers that disagree about it must still share one subscription
	 * rather than open two.
	 */
	lossless?: boolean;
}

/**
 * Whether a value is a topic that has actually been bound to a wire.
 *
 * A widget is configured one field at a time, so a settings object holds
 * half-bound topic slots for as long as the operator has not filled them —
 * `undefined` for a slot never touched, and an object with no `source` for one
 * the picker started. Both are **expected states**, not errors: a widget the
 * operator has not finished configuring is the normal condition of a widget
 * that was just added.
 *
 * Everything downstream of a topic (keying, subscribing, health) therefore
 * tests for boundness rather than assuming it. The predicate is deliberately
 * structural and conservative — a non-empty datasource id and a non-empty
 * topic name, which is exactly what {@link createTopicKey} needs — so that it
 * cannot disagree with the key it guards.
 *
 * @param topic - Candidate topic, possibly `undefined` or partially filled.
 * @returns True when the value carries a datasource id and a topic name.
 */
export const isBoundTopic = (topic: unknown): topic is TopicKeyInput => {
	if (!topic || typeof topic !== "object") return false;

	const candidate = topic as Partial<TopicKeyInput>;
	if (typeof candidate.topic !== "string" || candidate.topic === "")
		return false;

	const source: unknown = candidate.source;
	if (!source || typeof source !== "object") return false;

	const id: unknown = (source as { id?: unknown }).id;
	return typeof id === "string" && id !== "";
};

/**
 * Create a stable key for a selected topic, or `undefined` when it is unbound.
 *
 * Output is `dsId::topic` when no property is set, or `dsId::topic::property`
 * when a non-empty property is present. This output must remain identical to
 * the historical local implementation so registry state and the consumer's
 * buffer map stay aligned.
 *
 * **An unbound topic has no key.** A half-configured widget used to reach here
 * with `undefined` and take its whole tile down with
 * `Cannot read properties of undefined (reading 'source')` — a `TypeError`
 * thrown in a render path, which is a developer artefact an operator cannot
 * act on. The honest contract is a named absence: `undefined` is returned, it
 * can never collide with a real key (every real key contains `::`), and it
 * cannot be forged into one, so a caller must decide what an unconfigured slot
 * means for it rather than silently looking up a wrong buffer.
 *
 * The narrow overload keeps the return type `string` for the many call sites
 * whose own types already guarantee a bound topic. A value that lies to the
 * type system still gets `undefined` at runtime — never a throw.
 *
 * @param selectedTopic - Topic to key (only `source.id`, `topic`, `property` read).
 * @returns The stable topic key, or `undefined` when the topic is unbound.
 */
export function createTopicKey(selectedTopic: TopicKeyInput): string;
export function createTopicKey(
	selectedTopic: TopicKeyInput | null | undefined,
): string | undefined;
export function createTopicKey(
	selectedTopic: TopicKeyInput | null | undefined,
): string | undefined {
	if (!isBoundTopic(selectedTopic)) return undefined;

	return `${selectedTopic.source.id}::${selectedTopic.topic}${selectedTopic.property ? "::" + selectedTopic.property : ""}`;
}
