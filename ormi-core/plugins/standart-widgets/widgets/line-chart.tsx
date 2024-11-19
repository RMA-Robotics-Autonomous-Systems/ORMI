"use client"

import { CartesianGrid, Line, LineChart, XAxis } from "recharts"


import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/ui/chart"
import { useEffect, useState } from "react"


const chartConfig = {
    desktop: {
        label: "Desktop",
        color: "hsl(var(--chart-1))",
    },
    mobile: {
        label: "Mobile",
        color: "hsl(var(--chart-2))",
    },
} satisfies ChartConfig

export function ChartComp() {


    // const [chartData, setChartData] = useState([
    //     {
    //         timeStamp: Date.now(),
    //         desktop: 0,
    //         mobile: 0,
    //     },
    // ])

    // useEffect(() => {

    //     // set at 50hz, random data
    //     const interval = setInterval(() => {
    //         setChartData((prevData) => {
    //             const newData = [...prevData]
    //             newData.push({
    //                 timeStamp: Date.now(),
    //                 desktop: Math.floor(Math.random() * 300),
    //                 mobile: Math.floor(Math.random() * 300),
    //             })
    //             return newData
    //         })
    //     }, 20)


    //     return () => {
    //         clearInterval(interval)
    //     }

    // }, [])


    return (
        <ChartContainer config={chartConfig}>
            <LineChart
                accessibilityLayer
                // data={chartData}
                margin={{
                    left: 12,
                    right: 12,
                }}
            >
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="timeStamp"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => value.slice(0, 3)}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Line
                    dataKey="desktop"
                    type="monotone"
                    stroke="var(--color-desktop)"
                    strokeWidth={2}
                    dot={false}
                />
                <Line
                    dataKey="mobile"
                    type="monotone"
                    stroke="var(--color-mobile)"
                    strokeWidth={2}
                    dot={false}
                />
            </LineChart>
        </ChartContainer>
    )
}
