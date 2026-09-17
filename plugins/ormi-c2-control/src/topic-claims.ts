import type { TopicClaim } from "@workspace/ormi-core/widgets";

/**
 * What this plugin's widgets answer when an operator clicks a topic.
 *
 * Every type here is a raw wire schema: the C2 message set has no webapp type,
 * so these topics only ever carry a `rawType` and claiming the raw name is the
 * only way they are routable at all.
 */
export const topicClaims: TopicClaim[] = [
	// One fleet view, and it is what a stream of agent feedback is for.
	{
		type: "task_msgs/msg/Feedback",
		widgetId: "c2-fleet-status-widget",
		slot: "topic",
		role: "default",
	},

	// One swarm log, likewise.
	{
		type: "c2_msgs/msg/SwarmLog",
		widgetId: "c2-swarm-log-widget",
		slot: "topic",
		role: "default",
	},

	// Mission feedback has three honest readings — the task/waypoint detail,
	// the lifecycle controls, and the map — and no basis in the message for
	// preferring one, so the click asks. Give one of them `role: "default"` the
	// day the product decides which a mission operator opens first.
	{
		type: "c2_msgs/msg/MissionFeedback",
		widgetId: "c2-mission-feedback-widget",
		slot: "topic",
		role: "alternative",
	},
	{
		type: "c2_msgs/msg/MissionFeedback",
		widgetId: "c2-mission-control-panel-widget",
		slot: "topic",
		role: "alternative",
	},
	{
		type: "c2_msgs/msg/MissionFeedback",
		widgetId: "c2-mission-map-widget",
		slot: "feedbackTopic",
		role: "alternative",
	},
];
