// /*
//     This component use TimeChart instead of Chart.js to render a time series chart.
//     this is based on webgl
// */


import React, { useEffect, useRef, useState } from 'react';
import UplotReact from 'uplot-react';
import 'uplot/dist/uPlot.min.css';




export function TimeChartComponent(props: any) {

    const [options, setOptions] = useState<uPlot.Options>({
        width: 400,
        height: 300,
        scales: {
            x: {
                time: true,
                range: () => [Date.now() - 2000, Date.now()],
            },
            y: {},
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
            {},
            {
                label: 'Random',
                stroke: 'blue',
            },
        ]
    });

    const [data, setData] = useState<any[]>([]);

    useEffect(() => {

        const datas: number[][] = []
        for (let i = 0; i < 100; i++) {
            datas.push([Date.now() - 10 * i]);  // x value
            datas.push([Math.random() * 100]);  // y value
        }

        // update data with random values
        const updateInterval = setInterval(() => {

            const newData = [...data];

            setData(newData);

        }, 1000);

        return () => {
            clearInterval(updateInterval);
        }

    }, []);

    return (
        <div style={{ width: "400px", height: "300px" }}>
            <UplotReact
                options={options!}
                data={data}
                onCreate={(chart) => {
                    console.log('Chart created');
                }}
                onDelete={(chart) => { }}
            />
        </div>
    );
}
