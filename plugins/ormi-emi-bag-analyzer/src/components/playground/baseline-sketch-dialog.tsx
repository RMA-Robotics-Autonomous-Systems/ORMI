"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import type { TimeSeriesPoint } from "../../bag-reader/bag-types";
import type { DrawnBaselinePoint } from "../../algorithms";
import { TimelineScrubber } from "./timeline-scrubber";

// ── SVG layout constants ──────────────────────────────────────────────────

const PAD_L = 55;
const PAD_R = 20;
const PAD_T = 15;
const PAD_B = 35;
const SVG_W = 1000;
const SVG_H = 320;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

const MAX_SIGNAL_PTS = 4000;
const HANDLE_R = 8;
/** Pixel radius within which a pointerdown snaps to an existing handle. */
const SNAP_PX = 14;

// ── Window-aware coordinate helpers ──────────────────────────────────────
// winStart/winEnd are nanoseconds — the currently visible time window.

function toSvgX(tsNs: number, winStart: number, winEnd: number): number {
	const span = Math.max(winEnd - winStart, 1);
	return PAD_L + ((tsNs - winStart) / span) * PLOT_W;
}

function toSvgY(val: number, vmin: number, vmax: number): number {
	return PAD_T + (1 - (val - vmin) / Math.max(vmax - vmin, 1e-9)) * PLOT_H;
}

function fromSvgX(px: number, winStart: number, winEnd: number): number {
	const span = Math.max(winEnd - winStart, 1);
	return winStart + ((px - PAD_L) / PLOT_W) * span;
}

function fromSvgY(py: number, vmin: number, vmax: number): number {
	return vmin + (1 - (py - PAD_T) / PLOT_H) * (vmax - vmin);
}

function fmtTime(ns: number): string {
	const s = ns / 1e9;
	if (s >= 120) return `${Math.round(s / 60)}m`;
	return `${Math.round(s)}s`;
}

// ── Component ─────────────────────────────────────────────────────────────

export interface BaselineSketchDialogProps {
	open: boolean;
	/** The raw signal series (same array passed to runAutoLabel). */
	series: TimeSeriesPoint[];
	/** Previously confirmed sketch handles — restores state when dialog reopens. */
	initialHandles?: DrawnBaselinePoint[];
	onConfirm: (baseline: DrawnBaselinePoint[]) => void;
	onCancel: () => void;
}

export function BaselineSketchDialog({
	open,
	series,
	initialHandles,
	onConfirm,
	onCancel,
}: BaselineSketchDialogProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [handles, setHandles] = useState<DrawnBaselinePoint[]>([]);
	const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
	const [timeRange, setTimeRange] = useState<[number, number]>([0, 1]);
	/** Manual double-tap detection (pointerdown suppresses dblclick). */
	const lastTapRef = useRef<{ idx: number; time: number } | null>(null);

	// ── Derived signal metrics (stable while series doesn't change) ───────
	const { t0, duration, vmin, vmax } = useMemo(() => {
		if (series.length === 0) {
			return { t0: 0, duration: 1e9, vmin: 0, vmax: 1 };
		}
		const t0 = series[0]!.timestamp;
		const duration = series[series.length - 1]!.timestamp - t0;
		const vals = series.map((p) => p.value);
		const vmin_raw = Math.min(...vals);
		const vmax_raw = Math.max(...vals);
		const vpad = Math.max((vmax_raw - vmin_raw) * 0.05, 1);
		return { t0, duration, vmin: vmin_raw - vpad, vmax: vmax_raw + vpad };
	}, [series]);

	// ── Initialise handles + window when dialog opens ─────────────────────
	useEffect(() => {
		if (!open || series.length === 0) return;
		// Restore previous sketch if available
		if (initialHandles && initialHandles.length >= 2) {
			setHandles(initialHandles);
			setTimeRange([0, duration]);
			setDraggingIdx(null);
			return;
		}
		// Default: flat line at median
		const sorted = series.map((p) => p.value).sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)]!;
		setHandles([
			{ tsNs: 0, value: median },
			{ tsNs: duration, value: median },
		]);
		setTimeRange([0, duration]);
		setDraggingIdx(null);
	}, [open, series, duration, initialHandles]);

	// ── Visible window (destructured for stable deps) ─────────────────────
	const [winStart, winEnd] = timeRange;

	// ── Window-sampled signal path ────────────────────────────────────────
	const signalPath = useMemo(() => {
		if (series.length === 0) return "";
		const visible = series.filter(
			(p) => p.timestamp - t0 >= winStart && p.timestamp - t0 <= winEnd,
		);
		const step = Math.max(1, Math.floor(visible.length / MAX_SIGNAL_PTS));
		const sampled = visible.filter((_, i) => i % step === 0);
		if (sampled.length === 0) return "";
		return sampled
			.map((p, i) => {
				const x = toSvgX(p.timestamp - t0, winStart, winEnd).toFixed(1);
				const y = toSvgY(p.value, vmin, vmax).toFixed(1);
				return `${i === 0 ? "M" : "L"}${x},${y}`;
			})
			.join(" ");
	}, [series, t0, vmin, vmax, winStart, winEnd]);

	// ── Window-aware baseline paths ───────────────────────────────────────
	const sortedHandles = useMemo(
		() => [...handles].sort((a, b) => a.tsNs - b.tsNs),
		[handles],
	);

	const baselinePath = useMemo(() => {
		if (sortedHandles.length === 0) return "";
		return sortedHandles
			.map((h, i) => {
				const x = toSvgX(h.tsNs, winStart, winEnd).toFixed(1);
				const y = toSvgY(h.value, vmin, vmax).toFixed(1);
				return `${i === 0 ? "M" : "L"}${x},${y}`;
			})
			.join(" ");
	}, [sortedHandles, winStart, winEnd, vmin, vmax]);

	const fillPath = useMemo(() => {
		if (sortedHandles.length < 2) return "";
		const first = sortedHandles[0]!;
		const last = sortedHandles[sortedHandles.length - 1]!;
		const bottom = (SVG_H - PAD_B).toFixed(1);
		return (
			`${baselinePath}` +
			` L${toSvgX(last.tsNs, winStart, winEnd).toFixed(1)},${bottom}` +
			` L${toSvgX(first.tsNs, winStart, winEnd).toFixed(1)},${bottom} Z`
		);
	}, [baselinePath, sortedHandles, winStart, winEnd]);

	// ── Axis ticks (window-relative) ──────────────────────────────────────
	const yTicks = useMemo(() => {
		return Array.from({ length: 6 }, (_, i) => {
			const val = vmin + (i / 5) * (vmax - vmin);
			return { val, y: toSvgY(val, vmin, vmax) };
		});
	}, [vmin, vmax]);

	const xTicks = useMemo(() => {
		return Array.from({ length: 9 }, (_, i) => {
			const tsNs = winStart + (i / 8) * (winEnd - winStart);
			return { label: fmtTime(tsNs), x: toSvgX(tsNs, winStart, winEnd) };
		});
	}, [winStart, winEnd]);

	// ── Pointer → data coordinate transform (window-aware) ───────────────
	const svgPosToData = useCallback(
		(e: React.PointerEvent) => {
			const svg = svgRef.current;
			if (!svg) return null;
			const rect = svg.getBoundingClientRect();
			const scaleX = SVG_W / rect.width;
			const scaleY = SVG_H / rect.height;
			const px = (e.clientX - rect.left) * scaleX;
			// Clamp py to the plot area so handles can't escape below/above the chart.
			const py = Math.max(
				PAD_T,
				Math.min(PAD_T + PLOT_H, (e.clientY - rect.top) * scaleY),
			);
			return {
				px,
				py,
				tsNs: Math.max(
					0,
					Math.min(duration, fromSvgX(px, winStart, winEnd)),
				),
				value: fromSvgY(py, vmin, vmax),
			};
		},
		[winStart, winEnd, duration, vmin, vmax],
	);

	// ── Pointer events ────────────────────────────────────────────────────
	const removeHandle = useCallback((idx: number) => {
		setHandles((prev) => {
			if (prev.length <= 2) return prev;
			return prev.filter((_, i) => i !== idx);
		});
	}, []);

	const onPointerDown = useCallback(
		(e: React.PointerEvent<SVGSVGElement>) => {
			e.preventDefault();
			const pos = svgPosToData(e);
			if (!pos) return;

			// Snap to nearest visible handle within SNAP_PX
			const idx = handles.findIndex((h) => {
				const dx = toSvgX(h.tsNs, winStart, winEnd) - pos.px;
				const dy = toSvgY(h.value, vmin, vmax) - pos.py;
				return Math.sqrt(dx * dx + dy * dy) <= SNAP_PX;
			});

			if (idx >= 0) {
				// Manual double-tap: same handle tapped twice within 300 ms → remove.
				const now = Date.now();
				const last = lastTapRef.current;
				if (last && last.idx === idx && now - last.time < 300) {
					lastTapRef.current = null;
					removeHandle(idx);
					return;
				}
				lastTapRef.current = { idx, time: now };
				e.currentTarget.setPointerCapture(e.pointerId);
				setDraggingIdx(idx);
			} else {
				lastTapRef.current = null;
				setHandles((prev) =>
					[...prev, { tsNs: pos.tsNs, value: pos.value }].sort(
						(a, b) => a.tsNs - b.tsNs,
					),
				);
			}
		},
		[handles, winStart, winEnd, vmin, vmax, svgPosToData, removeHandle],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent<SVGSVGElement>) => {
			if (draggingIdx === null) return;
			const pos = svgPosToData(e);
			if (!pos) return;
			setHandles((prev) => {
				const next = [...prev];
				next[draggingIdx] = { tsNs: pos.tsNs, value: pos.value };
				return next;
			});
		},
		[draggingIdx, svgPosToData],
	);

	const onPointerUp = useCallback(() => {
		if (draggingIdx !== null) {
			setHandles((prev) => [...prev].sort((a, b) => a.tsNs - b.tsNs));
			setDraggingIdx(null);
		}
	}, [draggingIdx]);

	// ── Export / Import ───────────────────────────────────────────────────
	const importInputRef = useRef<HTMLInputElement>(null);

	const handleExport = useCallback(() => {
		const json = JSON.stringify(sortedHandles, null, 2);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "sketch.json";
		a.click();
		URL.revokeObjectURL(url);
	}, [sortedHandles]);

	const handleImport = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (ev) => {
				try {
					const parsed: unknown = JSON.parse(
						ev.target?.result as string,
					);
					if (
						!Array.isArray(parsed) ||
						!parsed.every(
							(p) =>
								typeof p === "object" &&
								p !== null &&
								typeof (p as Record<string, unknown>).tsNs ===
									"number" &&
								typeof (p as Record<string, unknown>).value ===
									"number",
						)
					) {
						alert(
							"Invalid sketch file: expected an array of {tsNs, value} objects.",
						);
						return;
					}
					setHandles(
						(parsed as DrawnBaselinePoint[]).sort(
							(a, b) => a.tsNs - b.tsNs,
						),
					);
				} catch {
					alert("Could not parse sketch file.");
				}
			};
			reader.readAsText(file);
			// Reset so the same file can be re-imported
			e.target.value = "";
		},
		[],
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onCancel();
			}}
		>
			<DialogContent
				size="large"
				showCloseButton
				className="w-[min(95vw,1080px)] max-w-[min(95vw,1080px)] flex flex-col gap-4"
			>
				<DialogHeader>
					<DialogTitle>Sketch the signal</DialogTitle>
					<DialogDescription>
						Draw a simplified version of the signal line. Points
						where the actual signal rises above your sketch become
						anomaly confidence. Click to add &middot; Drag to move
						&middot; Double-click to remove.
					</DialogDescription>
				</DialogHeader>

				{/* SVG canvas */}
				<svg
					ref={svgRef}
					viewBox={`0 0 ${SVG_W} ${SVG_H}`}
					className="w-full border rounded bg-muted/20 cursor-crosshair select-none touch-none"
					style={{ aspectRatio: `${SVG_W} / ${SVG_H}` }}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				>
					{/* Y-axis grid + labels */}
					{yTicks.map(({ val, y }) => (
						<g key={val}>
							<line
								x1={PAD_L}
								y1={y}
								x2={SVG_W - PAD_R}
								y2={y}
								stroke="currentColor"
								strokeOpacity={0.08}
							/>
							<text
								x={PAD_L - 4}
								y={y + 4}
								textAnchor="end"
								fontSize={10}
								fill="currentColor"
								fillOpacity={0.5}
							>
								{val.toFixed(0)}
							</text>
						</g>
					))}

					{/* X-axis grid + labels */}
					{xTicks.map(({ label, x }, i) => (
						<g key={i}>
							<line
								x1={x}
								y1={PAD_T}
								x2={x}
								y2={SVG_H - PAD_B}
								stroke="currentColor"
								strokeOpacity={0.08}
							/>
							<text
								x={x}
								y={SVG_H - PAD_B + 14}
								textAnchor="middle"
								fontSize={10}
								fill="currentColor"
								fillOpacity={0.5}
							>
								{label}
							</text>
						</g>
					))}

					{/* Clip region for signal */}
					<clipPath id="bsd-plot-clip">
						<rect
							x={PAD_L}
							y={PAD_T}
							width={PLOT_W}
							height={PLOT_H}
						/>
					</clipPath>

					{/* Raw signal */}
					<path
						d={signalPath}
						fill="none"
						stroke="rgba(234,179,8,0.7)"
						strokeWidth={1}
						clipPath="url(#bsd-plot-clip)"
					/>

					{/* Sketch fill (area above sketch = anomaly zone) */}
					{fillPath && (
						<path
							d={fillPath}
							fill="rgba(249,115,22,0.07)"
							clipPath="url(#bsd-plot-clip)"
						/>
					)}

					{/* Sketch polyline */}
					{baselinePath && (
						<path
							d={baselinePath}
							fill="none"
							stroke="#f97316"
							strokeWidth={2}
							strokeLinejoin="round"
							strokeLinecap="round"
						/>
					)}

					{/* Handles — only those visible in the current window */}
					{handles.map((h, i) => {
						const x = toSvgX(h.tsNs, winStart, winEnd);
						if (
							x < PAD_L - HANDLE_R ||
							x > SVG_W - PAD_R + HANDLE_R
						)
							return null;
						return (
							<circle
								key={i}
								cx={x}
								cy={toSvgY(h.value, vmin, vmax)}
								r={HANDLE_R}
								fill="#f97316"
								stroke="white"
								strokeWidth={2}
								style={{
									cursor:
										draggingIdx === i ? "grabbing" : "grab",
								}}
							/>
						);
					})}

					{/* Legend */}
					<g>
						<line
							x1={PAD_L + 4}
							y1={PAD_T + 10}
							x2={PAD_L + 20}
							y2={PAD_T + 10}
							stroke="rgba(234,179,8,0.7)"
							strokeWidth={1}
						/>
						<text
							x={PAD_L + 24}
							y={PAD_T + 14}
							fontSize={10}
							fill="currentColor"
							fillOpacity={0.6}
						>
							signal
						</text>
						<line
							x1={PAD_L + 65}
							y1={PAD_T + 10}
							x2={PAD_L + 81}
							y2={PAD_T + 10}
							stroke="#f97316"
							strokeWidth={2}
						/>
						<text
							x={PAD_L + 85}
							y={PAD_T + 14}
							fontSize={10}
							fill="currentColor"
							fillOpacity={0.6}
						>
							sketch ({handles.length} pts)
						</text>
					</g>
				</svg>

				{/* Timeline scrubber — pan/zoom the view window */}
				<div className="px-0.5">
					<TimelineScrubber
						duration={duration}
						value={timeRange}
						onChange={setTimeRange}
					/>
				</div>

				<DialogFooter>
					{/* Hidden file input for import */}
					<input
						ref={importInputRef}
						type="file"
						accept=".json"
						className="hidden"
						onChange={handleImport}
					/>
					<Button
						variant="outline"
						onClick={handleExport}
						disabled={handles.length < 2}
					>
						Export sketch
					</Button>
					<Button
						variant="outline"
						onClick={() => importInputRef.current?.click()}
					>
						Import sketch
					</Button>
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						onClick={() => onConfirm(sortedHandles)}
						disabled={handles.length < 2}
					>
						Confirm &amp; auto-label
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
