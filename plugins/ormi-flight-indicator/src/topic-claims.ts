import type { TopicClaim } from "@workspace/ormi-core/widgets";

/**
 * What this plugin's instruments answer when an operator clicks a topic.
 *
 * Declared here rather than from whichever widget collection loses out: a claim
 * names a widget id, so the plugin that ships the widget is the only one that
 * can keep the id honest.
 */
export const topicClaims: TopicClaim[] = [
	// An IMU topic's subject is the vehicle's attitude, and the attitude
	// indicator is the one widget that shows it from the topic alone. The
	// heading indicator reads the same message for its yaw, which is a second
	// reasonable thing to do with it rather than the answer to a click.
	{ type: "IMU", widgetId: "level-widget", slot: "topic", role: "default" },
	{
		type: "IMU",
		widgetId: "heading-widget",
		slot: "topic",
		role: "alternative",
	},

	// A `Pose` carries a position as well as the single orientation these two
	// read, so neither is the destination for one — both are offered and the
	// click asks. The 3D scene claims `Pose` as a command in the std widgets
	// plugin; it is never mixed in with these.
	{
		type: "Pose",
		widgetId: "level-widget",
		slot: "topic",
		role: "alternative",
	},
	{
		type: "Pose",
		widgetId: "heading-widget",
		slot: "topic",
		role: "alternative",
	},

	// A bare quaternion off the wire is an orientation with no stated subject:
	// the level reads its roll and pitch, the heading its yaw, and nothing in
	// the message says which the operator meant.
	...[
		"geometry_msgs/msg/Quaternion",
		"geometry_msgs/msg/QuaternionStamped",
	].flatMap((type): TopicClaim[] =>
		["level-widget", "heading-widget"].map((widgetId) => ({
			type,
			widgetId,
			slot: "topic",
			role: "alternative" as const,
		})),
	),

	// The airspeed gauge genuinely reads a `Movement` — and a `Movement` is
	// usually a `/cmd_vel`, where a dial reads as a measurement of something
	// nothing measured. It is a full destination, offered beside the teleop
	// control that publishes the same topic, and never the answer on its own.
	// A `Vector3` reaches it so a velocity vector is not simply unshowable; the
	// vector readout is that type's destination.
	{
		type: "Movement",
		widgetId: "speed-widget",
		slot: "topic",
		role: "alternative",
	},
	{
		type: "Vector3",
		widgetId: "speed-widget",
		slot: "topic",
		role: "alternative",
	},
];
