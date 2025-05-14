"use client"

import { WidgetDefinition } from 'ormi-core/widgets';

import { PluginsViewerDefinition } from './widgets/misc/plugins-viewer';
import { JsonViewerDefinition } from './widgets/basic/json-viewer';
import { TreeViewerDefinition } from './widgets/basic/tree-viewer';
import { KeyboardControlDefinition } from './widgets/keyboard/cmd-vel-keyboard';
import { TimeSeriesChartDefinition } from './widgets/charts/timeseries-chart';
import { MapsBoxViewerDefinition } from './widgets/maps/maps-box-viewer';
import { IntStatusIndicatorDefinition } from './widgets/status/int-status-indicator';
import { NotAPongDefinition } from './widgets/nothing/not-a-pong';
import { IframeDefinition } from './widgets/misc/iframe';
import { PointsCloudDefinition } from './widgets/webgl/points-cloud-webgl';
import { CondStatusIndicatorDefinition } from './widgets/status/cond-status-indicator';
import { NotAnEyeDefinition } from './widgets/nothing/not-an-eye';
import { JsonListDefinition } from './widgets/basic/json-list';
import { TopicsListDefinition } from './widgets/basic/topics-list';
import { JoypadControlsDefinition } from './widgets/joystick/cmd-vel-joystick';
import { ToggleControlDefinition } from './widgets/basic/toggle';
import { BtnControlDefinition } from './widgets/basic/btn';
import { CycleControlDefinition } from './widgets/basic/cycle';
import { TransformTreeWidgetDefinition } from './widgets/basic/transform-tree';
import { PointsCloudDreiDefinition } from './widgets/webgl/points-cloud-drei-definition';

const WidgetExport = (widgets: WidgetDefinition[]) => {

    widgets.push(KeyboardControlDefinition());
    widgets.push(JoypadControlsDefinition());
    widgets.push(TimeSeriesChartDefinition());
    widgets.push(MapsBoxViewerDefinition());
    widgets.push(IntStatusIndicatorDefinition());
    widgets.push(CondStatusIndicatorDefinition());
    widgets.push(NotAPongDefinition());
    widgets.push(NotAnEyeDefinition());
    widgets.push(IframeDefinition());
    widgets.push(PluginsViewerDefinition());
    widgets.push(TreeViewerDefinition());
    widgets.push(JsonViewerDefinition());
    widgets.push(JsonListDefinition());
    widgets.push(TopicsListDefinition());

    widgets.push(PointsCloudDefinition());
    widgets.push(PointsCloudDreiDefinition());

    widgets.push(ToggleControlDefinition());
    widgets.push(BtnControlDefinition());
    widgets.push(CycleControlDefinition());

    widgets.push(TransformTreeWidgetDefinition());

    return widgets;
}

export default WidgetExport;