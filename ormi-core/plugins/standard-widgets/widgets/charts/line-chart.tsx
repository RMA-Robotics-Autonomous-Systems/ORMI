"use client"

import 'chartjs-adapter-date-fns';
import { getColorsFromString, getTransparentColorString } from '@/core/utils/Colors';
import { toast } from '@/hooks/use-toast';
import Chart, { ChartConfiguration } from 'chart.js/auto';
import { useEffect, useRef } from 'react';
import { DatasourceTopic, SelectedTopic } from '@/core/datasources/datasource-interface';
import { ControlElement, VerticalLayout } from '@jsonforms/core';
import { PluginsHooks } from '@/core/plugins/plugins-types';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { AsyncTopicControlType } from '@/core/jsonforms/controls/topic-selector/topic-selector';
import { LocalDataSourcesProvider } from '@/core/datasources/components/local-datasource-provider';
import { WidgetDefinition } from '@/core/widgets/widget-interface';

interface TimeSeriesProps {
    title: string;
    timeHistory: number;
    updateFrequency: number;
    topics: {
        topic: SelectedTopic;
        color: string;
        fill: boolean;
    }[]
}

/*
    Component that implements Chart.js to render a line chart.
*/
function LineChart(props: TimeSeriesProps) {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart>();

    const sources = new Map<string, { data: number[], times: number[] }>();

    // mount and unmount the chart
    useEffect(() => {

        if (!canvasRef.current) {
            return;
        }

        if (!props.topics) {
            return;
        }

        const config: ChartConfiguration<'line'> = {
            type: 'line',
            data: {
                datasets: []
            },
            options: {
                animation: false,
                responsive: true,
                spanGaps: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'millisecond',
                        },
                        min: Date.now() - props.timeHistory * 1000,
                        max: Date.now(),
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            source: 'auto',
                            autoSkip: true,
                            maxTicksLimit: 10,
                        }
                    }
                },
                plugins: {
                    title: {
                        display: false,
                    },
                    legend: {
                        display: true,
                    }
                }
            },
        };

        // load datasets from props.topics
        for (const topicInfo of props.topics) {
            const data: number[] = [];

            const source = sources.get(topicInfo.topic.topic);
            const title = topicInfo.topic.topic;

            if (!source) {
                toast({
                    title: 'Error',
                    description: `Data source ${topicInfo.topic.topic} not found`,
                    variant: 'destructive',
                })
                continue;
            }

            data.push(...source.data);

            config.data.datasets.push({
                label: title,
                data: data,
                fill: topicInfo.fill || false,
                backgroundColor: getTransparentColorString(topicInfo.color || getColorsFromString(title), 0.4),
                borderColor: topicInfo.color || getColorsFromString(title),
                normalized: true,
                tension: 0
            });
        }


        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            chartRef.current = new Chart(ctx, config);
        }

        const interval = setInterval(() => {
            updateChart();
        }, 32);

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
            clearInterval(interval);
        }
    }, []);

    const updateChart = () => {
        if (!chartRef.current) {
            return;
        }

        const spanOfTime = props.timeHistory || 10; // keep n seconds of data, default 10


        // currentTime is the biggest timestamp in the data sources
        const currentTime = Date.now();

        // update datasets without creating new ones
        for (const dataset of chartRef.current.data.datasets) {
            if (dataset.label) {
                const source = sources.get(dataset.label);
                if (source) {

                    const filteredData = source.data.filter((value, index) => {
                        return (source.times[index]) > currentTime - spanOfTime * 1000;
                    });
                    const filteredTimes = source.times.filter((value, index) => {
                        return (value) > currentTime - spanOfTime * 1000;
                    });

                    const newData = filteredData.map((value, index) => {
                        return {
                            x: filteredTimes[index],
                            y: value
                        }
                    });


                    dataset.data = newData;
                }
            }
        }

        // Set the min and max for the x-axis to create a fixed time scale
        if (chartRef.current.options.scales && chartRef.current.options.scales.x) {
            chartRef.current.options.scales.x.min = currentTime - spanOfTime * 1000;
            chartRef.current.options.scales.x.max = currentTime;
        }

        chartRef.current.update();
        // chartRef.current.resize();
    }

    return (
        <canvas ref={canvasRef} />
    )
}

export function LineChartDefinition() {

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
                return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, []);
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
                type: "Group",
                elements: [topic, color, fill]
            }

        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, timeHistory, updateFrequency, topics],
    }

    return {
        id: 'chart-js-line-chart',
        name: 'Line chart',
        description: 'Display a line chart using Chart.js',
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
                        type: "object",
                        properties: {
                            topic: {
                                "type": "object",
                                "title": "Topic",
                            },
                            color: {
                                "type": "string",
                                "title": "Color",
                            },
                            fill: {
                                "type": "boolean",
                                "title": "Fill",
                                default: false,
                            }
                        },
                        "required": ["topic"]
                    }
                }
            },
        },

        uischema: layout,

        data: {
            title: 'Line chart'
        },

        Component: (data: TimeSeriesProps) => (

            <LocalDataSourcesProvider SelectedTopics={data.topics.map(t => t.topic)} buffersSize={2000} >
                <LineChart {...data} />
            </LocalDataSourcesProvider >
        )

    } as WidgetDefinition;
}