/**
 * Pure decision logic shared by the topic pickers.
 *
 * Two questions live here, both of which used to be answered by the operator
 * through the selection dialog and both of which the widget is better placed to
 * answer:
 *
 * - *How much history does this topic need?* — {@link deriveTopicBufferSize}
 * - *Is there only one topic this slot could possibly mean?* —
 *   {@link findSoleDirectMatch}
 *
 * Both are deliberately synchronous and side-effect free so they can be tested
 * on their own: a silently wrong answer from either is invisible in the running
 * dashboard (a chart that plots one sample, a widget bound to a plausible but
 * wrong field).
 */

import {
	DatasourceTopic,
	SelectedTopic,
} from "../../datasources/datasource-interface";
import {
	DataRequirements,
	TopicSlotRole,
} from "../../widgets/widget-interface";
import { isTopicCompatible } from "../../widgets/topic-compatibility";

/** Options a `TopicSelect` UI schema element may carry that affect buffering. */
export interface TopicBufferOptions {
	/**
	 * Explicit per-slot history depth declared by the widget author. Omitted for
	 * nearly every slot — see {@link deriveTopicBufferSize}.
	 */
	buffer?: number;
}

/**
 * Decide the `bufferSize` to persist on a newly bound topic.
 *
 * **The rule: the widget declares its own history depth, the operator never
 * does.** Every widget already passes `buffersSize` to
 * `LocalDataSourcesProvider` — a gauge passes `1`, a timeseries chart passes
 * `2000`, a diagnostics table passes `256`. The provider resolves the limit as
 * `Math.max(topic.bufferSize ?? 0, buffersSize)`, so a value persisted on the
 * topic is a *floor* — it may ask for more history than the widget declared,
 * never less. Asking for more is only ever meaningful when the widget author
 * asked for it, which is what `options.buffer` on the `TopicSelect` element
 * expresses.
 *
 * So:
 * - a positive integer `options.buffer` is honoured verbatim — the widget
 *   author overrode the depth for this one slot;
 * - anything else (absent, zero, negative, fractional, non-finite) yields
 *   `undefined`, which leaves `topic.bufferSize` unset and lets the widget's
 *   `buffersSize` govern.
 *
 * Nonsense values are rejected rather than clamped: persisting a guessed number
 * would silently cap a chart that asked for thousands of samples, and nobody
 * would notice.
 *
 * @param options - `TopicSelect` UI schema options for the slot being bound.
 * @returns The buffer size to persist, or `undefined` to defer to the widget.
 */
export const deriveTopicBufferSize = (
	options?: TopicBufferOptions,
): number | undefined => {
	const declared = options?.buffer;
	if (typeof declared !== "number") return undefined;
	if (!Number.isInteger(declared) || declared < 1) return undefined;
	return declared;
};

/**
 * Whether a topic's own type (not one of its properties) satisfies the
 * requirements.
 *
 * This is the stricter half of `analyzeTopicCompatibility`'s `directMatch`
 * flag, restated synchronously. It deliberately returns `false` when there are
 * no requirements: "any topic will do" is not a reason to pick one for the
 * operator.
 *
 * @param topic - Datasource topic.
 * @param requirements - Widget data requirements for the slot.
 * @returns True when the topic type itself is accepted.
 */
export const isDirectTypeMatch = (
	topic: DatasourceTopic,
	requirements: DataRequirements | undefined,
): boolean => {
	if (!requirements) return false;
	if (topic.type && requirements.accepts.includes(topic.type)) return true;
	if (topic.rawType && requirements.acceptsRaw?.includes(topic.rawType))
		return true;
	return false;
};

/**
 * Stable identity of a topic within the available-topics list.
 *
 * The same topic name can be published by several datasources, so identity is
 * the pair. Shared with the inline picker so both halves of the control agree
 * on what "the same topic" means.
 *
 * @param topic - Datasource topic.
 * @returns Identity key.
 */
export const topicKey = (topic: DatasourceTopic): string =>
	`${topic.topic}@${topic.source.id}`;

/**
 * Webapp type names that describe a bare scalar rather than a structure.
 *
 * The distinction matters only for unattended binding: "the one `PointsCloud`
 * on the wire" is a reasonable inference about a fleet, "the one `number` on
 * the wire" is an accident of which robots have finished enumerating.
 */
export const PRIMITIVE_TOPIC_TYPES: readonly string[] = [
	"number",
	"integer",
	"string",
	"boolean",
];

/**
 * Whether a slot's declared types are all bare scalars.
 *
 * A slot that also names a raw message type (`acceptsRaw`) is not scalar-only:
 * `sensor_msgs/msg/BatteryState` names one concrete message, which is a
 * deliberate declaration in the way `number` is not.
 *
 * @param requirements - Widget data requirements for the slot.
 * @returns True when every accepted webapp type is a primitive.
 */
export const isPrimitiveOnlySlot = (
	requirements: DataRequirements | undefined,
): boolean => {
	if (!requirements) return false;
	if (requirements.acceptsRaw?.length) return false;

	const accepts = requirements.accepts ?? [];
	if (accepts.length === 0) return false;
	return accepts.every((type) => PRIMITIVE_TOPIC_TYPES.includes(type));
};

/** The part of a `TopicSelect` slot that decides whether it may bind itself. */
export interface TopicSlotPolicy {
	/** Data requirements declared on the slot, if any. */
	requirements?: DataRequirements | undefined;
	/** Declared role; defaults to `"primary"`. */
	role?: TopicSlotRole | undefined;
}

/**
 * Whether a slot is allowed to bind a topic without the operator.
 *
 * Three refusals, each of which produced a binding that was plausible, wrong
 * and silent:
 *
 * - **no requirements** — "any topic will do" is not a reason to pick one;
 * - **a scalar-only slot** (`number`, `boolean`, `string`) — "exactly one match
 *   right now" says nothing about intent when a robot publishes hundreds of
 *   numeric topics and has not finished enumerating. The sole match is whichever
 *   arrived first, and binding it reads as a considered choice;
 * - **a `secondary` slot** — a supporting input (a heatmap's weighting channel,
 *   a local frame's GPS origin) is by definition not what the operator's intent
 *   determines, so there is no intent to infer.
 *
 * Refusing does not hide the topics: they are still offered by the picker, which
 * lowers its inline threshold for exactly these slots.
 *
 * @param slot - Requirements and role of the slot.
 * @returns True when a sole direct match may be bound unattended.
 */
export const canAutoBindSlot = (slot: TopicSlotPolicy | undefined): boolean => {
	if (!slot?.requirements) return false;
	if (slot.role === "secondary") return false;
	if (isPrimitiveOnlySlot(slot.requirements)) return false;
	return true;
};

/**
 * Find the one topic a slot can only mean, or `null` when the choice is the
 * operator's to make.
 *
 * **Auto-binding is restricted to direct type matches.**
 * `analyzeTopicCompatibility` also reports `isCompatible: true` for *property*
 * matches — an `Odometry` is "compatible" with a number slot through
 * `pose.pose.position.x` — and binding one of those automatically would plot a
 * number that is plausible and wrong, the one failure mode nobody catches. A
 * property match is still offered in the dialog; it is just never chosen on the
 * operator's behalf.
 *
 * `isTopicCompatible` is the gate for "usable at all" so there is a single
 * sanctioned compatibility path; {@link isDirectTypeMatch} then narrows it to
 * what may be bound unattended, and {@link canAutoBindSlot} decides whether
 * this slot is the kind that may bind anything unattended at all.
 *
 * Two different topics that both match directly (the same message type on two
 * robots, say) are ambiguous and yield `null`. Duplicate entries for the same
 * topic on the same source collapse to one.
 *
 * @param topics - Available topics.
 * @param requirements - Widget data requirements for the slot.
 * @param slot - Remaining slot policy; `role` defaults to `"primary"`.
 * @returns The sole directly matching topic, or `null`.
 */
export const findSoleDirectMatch = (
	topics: DatasourceTopic[],
	requirements: DataRequirements | undefined,
	slot?: Omit<TopicSlotPolicy, "requirements">,
): DatasourceTopic | null => {
	if (!canAutoBindSlot({ requirements, role: slot?.role })) return null;

	let sole: DatasourceTopic | null = null;

	for (const topic of topics) {
		if (!isTopicCompatible(topic, requirements)) continue;
		if (!isDirectTypeMatch(topic, requirements)) continue;

		if (sole === null) {
			sole = topic;
			continue;
		}
		if (topicKey(sole) === topicKey(topic)) continue;

		return null;
	}

	return sole;
};

/**
 * Build the value persisted into a widget's configuration for a bound topic.
 *
 * @param topic - Topic being bound.
 * @param property - Dot-notation property path, or `""` for the whole message.
 * @param bufferSize - Result of {@link deriveTopicBufferSize}; omitted from the
 * stored value when `undefined` so the widget's own `buffersSize` governs.
 * @returns The `SelectedTopic` to store.
 */
export const buildSelectedTopic = (
	topic: DatasourceTopic,
	property: string,
	bufferSize: number | undefined,
): SelectedTopic => ({
	topic: topic.topic,
	datasource_id: topic.datasource_id,
	source: topic.source,
	type: topic.type,
	rawType: topic.rawType,
	property,
	...(bufferSize === undefined ? {} : { bufferSize }),
});
