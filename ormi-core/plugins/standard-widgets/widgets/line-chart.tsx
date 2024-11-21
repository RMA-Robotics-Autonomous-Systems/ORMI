"use client"


import { useRandomProvider } from '@/core/datasources/random-data-source';
import { getColorsFromString } from '@/core/utils/Colors';
import { toast } from '@/hooks/use-toast';
import Chart from 'chart.js/auto';
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

        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                chartRef.current = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: []
                    },
                    options: {
                        animation: false,
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
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


                });

                // load datasets from props.topics
                if (!props.topics) {
                    return;
                }

                for (const topic of props.topics) {
                    const data: number[] = [];

                    const source = sources.get(topic.topic);
                    const title = topic.topic;

                    if (source) {
                        data.push(...source.data);
                    } else {
                        toast({
                            title: 'Error',
                            description: `Data source ${topic.topic} not found`,
                            variant: 'destructive',
                        })
                    }

                    chartRef.current.data.datasets.push({
                        label: title,
                        data: data,
                        fill: false,
                        borderColor: topic.color || getColorsFromString(title),
                        tension: 0
                    });
                }
            }
        }

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        }
    }, []);


    // whenever the data changes, update the chart
    useEffect(() => {
        if (!chartRef.current) {
            return;
        }

        let new_labels = [];

        // update datasets without creating new ones
        for (const dataset of chartRef.current.data.datasets) {
            if (dataset.label) {
                const source = sources.get(dataset.label);
                if (source) {
                    dataset.data = source.data.map((value, index) => {
                        return { x: source.times[index], y: value };
                    });

                    new_labels.push(...source.times);
                }
            }
        }

        // remove duplicates
        new_labels = [...new Set(new_labels)];
        // sort labels
        new_labels.sort();

        chartRef.current.data.labels = new_labels;
        chartRef.current.update();
        chartRef.current.resize();
    }, [sources]);

    return (
        <canvas ref={canvasRef} />
    )
}
