"use client"


import Chart from 'chart.js/auto';
import { useEffect, useRef, useState } from 'react';

/*
    Component that implements Chart.js to render a line chart.
*/
export function LineChart(props: any) {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart>();

    const [data, setData] = useState<number[]>([]);
    const [labels, setLabels] = useState<string[]>([]);

    // mount and unmount the chart
    useEffect(() => {
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                chartRef.current = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'My First Dataset',
                            data: data,
                            fill: false,
                            borderColor: 'rgb(75, 192, 192)',
                            tension: 0,
                        }]
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
            }
        }

        const interval = setInterval(() => {
            setData(data => {
                // add new random data
                // keep the data length to 100
                if (data.length > 100) {
                    data.shift();
                }

                return [...data, Math.floor(Math.random() * 100)];
            });

            setLabels(labels => {
                // add new label
                // keep the label length to 100
                if (labels.length > 100) {
                    labels.shift();
                }

                return [...labels, new Date().toLocaleTimeString()];
            });

        }, 50);

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }

            clearInterval(interval);
        }
    }, []);


    // whenever the data changes, update the chart
    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.data.datasets[0].data = data;
            chartRef.current.data.labels = labels;
            chartRef.current.update();
            chartRef.current.resize();
        }
    }, [data, labels]);

    return (
        <canvas ref={canvasRef} />
    )
}
