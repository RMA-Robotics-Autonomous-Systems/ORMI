/**
 * Whether a topic is published with transient-local ("latched") durability.
 *
 * Currently the `/tf_static` family. Used to decide static-vs-dynamic transforms and which
 * topics warrant a latched-replay cache. Durability itself is negotiated by the ROS bridge —
 * neither the Foxglove ws-protocol nor ROSLIB exposes a client-side QoS knob — so this is a
 * topic-name heuristic, not a wire-level guarantee.
 *
 * @param topic - Topic name (e.g. `"/tf_static"`, `"/robot1/tf_static"`).
 * @returns True if the topic is treated as latched/transient-local.
 */
export function isTransientLocalTopic(topic: string): boolean {
	return topic === "/tf_static" || topic.endsWith("/tf_static");
}
