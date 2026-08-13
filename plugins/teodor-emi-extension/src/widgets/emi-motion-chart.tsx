"use client";

/**
 * W2 — ground speed and turn rate, on the signal stack's time axis.
 *
 * The question it answers is not "how fast was it going" but "was this stretch
 * a survey at all". A burst of detections while the robot was parked is the same
 * ground measured again, not new coverage — and a burst while the rake was
 * rotating is a burst the cross-coil geometry cannot vouch for. Both are visible
 * here and nowhere else.
 *
 * Shares the window and the playhead with W1 through the same atoms, so the two
 * panels are one picture even when they are on different parts of a dashboard.
 */

import { useEffect, useRef } from "react";
import { GaugeIcon } from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import {
	drawMotionChart,
	drawMotionOverlay,
	MIN_TOTAL_H,
	type MotionLayout,
} from "../charts/motion-chart";
import { useEmiTheme } from "../charts/emi-theme";
import { useEmiCursor } from "../state/atoms";
import { useEmiReplay } from "../state/use-emi-run";
import {
	EmiPanelFrame,
	useElementSize,
	useHostElement,
} from "./emi-panel-frame";
import { useTimeGestures } from "./use-time-gestures";
import { useRunExtent } from "./use-run-extent";

/** Settings for the motion chart. */
interface MotionSettings extends Record<string, unknown> {
	title: string;
}

/** Percentage, or an em dash when there is nothing to divide by. */
const pct = (v: number): string =>
	Number.isFinite(v) ? `${Math.round(100 * v)}%` : "—";

/**
 * The motion panels.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const MotionChart = (props: MotionSettings) => {
	const { run, result, stale, snapshot } = useEmiReplay();
	const cursor = useEmiCursor();

	const [hostRef, host] = useHostElement<HTMLDivElement>();
	const theme = useEmiTheme(host);
	const size = useElementSize(host);

	const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const layoutRef = useRef<MotionLayout | null>(null);
	const depsRef = useRef<unknown[]>([]);
	const noteRef = useRef<HTMLParagraphElement>(null);

	const extent = useRunExtent(run);
	const gestures = useTimeGestures({
		host,
		fullRange: extent,
		enabled: Boolean(run && run.n > 0),
	});
	const { vt0, vt1 } = gestures;

	useEffect(() => {
		if (
			!run ||
			!result ||
			run.n === 0 ||
			size.width < 80 ||
			size.height < MIN_TOTAL_H
		) {
			return;
		}
		const opts = {
			run,
			result,
			theme,
			view: [vt0, vt1] as [number, number],
			width: size.width,
			height: size.height,
		};

		const deps: unknown[] = [
			run,
			result,
			theme,
			vt0,
			vt1,
			size.width,
			size.height,
			snapshot.rev,
		];
		const changed =
			deps.length !== depsRef.current.length ||
			deps.some((d, i) => d !== depsRef.current[i]);

		if (changed) {
			depsRef.current = deps;
			layoutRef.current = drawMotionChart(canvasRefs.current, opts);

			// Written straight into the DOM rather than through state: this is
			// a caption on a canvas repaint, and routing it through a render
			// would make every pointer-driven redraw a React update too.
			const layout = layoutRef.current;
			const note = noteRef.current;
			if (layout && note) {
				const { shares, detsHere, detsStill } = layout;
				note.textContent =
					`Over the visible ${(vt1 - vt0).toFixed(0)} s: ` +
					`${pct(shares.moving)} surveying, ${pct(shares.turning)} turning, ` +
					`${pct(shares.stationary)} stationary. ` +
					(detsHere
						? `${detsStill} of ${detsHere} detections here were raised while the robot was not moving` +
							(detsStill
								? " — those are the same ground measured again, not new coverage."
								: ".")
						: "No detections in this window.");
			}
		}

		const layout = layoutRef.current;
		const overlay = overlayRef.current;
		if (layout && overlay) {
			drawMotionOverlay(overlay, opts, layout, cursor?.t ?? null);
		}
	}, [
		run,
		result,
		theme,
		vt0,
		vt1,
		size.width,
		size.height,
		cursor,
		snapshot.rev,
	]);

	return (
		<EmiPanelFrame title={props.title} snapshot={snapshot} stale={stale}>
			<div className="flex h-full w-full flex-col">
				<div
					ref={hostRef}
					className="relative min-h-0 flex-1 cursor-crosshair touch-none select-none"
					{...gestures.handlers}
				>
					{[0, 1].map((k) => (
						<canvas
							key={k}
							ref={(el) => {
								canvasRefs.current[k] = el;
							}}
							style={{ display: "block" }}
						/>
					))}
					<canvas
						ref={overlayRef}
						className="pointer-events-none absolute inset-0"
					/>
				</div>
				<p
					ref={noteRef}
					className="shrink-0 px-2 pb-1 text-[11px] leading-tight text-muted-foreground"
				/>
			</div>
		</EmiPanelFrame>
	);
};

/**
 * Widget definition for the motion chart.
 *
 * @returns The definition.
 */
export function EmiMotionChartDefinition(): WidgetDefinition<MotionSettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-motion",
		name: "EMI motion",
		description:
			"Ground speed and turn rate on the signal stack's time axis.",
		titleProp: "title",
		icon: <GaugeIcon />,
		schema: {
			type: "object",
			properties: { title: { type: "string", title: "Title" } },
		},
		uischema: layout,
		data: { title: "EMI motion" },
		Component: MotionChart,
	};
}
