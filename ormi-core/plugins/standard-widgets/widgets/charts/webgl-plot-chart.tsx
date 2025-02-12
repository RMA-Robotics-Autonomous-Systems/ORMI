import { LocalDataSourcesProvider, useLocalDataSource } from '@/core/datasources/components/local-datasource-provider';
import { DatasourceTopic, SelectedTopic } from '@/core/datasources/datasource-interface';
import { AsyncTopicControlType } from '@/core/jsonforms/controls/topic-selector/topic-selector';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '@/core/plugins/plugins-types';
import { ControlElement, VerticalLayout } from '@jsonforms/core';
import { max } from 'lodash';
import { ChartLineIcon } from 'lucide-react';
import { normalize } from 'path';
import { useEffect, useRef } from 'react';
import { WebglPlot, WebglLine, ColorRGBA } from "webgl-plot";

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

export function WebglPlotComponent(props: TimeSeriesSettings) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wplgRef = useRef<WebglPlot | null>(null);
    const linesRef = useRef<Map<string, WebglLine>>(new Map());
    const lastUpdate = useRef<number>(0);
    const animationFrameId = useRef<number>();

    const sources = useLocalDataSource();

    useEffect(() => {
        if (!canvasRef.current) return;

        // Initialize WebGL plot
        if (!wplgRef.current) {
            wplgRef.current = new WebglPlot(canvasRef.current);

        }

        const numX = canvasRef.current!.width;

        // Setup time line
        const timeLine = new WebglLine(new ColorRGBA(0, 0, 1, 1), numX);
        timeLine.arrangeX();
        wplgRef.current!.addLine(timeLine);

        // Setup lines for each topic
        props.topics.forEach(topicConfig => {
            const color = new ColorRGBA(1, 0, 0, 1); // Parse from topicConfig.color
            const line = new WebglLine(color, numX);
            line.arrangeX();
            wplgRef.current!.addLine(line);

            const sourceId = (topicConfig.topic.property == "") ? topicConfig.topic.topic : topicConfig.topic.topic + '+' + topicConfig.topic.property;

            linesRef.current.set(sourceId, line);
        });

        function update() {
            const currentTime = performance.now();
            const timeSinceLastUpdate = currentTime - lastUpdate.current;
            const updateInterval = 1000 / (props.updateFrequency || 32);

            if (timeSinceLastUpdate >= updateInterval) {

                // // Update time line
                // for (let i = 0; i < timeLine.numPoints; i++) {
                //     timeLine.setY(i, (currentTime - i * updateInterval) / 1000);
                // }

                // Update each line with data from sources
                linesRef.current.forEach((line, topicName) => {
                    const data = sources.sources.get(topicName)?.data;
                    if (data) {
                        // Update line data

                        // normalize data
                        const maxv = max(data);
                        const normalize = data.map((d: number) => d / maxv);

                        for (let i = 0; i < data.length; i++) {

                            line.setY(numX - i, normalize[i]);

                        }
                    }
                });

                if (wplgRef.current) {
                    wplgRef.current.update();
                }
                lastUpdate.current = currentTime;

            }
            animationFrameId.current = requestAnimationFrame(update);
        }

        update();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            wplgRef.current?.clear();
        };
    }, [props.topics, props.updateFrequency, sources]);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '500px' }}
        />
    );
}

export function WebGLPlotDefinition() {
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
        id: 'webgl-plot-time-series',
        name: 'Webgl Plot line chart',
        description: 'Display a line chart',
        titleProp: 'title',
        icon: <ChartLineIcon />,
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
                <WebglPlotComponent {...data} />
            </LocalDataSourcesProvider >
        )

    }
};