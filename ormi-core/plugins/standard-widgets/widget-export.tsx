"use client";

import { WidgetDefinition } from '@/core/widgets/widget-interface';

import { VerticalLayout, ControlElement } from "@jsonforms/core";
import dynamic from 'next/dynamic';

import { Skeleton } from "@/components/ui/skeleton"
import { RandomDataSourceProvider } from "@/core/datasources/random-data-source";

const getTopicOptions = async () => {

    // return random topics after 1 second
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([
                { value: '/imu/vel/x', label: '/imu/vel/x' },
                { value: '/imu/vel/y', label: '/imu/vel/y' },
                { value: '/imu/vel/z', label: '/imu/vel/z' },
                { value: '/imu/vel/w', label: '/imu/vel/w' },
            ]);
        }, 1000);
    });

}

function LineChartExport(widgets: WidgetDefinition[]) {

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
            "asyncFunction": getTopicOptions,
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
            <RandomDataSourceProvider props={data}>
                <DynamicComponent {...data} />
            </RandomDataSourceProvider>
        )

    }

    widgets.push(chartWidget);


    return widgets;
};

function TimeSeriesChartExport(widgets: WidgetDefinition[]) {

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const topic: ControlElement = {
        "type": "Control",
        "scope": "#/properties/topic",
        "options": {
            "async": true,
            "asyncFunction": getTopicOptions,
        }
    }

    // array of topics
    const topics: ControlElement = {
        type: "Control",
        scope: "#/properties/topics",
        options: {
            detail: {
                type: "VerticalLayout",
                elements: [topic]
            }
        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, topics],
    }

    const DynamicComponent = dynamic(() => import('./widgets/timeseries-chart').then(mod => mod.TimeChartComponent), {
        loading: () => <Skeleton />,
    })

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
            <RandomDataSourceProvider props={data}>
                <DynamicComponent {...data} />
            </RandomDataSourceProvider>
        )

    }

    widgets.push(timeSeriesWidget);


    return widgets;
};

const WidgetExport = (widgets: WidgetDefinition[]) => {
    return TimeSeriesChartExport(LineChartExport(widgets));
}

export default WidgetExport;