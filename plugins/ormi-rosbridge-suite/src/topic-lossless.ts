/**
 * Lossless queue-mode decision for a rosbridge topic, kept pure so it can be
 * unit tested without roslib or a React tree.
 */

/**
 * Raw ROS types whose messages must never be dropped by last-wins coalescing,
 * so their topics use the lossless queue mode:
 * - `tf2_msgs/msg/TFMessage`: deltas — different frame pairs arrive in
 *   different messages.
 * - `diagnostic_msgs/msg/DiagnosticArray`: a shared `/diagnostics` topic is
 *   multi-publisher — many nodes (including low-Hz ones) interleave messages
 *   that each carry only that node's statuses.
 *
 * Both are low-rate, so lossless decode cost is negligible. Configured
 * transform-tree topics are handled separately (they are keyed by topic name,
 * not raw type).
 */
export const isLosslessRawType = (rawType: string): boolean =>
	rawType === "tf2_msgs/msg/TFMessage" ||
	rawType === "diagnostic_msgs/msg/DiagnosticArray";

/**
 * Whether a topic's wire must use the lossless coalescer queue.
 *
 * The datasource classifies what it knows (TF / DiagnosticArray raw types and
 * the configured transform-tree topics); a consumer's own declaration
 * (`DatasourceTopic.lossless` on a live subscribe) is OR'd in, because only the
 * subscriber knows whether it observes a state or accumulates a series.
 *
 * @param topicName Topic name.
 * @param rawType Raw ROS message type.
 * @param transformTreeTopics Configured transform-tree topic names.
 * @param consumerLossless Topic names a live consumer asked to receive
 *   losslessly (the OR across live intents; dropped with the last one).
 */
export function isLosslessTopic(
	topicName: string,
	rawType: string,
	transformTreeTopics: readonly string[] | undefined,
	consumerLossless: ReadonlySet<string>,
): boolean {
	return (
		isLosslessRawType(rawType) ||
		(transformTreeTopics ?? []).includes(topicName) ||
		consumerLossless.has(topicName)
	);
}
