// /*
//     This component use TimeChart instead of Chart.js to render a time series chart.
//     this is based on webgl
// */


import { useLocalsourceProvider } from '@/core/datasources/components/local-datasource-provider';
import { SelectedTopic } from '@/core/jsonforms/topic-selector/topic-selector';
import { getColorsFromString, getTransparentColorString } from '@/core/utils/Colors';
import { toast } from '@/hooks/use-toast';
import React, { useEffect, useState } from 'react';
import { AlignedData } from 'uplot';
import UplotReact from 'uplot-react';
import 'uplot/dist/uPlot.min.css';




export function TimeChartComponent(props: any) {

    const { sources } = useLocalsourceProvider();

    const divRef = React.useRef<HTMLDivElement>(null);

    const [options, setOptions] = useState<uPlot.Options>({
        width: divRef.current?.clientWidth || 500,
        height: divRef.current?.clientHeight || 500,

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
        series: [
            {
                label: 'Time',
            },
        ]
    });

    const [data, setData] = useState<AlignedData>([]);

    const timeSpan = props.timeHistory || 5;
    const updateFrequency = props.updateFrequency || 32;    // in Hz

    useEffect(() => {

        const getTopic = (topic: string) => {
            return JSON.parse(topic) as SelectedTopic;
        }

        // setup the series based on the props.topics
        const series: uPlot.Series[] = [];
        series.push({
            label: 'Time',
        });

        const notFoundTopics: string[] = [];

        for (const topic_props of props.topics) {

            const topic = getTopic(topic_props.topic);

            const sourceId = (topic.property !== '') ? topic.topic + "+" + topic.property : topic.topic;

            const fill = (topic_props.fill || false) ? getTransparentColorString(topic_props.color || getColorsFromString(topic.topic), 0.4) : undefined;

            // check if the topic is in the sources
            const source = sources.get(sourceId);
            if (!source) {
                notFoundTopics.push(topic.topic);
                continue;
            }

            const props_label = topic.property !== '' ? topic.topic + "." + topic.property.replaceAll("-", ".") : topic.topic;

            series.push({
                label: props_label,
                stroke: topic_props.color || getColorsFromString(sourceId),
                width: 2,
                spanGaps: true,
                fill: fill,
            });
        }


        if (notFoundTopics.length > 0) {
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

        options!.series = series;

        setOptions(options!);

        // setup the initial data
        const initial_data: AlignedData = [new Float64Array([Date.now() / 1000])];

        for (let i = 0; i < props.topics.length; i++) {
            initial_data.push(new Float64Array([0]));
        }

        setData(initial_data);

        // update data with random values
        const updateInterval = setInterval(() => {

            // update the width and height
            const now = Date.now() / 1000;
            const data_copy = data;


            const filtered_data = new Map<string, { value: number, time: number }[]>();

            const timeSet = new Set<number>();

            for (const topic_props of props.topics) {
                const topic = getTopic(topic_props.topic);
                const sourceId = (topic.property !== '') ? topic.topic + "+" + topic.property : topic.topic;

                const source = sources.get(sourceId);
                if (!source) {
                    console.log("source not found", topic.topic);
                    continue;
                }

                // filter the data that is older than timeSpan seconds
                const topic_filtered = source.data.reduce((acc, value, index) => {
                    const time = source.times[index] / 1000;
                    if (time > now - timeSpan) {
                        acc.push({ value, time });
                        timeSet.add(time);
                    }
                    return acc;
                }, [] as { value: number, time: number }[]);

                filtered_data.set(sourceId, topic_filtered);
            }

            const time_array = Array.from(timeSet).sort();

            for (let i = 0; i < props.topics.length; i++) {
                const topic = getTopic(props.topics[i].topic);
                const sourceId = (topic.property !== '') ? topic.topic + "+" + topic.property : topic.topic;
                const topic_data = filtered_data.get(sourceId);
                data_copy[i + 1] = time_array.map(time => {
                    const value = topic_data?.find(value => value.time === time);
                    return value ? value.value : null;
                });
            }

            // update the time array
            data_copy[0] = time_array;

            // update the data
            setData(data_copy);

            if (divRef.current === null || divRef.current === undefined || !divRef.current.clientWidth || !divRef.current.clientHeight) {
                return;
            }

            // update options
            setOptions({
                ...options!,
                width: divRef.current!.clientWidth,
                height: divRef.current!.clientHeight - 40,
                scales: {
                    x: {
                        time: true,
                        range: [now - timeSpan, now],
                    },
                },
            });



        }, 1000 / updateFrequency);


        return () => {
            clearInterval(updateInterval);
        }

    }, []);

    return (
        <div ref={divRef} style={{ width: "100%", height: "100%" }}>
            <UplotReact
                options={options!}
                data={data}
            />
        </div>
    );
}
