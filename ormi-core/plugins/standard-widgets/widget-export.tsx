"use client"

import { WidgetDefinition } from '@/core/widgets/widget-interface';

import { PluginsViewerDefinition } from './widgets/misc/plugins-viewer';
import { JsonViewerDefinition } from './widgets/basic/json-viewer';
import { TreeViewerDefinition } from './widgets/basic/tree-viewer';
import { KeyboardControlDefinition } from './widgets/keyboard/cmd-vel-keyboard';
import { TimeSeriesChartDefinition } from './widgets/charts/timeseries-chart';
import { WebRtcRos2Definition } from './widgets/images/webrtc';
import { MapsBoxViewerDefinition } from './widgets/maps/maps-box-viewer';
import { IntStatusIndicatorDefinition } from './widgets/status/int-status-indicator';
import { NotAPongDefinition } from './widgets/nothing/not-a-pong';
import { IframeDefinition } from './widgets/misc/iframe';
import { LineChartDefinition } from './widgets/charts/line-chart';
import { PointsCloudDefinition } from './widgets/webgl/points-cloud-webgl';
// import { PointsCloudDefinition } from './widgets/three-d/points-cloud';

const WidgetExport = (widgets: WidgetDefinition[]) => {

    widgets.push(KeyboardControlDefinition());
    widgets.push(TimeSeriesChartDefinition());
    // widgets.push(LineChartDefinition());
    widgets.push(WebRtcRos2Definition());
    widgets.push(MapsBoxViewerDefinition());
    widgets.push(IntStatusIndicatorDefinition());
    widgets.push(NotAPongDefinition());
    widgets.push(IframeDefinition());
    widgets.push(PluginsViewerDefinition());
    widgets.push(TreeViewerDefinition());
    widgets.push(JsonViewerDefinition());
    widgets.push(PointsCloudDefinition());

    return widgets;
}

export default WidgetExport;