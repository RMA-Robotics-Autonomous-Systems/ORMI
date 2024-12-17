"use client";

import { WidgetDefinition } from '@/core/widgets/widget-interface';

import { VerticalLayout, ControlElement } from "@jsonforms/core";
import dynamic from 'next/dynamic';

import { Skeleton } from "@/components/ui/skeleton"
import { LocalDataSourcesProvider } from '@/core/datasources/components/local-datasource-provider';

import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from "@/core/plugins/plugins-types";

import { DatasourceTopic } from '@/core/datasources/datasource-interface';
import { AsyncTopicControlType } from '@/core/jsonforms/topic-selector/topic-selector';

import { PluginViewer } from './widgets/plugins-viewer';
import { JsonViewer } from './widgets/json-viewer';
import { TimeChartComponent } from './widgets/timeseries-chart';
import { TreeViewer } from './widgets/tree-viewer';


function LineChartExport(widgets: WidgetDefinition[]) {

    const pluginsManager = usePluginsManager();

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const timeToSpan: ControlElement = {
        type: "Control",
        scope: "#/properties/timeToSpan",
    }

    const topic: ControlElement = {
        "type": "Control",
        "scope": "#/properties/topic",
        "options": {
            "async": true,
            "asyncFunction": async () => {
                const topics = await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'number');
                return topics.map((topic) => ({
                    label: topic.topic,
                    value: topic.topic
                }));
            },
        }
    }

    const color: ControlElement = {
        "type": "Control",
        "scope": "#/properties/color",
        "options": {
            "color": true,
        }
    }

    const fill: ControlElement = {
        "type": "Control",
        "scope": "#/properties/fill",
    }

    // array of topics
    const topics: ControlElement = {
        type: "Control",
        scope: "#/properties/topics",
        options: {
            detail: {
                type: "VerticalLayout",
                elements: [topic, color, fill]
            }
        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, timeToSpan, topics],
    }

    const DynamicComponent = dynamic(() => import('./widgets/line-chart').then(mod => mod.LineChart), {
        loading: () => <Skeleton />,
    })

    const chartWidget: WidgetDefinition = {
        id: 'chart-widget-line',
        name: 'Line chart',
        description: 'Display a line chart',
        titleProp: 'title',
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                timeToSpan: {
                    type: 'number',
                    title: 'Span of time in seconds',
                    default: 10
                },
                topics: {
                    type: 'array',
                    title: 'Topics',
                    items: {
                        "type": "object",
                        "properties": {
                            "topic": {
                                "type": "string",
                                "title": "Topic"
                            },
                            "color": {
                                "type": "string",
                                "title": "Color",
                            },
                            "fill": {
                                "type": "boolean",
                                "title": "Fill",
                                default: false
                            }
                        },
                        "required": ["topic"]
                    }
                }
            },
            required: ['title', 'topics', 'timeToSpan']
        },
        uischema: layout,
        data: {
            title: 'Chart'
        },
        Component: (data: any) => (
            <DynamicComponent {...data} />
        )

    }

    widgets.push(chartWidget);


    return widgets;
};

function TimeSeriesChartExport(widgets: WidgetDefinition[]) {

    const pluginsManager = usePluginsManager();

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const timeHistory: ControlElement = {
        type: "Control",
        scope: "#/properties/timeHistory",
    }

    const updateFrequency: ControlElement = {
        type: "Control",
        scope: "#/properties/updateFrequency",
    }

    const topic: AsyncTopicControlType = {
        "type": "TopicSelect",
        "scope": "#/properties/topic",
        "options": {
            "asyncFunction": async () => {
                return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'number');
            },
            "propertyType": "number"
        }
    }

    const color: ControlElement = {
        "type": "Control",
        "scope": "#/properties/color",
        "options": {
            "color": true,
        }
    }

    const fill: ControlElement = {
        "type": "Control",
        "scope": "#/properties/fill",
    }

    // array of topics
    const topics: ControlElement = {
        type: "Control",
        scope: "#/properties/topics",
        options: {
            detail: {
                type: "VerticalLayout",
                elements: [topic, color, fill]
            }
        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, timeHistory, updateFrequency, topics],
    }

    // const DynamicComponent = dynamic(() => import('./widgets/timeseries-chart').then(mod => mod.TimeChartComponent), {
    //     loading: () => <Skeleton />,
    // })

    const timeSeriesWidget: WidgetDefinition = {
        id: 'chart-widget-time-series',
        name: 'Time series chart',
        description: 'Display a line chart',
        titleProp: 'title',
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                timeHistory: {
                    type: 'number',
                    title: 'Time history in seconds',
                    default: 5
                },
                updateFrequency: {
                    type: 'number',
                    title: 'Update frequency in Hz',
                    default: 32
                },
                topics: {
                    type: 'array',
                    title: 'Topics',
                    items: {
                        "type": "object",
                        "properties": {
                            "topic": {
                                "type": "string",
                                "title": "Topic",
                            },
                            "color": {
                                "type": "string",
                                "title": "Color",
                            },
                            "fill": {
                                "type": "boolean",
                                "title": "Fill",
                                default: false,
                            }
                        },
                        "required": ["topic"]
                    }
                }
            },
            required: ['title', 'topics']
        },
        uischema: layout,
        data: {
            title: 'Chart'
        },
        Component: (data: any) => (
            <LocalDataSourcesProvider TopicsProps={data.topics} buffersSize={2000} >
                {/* <DynamicComponent {...data} /> */}
                <TimeChartComponent {...data} />
            </LocalDataSourcesProvider >
        )

    }

    widgets.push(timeSeriesWidget);


    return widgets;
};

function JsonViewerExport(widgets: WidgetDefinition[]) {

    const pluginsManager = usePluginsManager();

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const topic: AsyncTopicControlType = {
        "type": "TopicSelect",
        "scope": "#/properties/topic",
        "options": {
            "asyncFunction": async () => {
                return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'number');
            },
            // "propertyType": "number"
        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, topic],
    }

    // const DynamicComponent = dynamic(() => import('./widgets/json-viewer').then(mod => mod.JsonViewer), {
    //     loading: () => <Skeleton />,
    // })

    const jsonViewerWidget: WidgetDefinition = {
        id: 'json-viewer-widget',
        name: 'Json viewer',
        description: 'Display a json viewer',
        titleProp: 'title',
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'string',
                    title: 'Topic',
                }
            },
            required: ['title', 'topic']
        },
        uischema: layout,
        data: {
            title: 'Json viewer'
        },
        Component: (data: any) => (
            <LocalDataSourcesProvider TopicsProps={[data]} buffersSize={1} >
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

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const topic: AsyncTopicControlType = {
        "type": "TopicSelect",
        "scope": "#/properties/topic",
        "options": {
            "asyncFunction": async () => {
                return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'number');
            },
            // "propertyType": "number"
        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, topic],
    }

    // const DynamicComponent = dynamic(() => import('./widgets/tree-viewer').then(mod => mod.TreeViewer), {
    //     loading: () => <Skeleton />,
    // })

    const jsonViewerWidget: WidgetDefinition = {
        id: 'tree-viewer-widget',
        name: 'Tree viewer',
        description: 'Display a tree view of data',
        titleProp: 'title',
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'string',
                    title: 'Topic',
                }
            },
            required: ['title', 'topic']
        },
        uischema: layout,
        data: {
            title: 'Tree viewer'
        },
        Component: (data: any) => (
            <LocalDataSourcesProvider TopicsProps={[data]} buffersSize={1} >
                {/* <DynamicComponent {...data} /> */}
                <TreeViewer {...data} />
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


const WidgetExport = (widgets: WidgetDefinition[]) => {
    // return TreeViewerExport(JsonViewerExport(TimeSeriesChartExport(LineChartExport(widgets))));
    return PluginsViewerExport(TreeViewerExport(JsonViewerExport(TimeSeriesChartExport(widgets))));
}

export default WidgetExport;