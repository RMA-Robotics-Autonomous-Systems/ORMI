"use client";

import { PluginsViewerDefinition } from "./widgets/misc/plugins-viewer";
import { RemoteCallExplorerDefinition } from "./widgets/misc/remote-call-explorer";
import { JsonViewerDefinition } from "./widgets/basic/json-viewer";
import { TreeViewerDefinition } from "./widgets/basic/tree-viewer";
import { KeyboardControlDefinition } from "./widgets/keyboard/cmd-vel-keyboard";
import { TimeSeriesChartDefinition } from "./widgets/charts/timeseries-chart";
import { ChartEchartsWidgetDefinition } from "./widgets/charts/chart-echarts";
import { MapsBoxViewerDefinition } from "./widgets/maps/maps-box-viewer";
import { IntStatusIndicatorDefinition } from "./widgets/status/int-status-indicator";
import { NotAPongDefinition } from "./widgets/nothing/not-a-pong";
import { IframeDefinition } from "./widgets/misc/iframe";
import { CondStatusIndicatorDefinition } from "./widgets/status/cond-status-indicator";
import { JsonListDefinition } from "./widgets/basic/json-list";
import { TopicsListDefinition } from "./widgets/basic/topics-list";
import { JoypadControlsDefinition } from "./widgets/joystick/cmd-vel-joystick";
import { ToggleControlDefinition } from "./widgets/basic/toggle";
import { BtnControlDefinition } from "./widgets/basic/btn";
import { CycleControlDefinition } from "./widgets/basic/cycle";
import { TransformTreeWidgetDefinition } from "./widgets/basic/transform-tree";
import { PointsCloudDreiDefinition } from "./widgets/webgl/points-cloud-drei-definition";
import { PathViewerDefinition } from "./widgets/webgl/path-viewer";
import { Scene3DDefinition } from "./widgets/webgl/scene-3d-definition";
import { ImageViewerDefinition } from "./widgets/basic/image";
import { MapGridViewerDefinition } from "./widgets/basic/map-grid-viewer";
import { BatteryStateWidgetDefinition } from "./widgets/battery/battery-state-widget";
import { DiagnosticsWidgetDefinition } from "./widgets/diagnostics/diagnostic-widget";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";

/**
 * Register standard widget definitions.
 * @param widgets - Widget list to extend.
 * @returns Updated widget list.
 */
const WidgetExport = (widgets: WidgetDefinition<any>[]) => {
	widgets.push(KeyboardControlDefinition());
	widgets.push(JoypadControlsDefinition());
	widgets.push(TimeSeriesChartDefinition());
	widgets.push(ChartEchartsWidgetDefinition());
	widgets.push(MapsBoxViewerDefinition());
	widgets.push(IntStatusIndicatorDefinition());
	widgets.push(CondStatusIndicatorDefinition());
	widgets.push(NotAPongDefinition());
	widgets.push(IframeDefinition());
	widgets.push(PluginsViewerDefinition());
	widgets.push(RemoteCallExplorerDefinition());
	widgets.push(TreeViewerDefinition());
	widgets.push(JsonViewerDefinition());
	widgets.push(JsonListDefinition());
	widgets.push(TopicsListDefinition());
	widgets.push(ImageViewerDefinition());
	widgets.push(MapGridViewerDefinition());
	widgets.push(BatteryStateWidgetDefinition());
	widgets.push(DiagnosticsWidgetDefinition());

	// widgets.push(PointsCloudDreiDefinition());
	// widgets.push(PathViewerDefinition());
	widgets.push(Scene3DDefinition());

	widgets.push(ToggleControlDefinition());
	widgets.push(BtnControlDefinition());
	widgets.push(CycleControlDefinition());

	widgets.push(TransformTreeWidgetDefinition());

	return widgets;
};

export default WidgetExport;
