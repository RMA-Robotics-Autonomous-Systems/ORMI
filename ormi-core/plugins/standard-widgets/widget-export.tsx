"use client"

import { WidgetDefinition } from '@/core/widgets/widget-interface';

import { VerticalLayout, ControlElement } from "@jsonforms/core";

import { LocalDataSourcesProvider } from '@/core/datasources/components/local-datasource-provider';

import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from "@/core/plugins/plugins-types";

import { DatasourceTopic, SelectedTopic } from '@/core/datasources/datasource-interface';
import { AsyncTopicControlType } from '@/core/jsonforms/controls/topic-selector/topic-selector';

import { PluginViewer } from './widgets/plugins-viewer';
import { JsonViewer } from './widgets/json-viewer';
import { TreeViewer } from './widgets/tree-viewer';

import { KeyboardControlDefinition } from './widgets/keyboard/cmd-vel-keyboard';
import { TimeSeriesChartDefinition } from './widgets/charts/timeseries-chart';
import { WebGLPlotDefinition } from './widgets/charts/webgl-plot-chart';
import { WebRtcRos2Definition } from './widgets/images/webrtc';
import { MapsBoxViewerDefinition } from './widgets/maps/maps-box-viewer';
import { FileIcon, FolderTreeIcon, GlobeIcon, ListTreeIcon } from 'lucide-react';
import { IntStatusIndicatorDefinition } from './widgets/status/int-status-indicator';
import { buffer } from 'stream/consumers';

function JsonViewerExport(widgets: WidgetDefinition[]) {

    const pluginsManager = usePluginsManager();

    interface JsonViewerProps {
        title: string;
        topic: SelectedTopic;
    }


    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const topic: AsyncTopicControlType = {
        type: "TopicSelect",
        scope: "#/properties/topic",
        options: {
            asyncFunction: async () => {
                return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'GeolocationPosition');
            },
            buffer: 1,
            // "propertyType": "number"
        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, topic],
    }

    const jsonViewerWidget: WidgetDefinition = {
        id: 'json-viewer-widget',
        name: 'Json viewer',
        description: 'Display a json viewer',
        titleProp: 'title',
        icon: <FileIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                }
            },
            required: ['title', 'topic']
        },
        uischema: layout,
        data: {
            title: 'Json viewer'
        },
        Component: (data: JsonViewerProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1} >
                {/* <DynamicComponent {...data} /> */}
                <JsonViewer {...data} />
            </LocalDataSourcesProvider >
        )

    }

    widgets.push(jsonViewerWidget);

    return widgets;
}

function TreeViewerExport(widgets: WidgetDefinition[]) {

    const pluginsManager = usePluginsManager();

    interface TreeViewerProps {
        title: string;
        topic: SelectedTopic;
    }

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const topic: AsyncTopicControlType = {
        type: "TopicSelect",
        scope: "#/properties/topic",
        options: {
            asyncFunction: async () => {
                return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'number');
            },
            buffer: 1,
            // "propertyType": "number"
        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, topic],
    }

    const jsonViewerWidget: WidgetDefinition = {
        id: 'tree-viewer-widget',
        name: 'Tree viewer',
        description: 'Display a tree view of data',
        titleProp: 'title',
        icon: <ListTreeIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                }
            },
            required: ['title', 'topic']
        },
        uischema: layout,
        data: {
            title: 'Tree viewer'
        },
        Component: (data: TreeViewerProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1} >
                <TreeViewer />
            </LocalDataSourcesProvider >
        )

    }

    widgets.push(jsonViewerWidget);

    return widgets;
}

function PluginsViewerExport(widgets: WidgetDefinition[]) {

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }


    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title],
    }

    const jsonViewerWidget: WidgetDefinition = {
        id: 'plugins-viewer-widget',
        name: 'Plugins viewer',
        description: 'Display the differents filters and actions',
        titleProp: 'title',
        icon: <FolderTreeIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
            },
            required: ['title']
        },
        uischema: layout,
        data: {
            title: 'Plugins viewer'
        },
        Component: () => (
            <PluginViewer />
        )

    }

    widgets.push(jsonViewerWidget);

    return widgets;
}

function IframeExport(widgets: WidgetDefinition[]) {

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const url: ControlElement = {
        type: "Control",
        scope: "#/properties/url",
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, url],
    }

    const jsonViewerWidget: WidgetDefinition = {
        id: 'iframe-widget',
        name: 'IFrame viewer',
        description: 'Display the differents filters and actions',
        titleProp: 'title',
        icon: <GlobeIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                url: {
                    type: "string",
                    title: "Url"
                }
            },
            required: ['title']
        },
        uischema: layout,
        data: {
            title: 'Plugins viewer'
        },
        Component: (props) => (
            <div style={{ width: "100%", height: "100%" }}>
                <iframe style={{ width: "100%", height: "100%" }} src={props.url}></iframe>
            </div>
        )

    }

    widgets.push(jsonViewerWidget);

    return widgets;
}

const WidgetExport = (widgets: WidgetDefinition[]) => {

    widgets.push(KeyboardControlDefinition());
    widgets.push(TimeSeriesChartDefinition());
    widgets.push(WebGLPlotDefinition());
    widgets.push(WebRtcRos2Definition());
    widgets.push(MapsBoxViewerDefinition());
    widgets.push(IntStatusIndicatorDefinition());

    // return TreeViewerExport(JsonViewerExport(TimeSeriesChartExport(LineChartExport(widgets))));
    return IframeExport(PluginsViewerExport(TreeViewerExport(JsonViewerExport(widgets))));
}

export default WidgetExport;