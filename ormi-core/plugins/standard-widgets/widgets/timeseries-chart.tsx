// /*
//     This component use TimeChart instead of Chart.js to render a time series chart.
//     this is based on webgl
// */


import { useRandomProvider } from '@/core/datasources/random-data-source';
import { getColorsFromString, getTransparentColorString } from '@/core/utils/Colors';
import { toast } from '@/hooks/use-toast';
import React, { useEffect, useState } from 'react';
import { AlignedData } from 'uplot';
import UplotReact from 'uplot-react';
import 'uplot/dist/uPlot.min.css';




export function TimeChartComponent(props: any) {

    const { sources } = useRandomProvider();

    const divRef = React.useRef<HTMLDivElement>(null);

    const [options, setOptions] = useState<uPlot.Options>({
        width: 400,
        height: 300,

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
            {
                label: 'Random',
                stroke: 'blue',
                width: 2,
                show: true,
            },
        ]
    });

    const [data, setData] = useState<AlignedData>([new Float64Array([Date.now() / 1000]), new Float64Array([0])]);

    const timeSpan = props.timeHistory || 5;
    const updateFrequency = props.updateFrequency || 32;    // in Hz

    useEffect(() => {
        // setup the series based on the props.topics
        const series: uPlot.Series[] = [];
        series.push({
            label: 'Time',
        });
        for (const topic of props.topics) {

            const fill = (topic.fill || false) ? getTransparentColorString(topic.color || getColorsFromString(topic.topic), 0.4) : undefined;

            // check if the topic is in the sources
            const source = sources.get(topic.topic);
            if (!source) {
                toast({
                    title: 'Error',
                    description: `Data source ${topic.topic} not found`,
                    variant: 'destructive'
                });
                continue;
            }

            series.push({
                label: topic.topic,
                stroke: topic.color || getColorsFromString(topic.topic),
                width: 2,
                spanGaps: true,
                fill: fill,
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

            for (const topic of props.topics) {
                const source = sources.get(topic.topic);
                if (!source) {
                    continue;
                }

                // filter the data that is older than 60 seconds, the data is in the data property, the timestamp is in the times property
                const topic_filtered_value = source.data.filter((value, index) => {
                    return (source.times[index] / 1000) > now - timeSpan;
                });

                const topic_filtered_time = source.times.filter((value, index) => {
                    return (source.times[index] / 1000) > now - timeSpan;
                });

                filtered_data.set(topic.topic, topic_filtered_value.map((value, index) => {
                    return { value: value, time: topic_filtered_time[index] / 1000 };
                }));
            }

            // create the time array by taking the time from all the topics and sorting them
            const time_array = Array.from(filtered_data.values()).reduce((acc, value) => {
                return acc.concat(value);
            }, []).map(value => value.time).sort();

            // for each topic, create the data array, if the time is not present, set the value to null
            for (let i = 0; i < props.topics.length; i++) {
                const topic = props.topics[i];
                const topic_data = filtered_data.get(topic.topic);
                data_copy[i + 1] = time_array.map(time => {
                    const value = topic_data?.find(value => value.time === time);
                    return value ? value.value : null;
                });
            }

            // update the time array
            data_copy[0] = time_array;

            // update the data
            setData(data_copy);

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
