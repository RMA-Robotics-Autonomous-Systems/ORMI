import type { TopicClaim } from "@workspace/ormi-core/widgets";

/**
 * What this plugin's widgets answer when an operator clicks a topic.
 *
 * The WebRTC viewer draws an `Image` as well as the plain one, but it needs a
 * video server reachable beside the robot and shows a "stream failed" card
 * wherever there is not one. So it is an option and not the answer: the plain
 * viewer in the standard widgets plugin claims `Image` as the destination.
 */
export const topicClaims: TopicClaim[] = [
	{
		type: "Image",
		widgetId: "webrtc-viewer-widget",
		slot: "topic",
		role: "alternative",
	},
];
