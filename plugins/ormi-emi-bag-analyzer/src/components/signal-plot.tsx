"use client";

import React, { lazy, Suspense } from "react";
import type { TimeSeriesPoint } from "../bag-reader/bag-types";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";

// Lazy-load Plotly to avoid SSR issues and keep initial bundle small
const Plot = lazy(() => import("react-plotly.js"));

interface LoadedSeries {
	topic: string;
	raw: TimeSeriesPoint[];
	filtered: TimeSeriesPoint[];
}

interface SignalPlotProps {
	series: LoadedSeries[];
}

export function SignalPlot({ series }: SignalPlotProps) {
	const data: Plotly.Data[] = [];

	for (const s of series) {
		const xs = s.raw.map((p) => p.timestamp / 1e9); // convert ns → s
		const rawYs = s.raw.map((p) => p.value);
		const filteredYs = s.filtered.map((p) => p.value);

		data.push({
			x: xs,
			y: rawYs,
			type: "scatter",
			mode: "lines",
			name: `${s.topic} (raw)`,
			line: { width: 1 },
		});

		const isFiltered = s.filtered !== s.raw;
		if (isFiltered) {
			data.push({
				x: xs,
				y: filteredYs,
				type: "scatter",
				mode: "lines",
				name: `${s.topic} (filtered)`,
				line: { width: 2, color: "#d04a02" },
			});
		}
	}

	const layout: Partial<Plotly.Layout> = {
		height: Math.max(400, 260 * series.length),
		margin: { l: 40, r: 20, t: 40, b: 40 },
		legend: { orientation: "h" },
		xaxis: { title: { text: "Time (s)" } },
		paper_bgcolor: "transparent",
		plot_bgcolor: "transparent",
	};

	return (
		<Card>
			<CardContent className="p-2">
				<Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
					<Plot
						data={data}
						layout={layout}
						style={{ width: "100%" }}
						config={{ responsive: true, displayModeBar: true }}
						useResizeHandler
					/>
				</Suspense>
			</CardContent>
		</Card>
	);
}
