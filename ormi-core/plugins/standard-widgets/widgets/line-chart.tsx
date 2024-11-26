"use client"

import 'chartjs-adapter-date-fns';
import { useRandomProvider } from '@/core/datasources/random-data-source';
import { getColorsFromString, getTransparentColorString } from '@/core/utils/Colors';
import { toast } from '@/hooks/use-toast';
import Chart, { ChartConfiguration } from 'chart.js/auto';
import { useEffect, useRef } from 'react';

/*
    Component that implements Chart.js to render a line chart.
*/
export function LineChart(props: any) {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart>();

    const { sources } = useRandomProvider();

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
                        min: Date.now() - props.timeToSpan * 1000,
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
        for (const topic of props.topics) {
            const data: number[] = [];

            const source = sources.get(topic.topic);
            const title = topic.topic;

            if (!source) {
                toast({
                    title: 'Error',
                    description: `Data source ${topic.topic} not found`,
                    variant: 'destructive',
                })
                continue;
            }

            data.push(...source.data);

            config.data.datasets.push({
                label: title,
                data: data,
                fill: topic.fill || false,
                backgroundColor: getTransparentColorString(topic.color || getColorsFromString(title), 0.4),
                borderColor: topic.color || getColorsFromString(title),
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

        const spanOfTime = props.timeToSpan || 10; // keep n seconds of data, default 10


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
