import { useLocalDataSource } from '@/core/datasources/components/local-datasource-provider';
import { SelectedTopic } from '@/core/datasources/datasource-interface';
import { getColorsFromString, getTransparentColorString } from '@/core/utils/Colors';
import { toast } from '@/hooks/use-toast';
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
