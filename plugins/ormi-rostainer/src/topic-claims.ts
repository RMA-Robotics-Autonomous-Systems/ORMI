import type { TopicClaim } from "@workspace/ormi-core/widgets";

/**
 * What this plugin's widget answers when an operator clicks a topic.
 *
 * One claim, both spellings of the same message: this plugin ships no
 * datasource of its own, so the topic arrives through Foxglove or ROSBridge —
 * one of which converts the schema to the `DiagnosticArray` webapp type while a
 * datasource that passes the message through unconverted reports only the wire
 * schema.
 *
 * `alternative`, never `default`. This panel reads one specific
 * `DiagnosticArray` — the one ROSTainer publishes about Docker containers —
 * but the type cannot say that: `/diagnostics` from any ROS node is the same
 * message. Claiming it as the default meant a generic diagnostics topic opened
 * a container manager. The standard diagnostics panel claims the type too, and
 * with both offered the operator answers a question the type genuinely does not.
 */
export const topicClaims: TopicClaim[] = [
	{
		type: "DiagnosticArray",
		widgetId: "rostainer-status-widget",
		slot: "topic",
		role: "alternative",
	},
	{
		type: "diagnostic_msgs/msg/DiagnosticArray",
		widgetId: "rostainer-status-widget",
		slot: "topic",
		role: "alternative",
	},
];
