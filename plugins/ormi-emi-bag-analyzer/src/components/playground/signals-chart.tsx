"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
	PlaygroundEventSeries,
	PlaygroundLineSeries,
} from "../../bag-reader/bag-types";

type PlotlyModule = typeof import("plotly.js-dist-min");

const MAX_POINTS = 12_000;

export interface DetectionEventGroup {
	name: string;
	/** Timestamps in nanoseconds from bag start */
	timestamps: number[];
	color: string;
}

interface SignalsChartProps {
	lineSeries: PlaygroundLineSeries[];
	eventSeries: PlaygroundEventSeries[];
	detectionEvents?: DetectionEventGroup[];
	/** Extra internal series (threshold, deviation, filtered) */
	extraSeries?: PlaygroundLineSeries[];
	/** Visible time window [start, end] in nanoseconds */
	timeRange: [number, number];
	/** Total bag duration in nanoseconds */
	duration: number;
	onRangeChange: (range: [number, number]) => void;
	/** Chart height in pixels. Defaults to 340 */
	height?: number;
}

function downsample(
	points: { timestamp: number; value: number }[],
	max = MAX_POINTS,
) {
	if (points.length <= max) return points;
	const step = Math.ceil(points.length / max);
	const out = [];
	for (let i = 0; i < points.length; i += step) out.push(points[i]!);
	if (out[out.length - 1] !== points[points.length - 1])
		out.push(points[points.length - 1]!);
	return out;
}

function nsToSec(ns: number): number {
	return ns / 1e9;
}

function usePlotly(): PlotlyModule | null {
	const [plotly, setPlotly] = useState<PlotlyModule | null>(null);
	useEffect(() => {
		import("plotly.js-dist-min").then((m) =>
			setPlotly(m as unknown as PlotlyModule),
		);
	}, []);
	return plotly;
}

export function SignalsChart({
	lineSeries,
	eventSeries,
	detectionEvents = [],
	extraSeries = [],
	timeRange,
	duration,
	onRangeChange,
	height = 340,
}: SignalsChartProps) {
	const Plotly = usePlotly();
	const divRef = useRef<HTMLDivElement>(null);
	const initializedRef = useRef(false);
	// Prevent feedback loop: don't emit onRangeChange when we caused the update
	const externalUpdateRef = useRef(false);

	// Build traces whenever data changes
	const buildTraces = useCallback(() => {
		const allLine = [...lineSeries, ...extraSeries];
		const axisKeys = [...new Set(allLine.map((s) => s.axisKey))];
		const axisRef = (i: number) => (i === 0 ? "y" : `y${i + 1}`);

		const traces: object[] = [];

		// Line series
		for (const s of allLine) {
			const pts = downsample(s.points);
			const axisIndex = axisKeys.indexOf(s.axisKey);
			traces.push({
				type: "scattergl",
				mode: "lines",
				name: s.name,
				x: pts.map((p) => nsToSec(p.timestamp)),
				y: pts.map((p) => p.value),
				yaxis: axisRef(axisIndex),
			});
		}

		// NavSatFix event series: vertical lines at [0,1] on a dedicated axis
		const eventAxisRef = axisRef(axisKeys.length);
		for (const es of eventSeries) {
			const xs: number[] = [];
			const ys: number[] = [];
			for (const t of es.timestamps) {
				xs.push(nsToSec(t), nsToSec(t), NaN);
				ys.push(0, 1, NaN);
			}
			traces.push({
				type: "scattergl",
				mode: "lines",
				name: es.name,
				x: xs,
				y: ys,
				yaxis: eventAxisRef,
				line: { width: 1.5 },
				opacity: 0.7,
			});
		}

		// Detection event series: colored vertical lines
		for (const de of detectionEvents) {
			const xs: number[] = [];
			const ys: number[] = [];
			for (const t of de.timestamps) {
				xs.push(nsToSec(t), nsToSec(t), NaN);
				ys.push(0, 1, NaN);
			}
			traces.push({
				type: "scattergl",
				mode: "lines",
				name: de.name,
				x: xs,
				y: ys,
				yaxis: eventAxisRef,
				line: { width: 2, color: de.color, dash: "dash" },
				opacity: 0.85,
			});
		}

		return { traces, axisKeys, eventAxisRef, axisRef };
	}, [lineSeries, extraSeries, eventSeries, detectionEvents]);

	const buildLayout = useCallback(
		(
			axisKeys: string[],
			eventAxisRef: string,
			axisRef: (i: number) => string,
		) => {
			const [t0, t1] = timeRange;
			const layout: Record<string, unknown> = {
				height,
				margin: { l: 50, r: 50, t: 20, b: 40 },
				legend: { orientation: "h", y: -0.15 },
				uirevision: "signals",
				xaxis: {
					title: "Time (s)",
					range: [nsToSec(t0), nsToSec(t1)],
					uirevision: "signals",
				},
				// Hide event axis
				[`yaxis${axisKeys.length + 1}`]: {
					overlaying: "y",
					range: [0, 1],
					visible: false,
				},
			};

			for (let i = 0; i < axisKeys.length; i++) {
				const key = i === 0 ? "yaxis" : `yaxis${i + 1}`;
				if (i === 0) {
					layout[key] = { title: axisKeys[i], uirevision: "signals" };
				} else {
					layout[key] = {
						title: axisKeys[i],
						overlaying: "y",
						side: i % 2 === 0 ? "left" : "right",
						anchor: "free",
						autoshift: true,
						uirevision: "signals",
					};
				}
			}

			return layout;
		},
		[timeRange, height],
	);

	// Re-initialize when Plotly changes (first load). Update traces on every other dep change.
	useEffect(() => {
		if (!divRef.current || !Plotly) return;
		const { traces, axisKeys, eventAxisRef, axisRef } = buildTraces();
		const layout = buildLayout(axisKeys, eventAxisRef, axisRef);

		if (!initializedRef.current) {
			Plotly.newPlot(
				divRef.current,
				traces as Plotly.Data[],
				layout as unknown as Plotly.Layout,
				{
					responsive: true,
					displayModeBar: false,
				},
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(divRef.current as any).on(
				"plotly_relayout",
				(e: Record<string, unknown>) => {
					if (externalUpdateRef.current) return;
					const r0 = e["xaxis.range[0]"] as number | undefined;
					const r1 = e["xaxis.range[1]"] as number | undefined;
					if (r0 !== undefined && r1 !== undefined) {
						onRangeChange([r0 * 1e9, r1 * 1e9]);
					}
					// autorange reset
					if (e["xaxis.autorange"]) {
						onRangeChange([0, duration]);
					}
				},
			);
			initializedRef.current = true;
		} else {
			Plotly.react(
				divRef.current,
				traces as Plotly.Data[],
				layout as unknown as Plotly.Layout,
			);
		}
	}, [Plotly, buildTraces, buildLayout, onRangeChange, duration]);

	// Sync x-axis range from external timeRange changes (from timeline scrubber)
	useEffect(() => {
		if (!divRef.current || !initializedRef.current || !Plotly) return;
		externalUpdateRef.current = true;
		Plotly.relayout(divRef.current, {
			"xaxis.range[0]": nsToSec(timeRange[0]),
			"xaxis.range[1]": nsToSec(timeRange[1]),
		}).then(() => {
			externalUpdateRef.current = false;
		});
	}, [timeRange[0], timeRange[1]]); // eslint-disable-line react-hooks/exhaustive-deps

	return <div ref={divRef} style={{ width: "100%", height }} />;
}
