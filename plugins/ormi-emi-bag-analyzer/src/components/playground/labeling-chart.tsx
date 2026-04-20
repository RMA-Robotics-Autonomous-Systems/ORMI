"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { TimeSeriesPoint } from "../../bag-reader/bag-types";

type PlotlyModule = typeof import("plotly.js-dist-min");

// ── Public types ──────────────────────────────────────────────────────────

export interface ConfidencePoint {
	id: string;
	/** Nanoseconds from bag start */
	tsNs: number;
	/** 0–1 */
	confidence: number;
}

export interface LabelingChartProps {
	series: TimeSeriesPoint[];
	filteredSeries?: TimeSeriesPoint[];
	/** Extra series interpolated and appended as columns in the CSV export */
	extraCsvSeries?: { label: string; points: TimeSeriesPoint[] }[];
	duration: number;
	timeRange?: [number, number];
	controlPoints: ConfidencePoint[];
	onChange: (pts: ConfidencePoint[]) => void;
	onSeedFromDetections?: () => void;
	height?: number;
}

// ── Layout constants — must match Plotly margin exactly ───────────────────

const ML = 58; // margin left  (signal Y axis)
const MR = 58; // margin right (confidence Y axis)
const MT = 12; // margin top
const MB = 40; // margin bottom (room for x-axis title)
const HANDLE_R = 7;
const MAX_SIG_POINTS = 5000;

const CONF_STROKE = "#6366f1";
const CONF_FILL = "rgba(99,102,241,0.12)";
const SIG_STROKE = "rgba(120,120,140,0.55)";
const FILT_STROKE = "rgba(234,179,8,0.85)";

// ── Helpers ───────────────────────────────────────────────────────────────

function uid(): string {
	return Math.random().toString(36).slice(2, 10);
}

function lerpConf(sorted: ConfidencePoint[], tsNs: number): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0]!.confidence;
	if (tsNs <= sorted[0]!.tsNs) return sorted[0]!.confidence;
	if (tsNs >= sorted[sorted.length - 1]!.tsNs)
		return sorted[sorted.length - 1]!.confidence;
	let lo = 0,
		hi = sorted.length - 1;
	while (lo + 1 < hi) {
		const mid = (lo + hi) >> 1;
		if (sorted[mid]!.tsNs <= tsNs) lo = mid;
		else hi = mid;
	}
	const a = sorted[lo]!,
		b = sorted[hi]!;
	return (
		a.confidence +
		((tsNs - a.tsNs) / (b.tsNs - a.tsNs)) * (b.confidence - a.confidence)
	);
}

/** Linear interpolation of a TimeSeriesPoint array at an arbitrary timestamp. */
function lerpSeries(pts: TimeSeriesPoint[], tsNs: number): number | null {
	if (pts.length === 0) return null;
	if (tsNs <= pts[0]!.timestamp) return pts[0]!.value;
	if (tsNs >= pts[pts.length - 1]!.timestamp)
		return pts[pts.length - 1]!.value;
	let lo = 0,
		hi = pts.length - 1;
	while (lo + 1 < hi) {
		const mid = (lo + hi) >> 1;
		if (pts[mid]!.timestamp <= tsNs) lo = mid;
		else hi = mid;
	}
	const a = pts[lo]!,
		b = pts[hi]!;
	return (
		a.value +
		((tsNs - a.timestamp) / (b.timestamp - a.timestamp)) *
			(b.value - a.value)
	);
}

function downsample<T extends { timestamp: number }>(
	pts: T[],
	max: number,
): T[] {
	if (pts.length <= max) return pts;
	const step = Math.ceil(pts.length / max);
	const out: T[] = [];
	for (let i = 0; i < pts.length; i += step) out.push(pts[i]!);
	const last = pts[pts.length - 1]!;
	if (out[out.length - 1] !== last) out.push(last);
	return out;
}

function exportCsv(
	series: TimeSeriesPoint[],
	sorted: ConfidencePoint[],
	extraCsvSeries: { label: string; points: TimeSeriesPoint[] }[] = [],
): void {
	const extraHeaders = extraCsvSeries.map((s) => s.label).join(",");
	const header = `timestamp_ns,timestamp_s,emi_value,confidence${extraHeaders ? "," + extraHeaders : ""}`;
	const rows = [header];
	for (const pt of series) {
		const c = lerpConf(sorted, pt.timestamp);
		const extra = extraCsvSeries
			.map((s) => {
				const v = lerpSeries(s.points, pt.timestamp);
				return v !== null ? v.toFixed(6) : "";
			})
			.join(",");
		const base = `${pt.timestamp},${(pt.timestamp / 1e9).toFixed(6)},${pt.value.toFixed(6)},${c.toFixed(6)}`;
		rows.push(extra ? `${base},${extra}` : base);
	}
	const blob = new Blob([rows.join("\n")], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "confidence_labels.csv";
	a.click();
	URL.revokeObjectURL(url);
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

// ── Trace / layout builders ───────────────────────────────────────────────

function buildTraces(
	series: TimeSeriesPoint[],
	filteredSeries: TimeSeriesPoint[] | undefined,
	sorted: ConfidencePoint[],
	duration: number,
): object[] {
	const sigPts = downsample(series, MAX_SIG_POINTS);
	const filtPts = filteredSeries
		? downsample(filteredSeries, MAX_SIG_POINTS)
		: [];

	// Confidence curve: virtual endpoints at bag start/end + all control points
	const curve = [
		{ ts: 0, c: lerpConf(sorted, 0) },
		...sorted.map((p) => ({ ts: p.tsNs, c: p.confidence })),
		{ ts: duration, c: lerpConf(sorted, duration) },
	];

	return [
		// 0 — raw signal
		{
			type: "scattergl",
			mode: "lines",
			name: "EMI",
			x: sigPts.map((p) => p.timestamp / 1e9),
			y: sigPts.map((p) => p.value),
			yaxis: "y",
			line: { color: SIG_STROKE, width: 1.5 },
			showlegend: false,
		},
		// 1 — filtered signal (empty arrays when not present — keeps index stable)
		{
			type: "scattergl",
			mode: "lines",
			name: "Filtered",
			x: filtPts.map((p) => p.timestamp / 1e9),
			y: filtPts.map((p) => p.value),
			yaxis: "y",
			line: { color: FILT_STROKE, width: 1.5, dash: "dash" },
			showlegend: false,
		},
		// 2 — confidence curve (line + fill on secondary axis)
		{
			type: "scatter",
			mode: "lines",
			name: "Confidence",
			x: curve.map((p) => p.ts / 1e9),
			y: curve.map((p) => p.c),
			yaxis: "y2",
			fill: "tozeroy",
			fillcolor: CONF_FILL,
			line: { color: CONF_STROKE, width: 2 },
			showlegend: false,
		},
	];
}

function buildLayout(
	viewStart: number,
	viewEnd: number,
	height: number,
): object {
	return {
		height,
		margin: { l: ML, r: MR, t: MT, b: MB },
		dragmode: false,
		uirevision: "labeling",
		showlegend: false,
		plot_bgcolor: "rgba(0,0,0,0)",
		paper_bgcolor: "rgba(0,0,0,0)",
		xaxis: {
			range: [viewStart / 1e9, viewEnd / 1e9],
			title: { text: "Time (s)", font: { size: 10 } },
			tickfont: { size: 9 },
			fixedrange: true,
		},
		yaxis: {
			autorange: true,
			title: {
				text: "EMI",
				font: { size: 10, color: "rgba(120,120,140,0.8)" },
			},
			tickfont: { size: 9, color: "rgba(120,120,140,0.8)" },
			fixedrange: true,
		},
		yaxis2: {
			range: [0, 1],
			overlaying: "y",
			side: "right",
			tickvals: [0, 0.25, 0.5, 0.75, 1.0],
			title: {
				text: "Confidence",
				font: { size: 10, color: CONF_STROKE },
			},
			tickfont: { size: 9, color: CONF_STROKE },
			fixedrange: true,
		},
	};
}

// ── Component ─────────────────────────────────────────────────────────────

export function LabelingChart({
	series,
	filteredSeries,
	extraCsvSeries,
	duration,
	timeRange,
	controlPoints,
	onChange,
	onSeedFromDetections,
	height = 200,
}: LabelingChartProps) {
	const Plotly = usePlotly();
	const plotDivRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const initializedRef = useRef(false);

	const [svgWidth, setSvgWidth] = useState(800);
	const [isDragging, setIsDragging] = useState(false);
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	// Always-current ref — used inside window-level event handlers to avoid stale closures
	const controlPointsRef = useRef(controlPoints);
	controlPointsRef.current = controlPoints;

	// ── Layout geometry ────────────────────────────────────────────────────
	const innerW = svgWidth - ML - MR;
	const innerH = height - MT - MB;
	const viewStart = timeRange?.[0] ?? 0;
	const viewEnd = timeRange?.[1] ?? duration;
	const viewSpan = viewEnd - viewStart || 1;

	// ── ResizeObserver ─────────────────────────────────────────────────────
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) setSvgWidth(e.contentRect.width);
		});
		ro.observe(el);
		setSvgWidth(el.clientWidth || 800);
		return () => ro.disconnect();
	}, []);

	// ── Sorted control points ──────────────────────────────────────────────
	const sorted = useMemo(
		() => [...controlPoints].sort((a, b) => a.tsNs - b.tsNs),
		[controlPoints],
	);

	// ── Plotly: init + react() on data/controlPoints changes ──────────────
	// Does NOT include viewStart/viewEnd — timeRange is handled by the fast path below.
	useEffect(() => {
		if (!Plotly || !plotDivRef.current) return;
		const traces = buildTraces(series, filteredSeries, sorted, duration);
		const layout = buildLayout(viewStart, viewEnd, height);

		if (!initializedRef.current) {
			Plotly.newPlot(
				plotDivRef.current,
				traces as Plotly.Data[],
				layout as unknown as Plotly.Layout,
				{ responsive: true, displayModeBar: false, scrollZoom: false },
			);
			initializedRef.current = true;
		} else {
			Plotly.react(
				plotDivRef.current,
				traces as Plotly.Data[],
				layout as unknown as Plotly.Layout,
			);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [Plotly, series, filteredSeries, sorted, duration, height]);

	// ── Plotly: fast path — slider moves only update xaxis range ──────────
	useEffect(() => {
		if (!Plotly || !plotDivRef.current || !initializedRef.current) return;
		Plotly.relayout(plotDivRef.current, {
			"xaxis.range[0]": viewStart / 1e9,
			"xaxis.range[1]": viewEnd / 1e9,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [viewStart, viewEnd]);

	// ── Coordinate helpers (SVG overlay space, mirrors Plotly margins) ─────
	const xOf = (tsNs: number) => ML + ((tsNs - viewStart) / viewSpan) * innerW;
	const yConfOf = (c: number) =>
		MT + (1 - Math.max(0, Math.min(1, c))) * innerH;
	const tsFromX = (x: number) => viewStart + ((x - ML) / innerW) * viewSpan;

	const visibleHandles = useMemo(
		() => sorted.filter((p) => p.tsNs >= viewStart && p.tsNs <= viewEnd),
		[sorted, viewStart, viewEnd],
	);

	// ── SVG-local pixel coords from a mouse event ──────────────────────────
	const getSvgPos = useCallback(
		(e: MouseEvent | React.MouseEvent): { x: number; y: number } | null => {
			const svg = svgRef.current;
			if (!svg) return null;
			const rect = svg.getBoundingClientRect();
			return {
				x: (e.clientX - rect.left) * (svgWidth / rect.width),
				y: (e.clientY - rect.top) * (height / rect.height),
			};
		},
		[svgWidth, height],
	);

	// ── Handle drag — window-level for smooth out-of-element tracking ──────
	const handleHandleMouseDown = useCallback(
		(e: React.MouseEvent, id: string) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(true);

			const onMove = (me: MouseEvent) => {
				const svg = svgRef.current;
				if (!svg) return;
				const rect = svg.getBoundingClientRect();
				const y = (me.clientY - rect.top) * (height / rect.height);
				const newConf = Math.max(0, Math.min(1, 1 - (y - MT) / innerH));
				onChange(
					controlPointsRef.current.map((p) =>
						p.id === id ? { ...p, confidence: newConf } : p,
					),
				);
			};

			const onUp = () => {
				setIsDragging(false);
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
			};

			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp);
		},
		[height, innerH, onChange],
	);

	// ── Click in plot area → add new handle ───────────────────────────────
	const handlePlotClick = useCallback(
		(e: React.MouseEvent) => {
			const pos = getSvgPos(e);
			if (!pos) return;
			if (
				pos.x < ML ||
				pos.x > ML + innerW ||
				pos.y < MT ||
				pos.y > MT + innerH
			)
				return;
			const tsNs = Math.max(viewStart, Math.min(viewEnd, tsFromX(pos.x)));
			const confidence = Math.max(
				0,
				Math.min(1, 1 - (pos.y - MT) / innerH),
			);
			onChange([
				...controlPointsRef.current,
				{ id: uid(), tsNs, confidence },
			]);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[getSvgPos, innerW, innerH, viewStart, viewEnd, onChange],
	);

	// ── Double-click handle → remove ──────────────────────────────────────
	const handleHandleDblClick = useCallback(
		(e: React.MouseEvent, id: string) => {
			e.stopPropagation();
			onChange(controlPointsRef.current.filter((p) => p.id !== id));
		},
		[onChange],
	);

	// ── Render ─────────────────────────────────────────────────────────────
	return (
		<div className="flex flex-col gap-1" ref={containerRef}>
			{/* Toolbar */}
			<div className="flex items-center justify-between px-1">
				<span className="text-xs font-medium text-muted-foreground">
					Confidence labeling
					<span className="ml-2 text-[10px] font-normal opacity-60">
						click to add · drag to adjust · double-click to remove
					</span>
				</span>
				<div className="flex gap-3">
					{filteredSeries && filteredSeries.length > 0 && (
						<span className="flex items-center gap-1 text-[10px] text-amber-500">
							<span
								style={{
									display: "inline-block",
									width: 16,
									height: 2,
									background: FILT_STROKE,
									borderRadius: 1,
								}}
							/>
							filtered
						</span>
					)}
					{onSeedFromDetections && (
						<button
							type="button"
							onClick={onSeedFromDetections}
							className="text-xs text-indigo-500 hover:text-indigo-700 underline"
						>
							Seed from detections
						</button>
					)}
					<button
						type="button"
						onClick={() =>
							exportCsv(series, sorted, extraCsvSeries)
						}
						disabled={
							controlPoints.length === 0 || series.length === 0
						}
						className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-40 disabled:cursor-not-allowed"
					>
						Export CSV
					</button>
					<button
						type="button"
						onClick={() => onChange([])}
						disabled={controlPoints.length === 0}
						className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-40 disabled:cursor-not-allowed"
					>
						Clear
					</button>
				</div>
			</div>

			{/* Chart: Plotly layer + SVG handle overlay */}
			<div style={{ position: "relative", width: "100%", height }}>
				{/* Plotly renders signal lines + confidence curve here */}
				<div ref={plotDivRef} style={{ width: "100%", height }} />

				{/* SVG overlay — handles only, globally pointer-events: none */}
				<svg
					ref={svgRef}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: "100%",
						height,
						pointerEvents: "none",
						userSelect: "none",
						overflow: "visible",
					}}
				>
					{/* Transparent rect over plot area — captures click-to-add */}
					<rect
						x={ML}
						y={MT}
						width={innerW}
						height={innerH}
						fill="transparent"
						style={{
							pointerEvents: "all",
							cursor: isDragging ? "ns-resize" : "crosshair",
						}}
						onClick={handlePlotClick}
					/>

					{/* Draggable handles — only those in the current time window */}
					{visibleHandles.map((p) => {
						const cx = xOf(p.tsNs);
						const cy = yConfOf(p.confidence);
						const isHov = hoveredId === p.id;
						return (
							<g key={p.id} style={{ pointerEvents: "all" }}>
								{/* Large invisible hit area */}
								<circle
									cx={cx}
									cy={cy}
									r={HANDLE_R + 6}
									fill="transparent"
									style={{ cursor: "ns-resize" }}
									onMouseDown={(e) =>
										handleHandleMouseDown(e, p.id)
									}
									onDoubleClick={(e) =>
										handleHandleDblClick(e, p.id)
									}
									onClick={(e) => e.stopPropagation()}
									onMouseEnter={() => setHoveredId(p.id)}
									onMouseLeave={() => setHoveredId(null)}
								/>
								{/* Visible handle circle */}
								<circle
									cx={cx}
									cy={cy}
									r={isHov ? HANDLE_R + 2 : HANDLE_R}
									fill={CONF_STROKE}
									stroke="#fff"
									strokeWidth={2}
									style={{
										pointerEvents: "none",
										transition: "r 0.1s",
									}}
								/>
								{isHov && (
									<text
										x={cx}
										y={cy - HANDLE_R - 5}
										textAnchor="middle"
										fontSize={11}
										fill={CONF_STROKE}
										fontWeight={600}
										style={{ pointerEvents: "none" }}
									>
										{p.confidence.toFixed(2)}
									</text>
								)}
							</g>
						);
					})}
				</svg>
			</div>
		</div>
	);
}
