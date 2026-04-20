"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GpsPoint, TimeSeriesPoint } from "../../bag-reader/bag-types";
import { gpsAtTimestamp } from "../../algorithms/clustering";

type PlotlyModule = typeof import("plotly.js-dist-min");

export interface GpsDetectionGroup {
	name: string;
	timestamps: number[]; // ns from bag start
	color: string;
}

interface GpsMapAdvancedProps {
	gps: GpsPoint[];
	/**
	 * Signal series used to color the heatline (e.g. /emi/pulse/avg).
	 * If omitted the path is rendered as a plain gray line.
	 */
	valueSeries?: TimeSeriesPoint[];
	/** Detection groups to show as colored dots on top of the heatline */
	detectionGroups?: GpsDetectionGroup[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Linearly interpolate the signal value at a given timestamp using binary
 * search. Returns null when the series is empty.
 */
function interpolateValue(
	series: TimeSeriesPoint[],
	tsNs: number,
): number | null {
	if (series.length === 0) return null;
	if (tsNs <= series[0]!.timestamp) return series[0]!.value;
	if (tsNs >= series[series.length - 1]!.timestamp)
		return series[series.length - 1]!.value;

	let lo = 0;
	let hi = series.length - 1;
	while (lo + 1 < hi) {
		const mid = (lo + hi) >> 1;
		if (series[mid]!.timestamp <= tsNs) lo = mid;
		else hi = mid;
	}
	const a = series[lo]!;
	const b = series[hi]!;
	const t = (tsNs - a.timestamp) / (b.timestamp - a.timestamp);
	return a.value + t * (b.value - a.value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function usePlotly(): PlotlyModule | null {
	const [plotly, setPlotly] = useState<PlotlyModule | null>(null);
	useEffect(() => {
		import("plotly.js-dist-min").then((m) =>
			setPlotly(m as unknown as PlotlyModule),
		);
	}, []);
	return plotly;
}

export function GpsMapAdvanced({
	gps,
	valueSeries,
	detectionGroups = [],
}: GpsMapAdvancedProps) {
	const Plotly = usePlotly();
	const divRef = useRef<HTMLDivElement>(null);
	const initializedRef = useRef(false);

	const buildTraces = useCallback(() => {
		const traces: object[] = [];
		if (gps.length === 0) return traces;

		const lons = gps.map((p) => p.longitude);
		const lats = gps.map((p) => p.latitude);

		if (valueSeries && valueSeries.length > 0) {
			// ── Heatline: markers colored by interpolated EMI value ──────────
			const values = gps.map(
				(p) => interpolateValue(valueSeries, p.timestamp) ?? 0,
			);

			// Thin background path for continuity
			traces.push({
				type: "scattergl",
				mode: "lines",
				x: lons,
				y: lats,
				line: { color: "rgba(100,100,100,0.2)", width: 1 },
				hoverinfo: "skip",
				showlegend: false,
			});

			// Colored marker heatline
			traces.push({
				type: "scattergl",
				mode: "markers",
				name: "EMI",
				x: lons,
				y: lats,
				marker: {
					color: values,
					colorscale: "Turbo",
					size: 5,
					showscale: true,
					colorbar: {
						title: { text: "EMI", side: "right" },
						thickness: 12,
						len: 0.6,
						x: 1.02,
					},
				},
				hovertemplate:
					"lat: %{y:.5f}<br>lon: %{x:.5f}<br>EMI: %{marker.color:.3f}<extra></extra>",
			});
		} else {
			// No value series — plain gray path
			traces.push({
				type: "scattergl",
				mode: "lines",
				name: "Path",
				x: lons,
				y: lats,
				line: { color: "#94a3b8", width: 2 },
				hoverinfo: "skip",
				showlegend: false,
			});
		}

		// ── Detection dots ───────────────────────────────────────────────────
		for (const group of detectionGroups) {
			const dLats: number[] = [];
			const dLons: number[] = [];
			const texts: string[] = [];
			for (const ts of group.timestamps) {
				const pt = gpsAtTimestamp(gps, ts);
				if (pt) {
					dLats.push(pt.latitude);
					dLons.push(pt.longitude);
					texts.push(`t=${(ts / 1e9).toFixed(2)}s`);
				}
			}
			if (dLats.length > 0) {
				traces.push({
					type: "scattergl",
					mode: "markers",
					name: group.name,
					x: dLons,
					y: dLats,
					marker: {
						size: 10,
						color: group.color,
						symbol: "circle",
						line: { width: 1.5, color: "#fff" },
					},
					text: texts,
					hovertemplate: "%{text}<extra>" + group.name + "</extra>",
				});
			}
		}

		return traces;
	}, [gps, valueSeries, detectionGroups]);

	const buildLayout = useCallback(
		() => ({
			height: 380,
			margin: { l: 50, r: 70, t: 10, b: 40 },
			legend: { orientation: "h", y: -0.15 },
			uirevision: "gpsmap",
			xaxis: { title: "Longitude", uirevision: "gpsmap" },
			yaxis: {
				title: "Latitude",
				scaleanchor: "x",
				uirevision: "gpsmap",
			},
		}),
		[],
	);

	useEffect(() => {
		if (!divRef.current || !Plotly) return;
		const traces = buildTraces();
		const layout = buildLayout();
		if (!initializedRef.current) {
			Plotly.newPlot(
				divRef.current,
				traces as Plotly.Data[],
				layout as unknown as Plotly.Layout,
				{ responsive: true, displayModeBar: false },
			);
			initializedRef.current = true;
		} else {
			Plotly.react(
				divRef.current,
				traces as Plotly.Data[],
				layout as unknown as Plotly.Layout,
			);
		}
	}, [Plotly, buildTraces, buildLayout]);

	return <div ref={divRef} style={{ width: "100%", height: 380 }} />;
}
