import type { TopicClaim } from "@workspace/ormi-core/widgets";

/**
 * What this plugin's widgets answer when an operator clicks a topic.
 *
 * Routing is **claimed, never inferred**: nothing reads a widget's `accepts`
 * list to decide where a topic goes. `dataRequirements` still answers "may this
 * widget take this topic?" for the configuration dialog and the pickers; this
 * list answers "should a click on this topic open it?", and it is the only
 * thing that does. A type absent from here and from every other plugin's list
 * resolves to an explicit "nothing claims this type" rather than to whichever
 * widget happened to declare the narrowest list.
 *
 * Read it as a table of the product's mapping. Each entry names the widget, the
 * `TopicSelect` slot the topic is written into, and one of four roles:
 * `default` (opened on a click), `alternative` (offered, never automatic),
 * `command` (publishes to the topic — offered on the commanding affordance,
 * never automatic) and `fallback` (a raw viewer, offered for any type, last).
 */
export const topicClaims: TopicClaim[] = [
	// --- number ------------------------------------------------------------
	// A stream of numbers is a line over time before it is anything else, and
	// the chart is the only widget here that accumulates: the *next* number
	// topic the operator clicks joins the chart already open instead of adding
	// a second panel. The two status indicators show one value with no history,
	// which is a deliberate choice about one signal rather than the answer to
	// "show me this".
	{
		type: "number",
		widgetId: "chart-widget-time-series",
		slot: "topics[].topic",
		role: "default",
	},
	{
		type: "number",
		widgetId: "int-status-indicator",
		slot: "topic",
		role: "alternative",
	},
	{
		type: "number",
		widgetId: "cond-status-indicator",
		slot: "topic",
		role: "alternative",
	},

	// --- boolean -----------------------------------------------------------
	// No default on purpose. Both indicators show a boolean equally well and
	// neither is the obvious reading of one, so the click asks rather than
	// picking the one that happens to be registered first.
	{
		type: "boolean",
		widgetId: "int-status-indicator",
		slot: "topic",
		role: "alternative",
	},
	{
		type: "boolean",
		widgetId: "cond-status-indicator",
		slot: "topic",
		role: "alternative",
	},

	// --- Image -------------------------------------------------------------
	// The plain viewer renders any `Image` the converters produced with nothing
	// to configure. Both raw schemas are claimed as well, because a datasource
	// that passes the message through unconverted reports only a `rawType`.
	{
		type: "Image",
		widgetId: "image-viewer-widget",
		slot: "topic",
		role: "default",
	},
	{
		type: "sensor_msgs/msg/Image",
		widgetId: "image-viewer-widget",
		slot: "topic",
		role: "default",
	},
	{
		type: "sensor_msgs/msg/CompressedImage",
		widgetId: "image-viewer-widget",
		slot: "topic",
		role: "default",
	},

	// --- vectors -----------------------------------------------------------
	// A bare vector has exactly one honest reading — its own components — and
	// the readout is the only widget whose subject that is. The flight
	// indicators accept `Vector3` so a velocity vector is not simply
	// unshowable, and claim it as an alternative rather than a destination.
	{
		type: "Vector2",
		widgetId: "vector-readout-widget",
		slot: "topic",
		role: "default",
	},
	{
		type: "Vector3",
		widgetId: "vector-readout-widget",
		slot: "topic",
		role: "default",
	},
	{
		type: "Vector4",
		widgetId: "vector-readout-widget",
		slot: "topic",
		role: "default",
	},

	// --- MapGrid -----------------------------------------------------------
	// An occupancy grid is 2D data: the dedicated viewer draws it immediately
	// with a costmap colour ramp and needs no frame chosen, while the same grid
	// in the 3D scene is a plane the operator has to navigate to.
	{
		type: "MapGrid",
		widgetId: "map-grid-viewer",
		slot: "topic",
		role: "default",
	},
	{
		type: "MapGrid",
		widgetId: "std-scene-3d",
		slot: "mapGridLayers[].topic",
		role: "alternative",
	},

	// --- PointsCloud / Path ------------------------------------------------
	// A raw cloud is unreadable without something to judge its scale and
	// orientation against, which is exactly what the 3D scene supplies (grid,
	// axes, transform tree). It is also the one destination that can take the
	// path the operator clicks next, so the following click appends to the open
	// scene instead of opening a second window on the world.
	{
		type: "PointsCloud",
		widgetId: "std-scene-3d",
		slot: "pointCloudLayers[].topic",
		role: "default",
	},
	{
		type: "Path",
		widgetId: "std-scene-3d",
		slot: "pathLayers[].topic",
		role: "default",
	},
	// The map's local layers can draw either, but every entry also needs a GPS
	// origin the operator has to choose, so they are offered and never taken.
	{
		type: "PointsCloud",
		widgetId: "map-box-viewer",
		slot: "localTopics.pathTopics[].topic",
		role: "alternative",
	},
	{
		type: "Path",
		widgetId: "map-box-viewer",
		slot: "localTopics.pathTopics[].topic",
		role: "alternative",
	},

	// --- map ---------------------------------------------------------------
	{
		type: "GeolocationPosition",
		widgetId: "map-box-viewer",
		slot: "topics[].topic",
		role: "default",
	},
	{
		type: "IMU",
		widgetId: "map-box-viewer",
		slot: "localTopics.imuTopics[].topic",
		role: "alternative",
	},

	// --- controls ----------------------------------------------------------
	// Every entry below writes to the topic. They are reachable from a topic
	// row at the same cost as a viewer, on their own amber affordance, and no
	// decision can ever return one on its own.
	{
		type: "Movement",
		widgetId: "teleop-cmd-vel-widget",
		slot: "topic",
		role: "command",
	},
	{
		type: "Pose",
		widgetId: "std-scene-3d",
		slot: "posePublisherConfig.goalTopic",
		role: "command",
	},
	{
		type: "InitialPose",
		widgetId: "std-scene-3d",
		slot: "posePublisherConfig.initialTopic",
		role: "command",
	},
	...(["number", "boolean"] as const).flatMap((type): TopicClaim[] =>
		[
			"toggle-cmd-vel-widget",
			"btn-cmd-vel-widget",
			"cycle-cmd-vel-widget",
		].map((widgetId) => ({
			type,
			widgetId,
			slot: "topic",
			role: "command" as const,
		})),
	),

	// --- raw viewers -------------------------------------------------------
	// Declared, not inferred. A slot with no `dataRequirements` used to count as
	// universal, which quietly offered any widget whose author had simply not
	// declared a type as a raw viewer for every topic in the build. Priorities
	// only order the list; a fallback is never chosen automatically.
	// Widgets that discover their own topics: no slot, because there is nothing
	// to bind. Both poll for every topic of their type across every datasource
	// and merge them into one view, so opening one for a clicked topic is
	// honest — and a second copy would show exactly the same thing.
	{
		type: "DiagnosticArray",
		widgetId: "diagnostics-widget",
		role: "alternative",
	},
	{
		type: "diagnostic_msgs/msg/DiagnosticArray",
		widgetId: "diagnostics-widget",
		role: "alternative",
	},
	// `default`: nothing else claims a battery, and unlike the diagnostics
	// panel there is no second reading of the type to choose between.
	{
		type: "BatteryState",
		widgetId: "battery-state-widget",
		role: "default",
	},
	{
		type: "sensor_msgs/msg/BatteryState",
		widgetId: "battery-state-widget",
		role: "default",
	},

	{
		type: "*",
		widgetId: "tree-viewer-widget",
		slot: "topic",
		role: "fallback",
		priority: 10,
	},
	{
		type: "*",
		widgetId: "json-viewer-widget",
		slot: "topic",
		role: "fallback",
		priority: 20,
	},
	{
		type: "*",
		widgetId: "json-List-widget",
		slot: "topic",
		role: "fallback",
		priority: 30,
	},
];
