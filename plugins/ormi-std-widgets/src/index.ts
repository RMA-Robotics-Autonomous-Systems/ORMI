import { PluginsHooks, Plugin } from "@workspace/ormi-plugins";
import type { TopicRoutingClaims } from "@workspace/ormi-core/widgets";
import WidgetExport from "./export";
import { topicClaims } from "./topic-claims";
import PathLocalMarker from "./widgets/maps/local-components/marker-path-local";
import IMULocalMarker from "./widgets/maps/local-components/imu-local";
// import PointCloudLocalMarker from "./widgets/maps/marker-pointcloud-local";
import { LocalTopicVisualizer } from "./widgets/maps/local-topic-visualizer-types";
import { registerDefaultTopicPreviews } from "./widgets/basic/topic-previews";

/** Standard widgets plugin registration. */
class StdWidgetsPlugin extends Plugin {
	constructor() {
		super();

		this.name = "STD Widgets";
		this.description = "Standart widgets collection.";
		this.version = "1.0.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		// Live previews for the topics panel, read by core through the hook.
		this.addFilter(PluginsHooks.TOPIC_PREVIEWS, {
			id: this.name + "-topic-previews",
			priority: 10,
			filter: registerDefaultTopicPreviews,
		});

		const widgetFilter = {
			id: this.name + "-widget-export",
			priority: 10,
			filter: WidgetExport,
		};

		this.addFilter(PluginsHooks.WIDGETS_LIST, widgetFilter);
		// this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, widgetFilter);

		// Register local topic visualizers for map widget
		const localVisualizersFilter = {
			id: this.name + "-map-local-visualizers",
			priority: 100,
			filter: (visualizers: Map<string, LocalTopicVisualizer>) => {
				// Register Path visualizer
				visualizers.set("path", {
					component: PathLocalMarker,
					accepts: ["Path"],
					name: "Path Visualization",
					description:
						"Visualizes ROS2 nav_msgs/Path in local coordinates",
				});

				// Register IMU visualizer
				visualizers.set("imu", {
					component: IMULocalMarker,
					accepts: ["IMU"],
					name: "IMU Visualization",
					description:
						"Visualizes IMU orientation as arrows on GPS positions",
				});

				// Register PointCloud visualizer
				// visualizers.set("pointcloud", {
				//   component: PointCloudLocalMarker,
				//   accepts: ["PointsCloud"],
				//   name: "Point Cloud Visualization",
				//   description:
				//     "Visualizes ROS2 sensor_msgs/PointCloud2 in local coordinates using Three.js",
				// });

				return visualizers;
			},
		};

		this.addFilter(
			PluginsHooks.MAP_LOCAL_VISUALIZERS,
			localVisualizersFilter,
		);

		// Where a topic of a given type goes when the operator clicks it.
		// Stated, never inferred — see `topic-claims.ts` for the table and the
		// reasoning behind each entry.
		this.addFilter(PluginsHooks.TOPIC_ROUTING_CLAIMS, {
			id: this.name + "-topic-routing-claims",
			priority: 10,
			filter: (claims: TopicRoutingClaims) => {
				claims.push(...topicClaims);
				return claims;
			},
		});
	}
}

export default StdWidgetsPlugin;
