import { PluginsHooks, Plugin } from "@workspace/ormi-plugins";
import WidgetExport from "./widget-export";
import PathLocalMarker from "./widgets/maps/marker-path-local";
import PointCloudLocalMarker from "./widgets/maps/marker-pointcloud-local";
import { LocalTopicVisualizer } from "./widgets/maps/local-topic-visualizer-types";

class PluginA extends Plugin {
  constructor() {
    super();

    this.name = "STD Widgets";
    this.description = "Standart widgets collection.";
    this.version = "1.0.0";
    this.author = "Lbcqu Florian";
    this.email = "florian.lebecque@mil.be";

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
          description: "Visualizes ROS2 nav_msgs/Path in local coordinates",
        });

        // Register PointCloud visualizer
        visualizers.set("pointcloud", {
          component: PointCloudLocalMarker,
          accepts: ["PointsCloud"],
          name: "Point Cloud Visualization",
          description:
            "Visualizes ROS2 sensor_msgs/PointCloud2 in local coordinates using Three.js",
        });

        return visualizers;
      },
    };

    this.addFilter(PluginsHooks.MAP_LOCAL_VISUALIZERS, localVisualizersFilter);
  }
}

export default PluginA;
