"use client";

import React, { lazy, Suspense, useMemo } from "react";
import type { GpsPoint, TimeSeriesPoint } from "../bag-reader/bag-types";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";

const Plot = lazy(() => import("react-plotly.js"));

interface GpsHeatlineProps {
	track: GpsPoint[];
	emiSeries: TimeSeriesPoint[];
}

export function GpsHeatline({ track, emiSeries }: GpsHeatlineProps) {
	const data = useMemo<Plotly.Data[]>(() => {
		if (track.length === 0) return [];

		const lats = track.map((p) => p.latitude);
		const lons = track.map((p) => p.longitude);

		// Align EMI value to each GPS point by nearest timestamp
		const emiValues = track.map(({ timestamp }) => {
			const nearest = closestValue(emiSeries, timestamp);
			return nearest;
		});

		if (emiValues.some((v) => v !== null)) {
			const values = emiValues.map((v) => v ?? 0);
			const min = Math.min(...values);
			const max = Math.max(...values);
			const range = max - min || 1;
			const norm = values.map((v) => (v - min) / range);

			const segments: Plotly.Data[] = [];
			const limit = Math.min(track.length - 1, 3000);
			for (let i = 0; i < limit; i++) {
				segments.push({
					x: [lons[i], lons[i + 1]],
					y: [lats[i], lats[i + 1]],
					type: "scatter",
					mode: "lines",
					line: {
						color: turboColor(norm[i] ?? 0),
						width: 4,
					},
					hoverinfo: "skip",
					showlegend: false,
				} as Plotly.Data);
			}
			return segments;
		}

		return [
			{
				x: lons,
				y: lats,
				type: "scatter",
				mode: "lines+markers",
				name: "GPS track",
				line: { width: 2 },
			},
		];
	}, [track, emiSeries]);

	const layout: Partial<Plotly.Layout> = {
		height: 420,
		margin: { l: 40, r: 20, t: 40, b: 40 },
		xaxis: { title: { text: "Longitude" } },
		yaxis: { title: { text: "Latitude" } },
		paper_bgcolor: "transparent",
		plot_bgcolor: "transparent",
	};

	return (
		<Card>
			<CardHeader className="pb-0">
				<CardTitle className="text-sm">GPS Heatline</CardTitle>
			</CardHeader>
			<CardContent className="p-2">
				<Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
					<Plot
						data={data}
						layout={layout}
						style={{ width: "100%" }}
						config={{ responsive: true }}
						useResizeHandler
					/>
				</Suspense>
			</CardContent>
		</Card>
	);
}

function closestValue(
	series: TimeSeriesPoint[],
	timestamp: number,
): number | null {
	if (series.length === 0) return null;
	let lo = 0;
	let hi = series.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if ((series[mid]?.timestamp ?? 0) < timestamp) lo = mid + 1;
		else hi = mid;
	}
	return series[lo]?.value ?? null;
}

/** Approximation of the Turbo colorscale: 0 → blue, 0.5 → green, 1 → red */
function turboColor(t: number): string {
	const r = Math.round(
		255 * Math.max(0, Math.min(1, 1.5 - Math.abs(2 * t - 1.5))),
	);
	const g = Math.round(
		255 * Math.max(0, Math.min(1, 1.5 - Math.abs(2 * t - 0.5))),
	);
	const b = Math.round(
		255 * Math.max(0, Math.min(1, 1.5 - Math.abs(2 * t + 0.5))),
	);
	return `rgb(${r},${g},${b})`;
}
