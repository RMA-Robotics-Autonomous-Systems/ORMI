import { LocalDataSourcesProvider, useLocalDataSource } from '@/core/datasources/components/local-datasource-provider';
import { DatasourceTopic, SelectedTopic } from '@/core/datasources/datasource-interface';
import { AsyncTopicControlType } from '@/core/jsonforms/controls/topic-selector/topic-selector';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '@/core/plugins/plugins-types';
import { getColorsFromString, getTransparentColorString } from '@/core/utils/Colors';
import { toast } from '@/hooks/use-toast';
import { ControlElement, VerticalLayout } from '@jsonforms/core';
import React, { useEffect, useRef } from 'react';
import { AlignedData } from 'uplot';
import UplotReact from 'uplot-react';
import 'uplot/dist/uPlot.min.css';

interface TimeSeriesSettings {
    title: string;
    timeHistory: number;
    updateFrequency: number;
    topics: {
        topic: SelectedTopic;
        color: string;
        fill: boolean;
    }[]
}

export function TimeChartComponent(props: TimeSeriesSettings) {
    const { sources } = useLocalDataSource();
    const divRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number>();
    const lastUpdateRef = useRef<number>(0);
    const dataBufferRef = useRef<Map<string, { value: number, time: number }[]>>(new Map());

    const optionsRef = useRef<uPlot.Options>({
        width: 500,
        height: 500,
        scales: {
            x: {
                time: true,
                range: [Date.now() / 1000 - 60, Date.now() / 1000],
            },
        },
        axes: [
            {
                stroke: "black",
                grid: { stroke: "#eee" },
            },
            {
                stroke: "black",
                grid: { stroke: "#eee" },
            },
        ],
        series: [{ label: 'Time' }]
    });

    const dataRef = useRef<AlignedData>([]);

    const timeSpan = props.timeHistory || 5;
    const updateFrequency = props.updateFrequency || 32;
    const updateInterval = 1000 / updateFrequency;

    // Initialize chart series only when topics change
    useEffect(() => {
        optionsRef.current.series = initializeSeries(props.topics, sources);
    }, [props.topics, sources]);

    // Handle real-time data updates
    useEffect(() => {
        const processData = (timestamp: number) => {
            if (timestamp - lastUpdateRef.current < updateInterval) {
                frameRef.current = requestAnimationFrame(processData);
                return;
            }

            lastUpdateRef.current = timestamp;
            const now = Date.now() / 1000;

            // Process incoming data
            for (const topic_props of props.topics) {
                const topic = topic_props.topic;
                const sourceId = (topic.property !== '') ?
                    topic.topic + "+" + topic.property : topic.topic;

                const source = sources.get(sourceId);
                if (!source) continue;

                const newData = source.data.map((value, index) => ({
                    value,
                    time: source.times[index] / 1000
                })).filter(d => d.time > now - timeSpan);

                dataBufferRef.current.set(sourceId, newData);
            }

            // Update chart data
            const timeSet = new Set<number>();
            dataBufferRef.current.forEach(data => {
                data.forEach(point => timeSet.add(point.time));
            });

            const timeArray = Array.from(timeSet).sort();
            const newData: AlignedData = [timeArray];

            props.topics.forEach((topic_props) => {
                const topic = topic_props.topic;
                const sourceId = (topic.property !== '') ?
                    topic.topic + "+" + topic.property : topic.topic;
                const topicData = dataBufferRef.current.get(sourceId);

                const values = timeArray.map(time => {
                    const point = topicData?.find(d => d.time === time);
                    return point?.value ?? null;
                });
                newData.push(values);
            });

            dataRef.current = newData;

            // Update chart dimensions and time range
            if (divRef.current) {
                optionsRef.current = {
                    ...optionsRef.current,
                    width: divRef.current.clientWidth,
                    height: divRef.current.clientHeight - (props.topics.length * 20),
                    scales: {
                        x: {
                            time: true,
                            range: [now - timeSpan, now],
                        },
                    },
                };
            }

            frameRef.current = requestAnimationFrame(processData);
        };

        frameRef.current = requestAnimationFrame(processData);

        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [props.topics, sources]);

    return (
        <div ref={divRef} style={{ width: "100%", height: "100%" }}>
            <UplotReact options={optionsRef.current} data={dataRef.current} />
        </div>
    );
}

// Helper functions
function initializeSeries(topics: { topic: SelectedTopic, color: string, fill: boolean }[], sources: Map<string, any>): uPlot.Series[] {
    const series: uPlot.Series[] = [{ label: 'Time' }];
    const notFoundTopics: string[] = [];

    topics.forEach(topic_props => {
        const topic: SelectedTopic = topic_props.topic;

        const sourceId = (topic.property !== '') ?
            topic.topic + "+" + topic.property : topic.topic;

        if (!sources.get(sourceId)) {
            notFoundTopics.push(topic.topic);
            return;
        }

        const fill = (topic_props.fill || false) ?
            getTransparentColorString(
                topic_props.color || getColorsFromString(topic.topic),
                0.4
            ) : undefined;

        const props_label = topic.property !== '' ?
            topic.topic + "." + topic.property.replaceAll("-", ".") : topic.topic;

        series.push({
            label: props_label,
            stroke: topic_props.color || getColorsFromString(sourceId),
            width: 2,
            spanGaps: true,
            fill,
        });
    });

    if (notFoundTopics.length > 0) {
        showErrorToast(notFoundTopics);
    }

    return series;
}

function showErrorToast(notFoundTopics: string[]) {
    toast({
        title: 'Error',
        description: (
            <div>
                <p>Some topics were not found:</p>
                <ul>
                    {notFoundTopics.map(topic => <li key={topic}>{topic}</li>)}
                </ul>
            </div>
        ),
        variant: 'destructive'
    });
}


export function TimeSeriesChartDefinition() {
    const pluginsManager = usePluginsManager();

    interface TimeSeriesSettings {
        title: string;
        timeHistory: number;
        updateFrequency: number;
        topics: {
            topic: SelectedTopic;
            color: string;
            fill: boolean;
        }[]
    }

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
            required: ['title', 'topics']
        },
        uischema: layout,
        data: {
            title: 'Chart'
        },
        Component: (data: TimeSeriesSettings) => (

            <LocalDataSourcesProvider SelectedTopics={data.topics.map(t => t.topic)} buffersSize={2000} >
                <TimeChartComponent {...data} />
            </LocalDataSourcesProvider >
        )

    }
};