"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

export interface TimelineEvent {
	/** Nanoseconds from bag start */
	t: number;
	color: string;
}

interface TimelineScrubberProps {
	/** Total bag duration in nanoseconds */
	duration: number;
	/** Current visible window [start, end] in nanoseconds */
	value: [number, number];
	onChange: (range: [number, number]) => void;
	events?: TimelineEvent[];
	className?: string;
}

const TRACK_H = 16;
const HANDLE_W = 8;
const TICK_Y1 = 2;
const TICK_Y2 = TRACK_H + 10;
const SVG_H = TRACK_H + 24; // track + labels + ticks

function fmtSec(ns: number): string {
	const s = ns / 1e9;
	const m = Math.floor(s / 60);
	const sec = (s % 60).toFixed(1);
	return m > 0 ? `${m}m${sec}s` : `${sec}s`;
}

export function TimelineScrubber({
	duration,
	value,
	onChange,
	events = [],
	className = "",
}: TimelineScrubberProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(800);

	// Track container width with ResizeObserver
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width);
		});
		ro.observe(el);
		setWidth(el.clientWidth);
		return () => ro.disconnect();
	}, []);

	// Drag state
	const drag = useRef<{
		mode: "start" | "end" | "pan";
		startX: number;
		startRange: [number, number];
	} | null>(null);

	const nsToX = useCallback(
		(ns: number) => (duration <= 0 ? 0 : (ns / duration) * width),
		[duration, width],
	);

	const xToNs = useCallback(
		(x: number) => (width <= 0 ? 0 : (x / width) * duration),
		[duration, width],
	);

	const clamp = (v: number, min: number, max: number) =>
		Math.max(min, Math.min(max, v));

	const onPointerDown = useCallback(
		(e: React.PointerEvent, mode: "start" | "end" | "pan") => {
			e.currentTarget.setPointerCapture(e.pointerId);
			drag.current = {
				mode,
				startX: e.clientX,
				startRange: [...value] as [number, number],
			};
		},
		[value],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!drag.current) return;
			const dx = e.clientX - drag.current.startX;
			const dNs = xToNs(dx);
			const [s0, e0] = drag.current.startRange;
			const minWindow = Math.max(duration * 0.001, 1e8); // at least 0.1 s

			if (drag.current.mode === "start") {
				const newStart = clamp(s0 + dNs, 0, e0 - minWindow);
				onChange([newStart, e0]);
			} else if (drag.current.mode === "end") {
				const newEnd = clamp(e0 + dNs, s0 + minWindow, duration);
				onChange([s0, newEnd]);
			} else {
				// pan: move both handles together
				const newSpan = e0 - s0;
				const newStart = clamp(s0 + dNs, 0, duration - newSpan);
				onChange([newStart, newStart + newSpan]);
			}
		},
		[xToNs, onChange, duration],
	);

	const onPointerUp = useCallback(() => {
		drag.current = null;
	}, []);

	const [startNs, endNs] = value;
	const x0 = nsToX(startNs);
	const x1 = nsToX(endNs);
	const trackY = SVG_H - TRACK_H - 8;

	return (
		<div ref={containerRef} className={`w-full select-none ${className}`}>
			<svg
				width={width}
				height={SVG_H}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerLeave={onPointerUp}
				style={{ display: "block" }}
			>
				{/* Background track */}
				<rect
					x={0}
					y={trackY}
					width={width}
					height={TRACK_H}
					rx={3}
					fill="var(--color-muted, #e2e8f0)"
				/>

				{/* Event ticks */}
				{events.map((ev, i) => {
					const x = nsToX(ev.t);
					return (
						<line
							key={i}
							x1={x}
							x2={x}
							y1={TICK_Y1}
							y2={TICK_Y2}
							stroke={ev.color}
							strokeWidth={1.5}
							opacity={0.75}
						/>
					);
				})}

				{/* Selected region */}
				<rect
					x={x0}
					y={trackY}
					width={Math.max(0, x1 - x0)}
					height={TRACK_H}
					fill="var(--color-primary, #3b82f6)"
					opacity={0.35}
					style={{ cursor: "grab" }}
					onPointerDown={(e) => onPointerDown(e, "pan")}
				/>

				{/* Left handle */}
				<rect
					x={x0 - HANDLE_W / 2}
					y={trackY - 4}
					width={HANDLE_W}
					height={TRACK_H + 8}
					rx={3}
					fill="var(--color-primary, #3b82f6)"
					style={{ cursor: "ew-resize" }}
					onPointerDown={(e) => onPointerDown(e, "start")}
				/>

				{/* Right handle */}
				<rect
					x={x1 - HANDLE_W / 2}
					y={trackY - 4}
					width={HANDLE_W}
					height={TRACK_H + 8}
					rx={3}
					fill="var(--color-primary, #3b82f6)"
					style={{ cursor: "ew-resize" }}
					onPointerDown={(e) => onPointerDown(e, "end")}
				/>

				{/* Time labels */}
				<text
					x={Math.max(0, x0)}
					y={trackY - 6}
					fontSize={10}
					fill="var(--color-foreground, #1a1a1a)"
					textAnchor={x0 < 40 ? "start" : "middle"}
				>
					{fmtSec(startNs)}
				</text>
				<text
					x={Math.min(width, x1)}
					y={trackY - 6}
					fontSize={10}
					fill="var(--color-foreground, #1a1a1a)"
					textAnchor={x1 > width - 40 ? "end" : "middle"}
				>
					{fmtSec(endNs)}
				</text>

				{/* Duration label (right edge) */}
				<text
					x={width - 2}
					y={trackY + TRACK_H + 12}
					fontSize={9}
					fill="var(--color-muted-foreground, #6b7280)"
					textAnchor="end"
				>
					{fmtSec(duration)}
				</text>
			</svg>
		</div>
	);
}
