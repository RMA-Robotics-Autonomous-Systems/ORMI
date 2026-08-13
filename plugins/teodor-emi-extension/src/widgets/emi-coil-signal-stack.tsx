"use client";

/**
 * W1 — the signal stack.
 *
 * Five coils, one shared scale, one time axis, and every decision the detector
 * made drawn where it was made. This is the panel the rest of the cockpit is
 * judged against: if the threshold slider does not answer here within a frame,
 * nothing downstream is worth building.
 *
 * Three things it does that a generic chart widget cannot:
 *
 * - **One vertical scale across five panels**, so a quiet coil looks quiet.
 * - **Per-coil moving thresholds.** Under the MAD detector each coil is
 *   compared against its own rolling curve, and the curve drawn on a panel is
 *   sampled from the same array the detector read.
 * - **Links between panels.** A pairing is a claim about two peaks on two
 *   coils, so it is drawn as a curve from one to the other.
 */

import { useCallback, useEffect, useRef } from "react";
import { ActivityIcon } from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Button } from "@workspace/ui/components/button";
import {
	drawSignalStack,
	drawStackOverlay,
	panelHeights,
	type StackLayout,
} from "../charts/signal-stack";
import { PAD } from "../charts/canvas-chart";
import { useEmiTheme } from "../charts/emi-theme";
import {
	detectionKey,
	toggleEmiSelection,
	useEmiCursor,
	useEmiSelection,
	useEmiDisplayState,
	useEmiView,
	type EmiDisplay,
} from "../state/atoms";
import { useEmiReplay } from "../state/use-emi-run";
import {
	EmiPanelFrame,
	useElementSize,
	useHostElement,
} from "./emi-panel-frame";
import { useTimeGestures } from "./use-time-gestures";
import { EmiTimeTransport } from "./emi-time-transport";
import { useRunExtent } from "./use-run-extent";

/** Settings for the signal stack. */
interface SignalStackSettings extends Record<string, unknown> {
	title: string;
}

/** A hover counts as pointing at a detection within this many pixels. */
const HIT_PX = 8;

/** Toggle chips that write the shared display state. */
const TOGGLES: Array<{ key: keyof EmiDisplay; label: string; hint: string }> = [
	{ key: "logScale", label: "log", hint: "Logarithmic vertical scale" },
	{
		key: "showUnfiltered",
		label: "raw",
		hint: "Draw the unfiltered channel behind the filtered one",
	},
	{
		key: "showRecorded",
		label: "recorded",
		hint: "Detections the robot reported on the day",
	},
	{
		key: "showReplayed",
		label: "replayed",
		hint: "Detections these parameters produce",
	},
	{ key: "showLinks", label: "links", hint: "Cross-coil pairings" },
];

/**
 * The stack.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const CoilSignalStack = (props: SignalStackSettings) => {
	const { run, result, params, stale, snapshot } = useEmiReplay();
	const [display, setDisplay] = useEmiDisplayState();
	const cursor = useEmiCursor();
	const selection = useEmiSelection();

	const [hostRef, host] = useHostElement<HTMLDivElement>();
	const theme = useEmiTheme(host);
	const size = useElementSize(host);

	const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const layoutRef = useRef<StackLayout | null>(null);
	const panelDepsRef = useRef<unknown[]>([]);

	const ncoil = run?.ncoil ?? 0;
	const extent = useRunExtent(run);
	// Read here as well as through the gesture hook: the hit tolerance is in
	// seconds per pixel of the *visible* window, and `resolve` is handed to the
	// hook, so it cannot read the window back out of it.
	const view = useEmiView();
	const vt0 = view ? view.t0 : extent[0];
	const vt1 = view ? view.t1 : extent[1];

	// Hit-test on the frame the pointer settled on, not on every move: the
	// detection list is scanned per call.
	const resolve = useCallback(
		(t: number, offsetY: number) => {
			if (!run || !result || size.width <= 0) {
				return { det: -1, target: -1 };
			}
			const heights = panelHeights(size.height, run.ncoil);
			const ci = Math.min(
				run.ncoil - 1,
				Math.max(0, Math.floor(offsetY / Math.max(1, heights.coil))),
			);
			// From the *visible* window and the *plot* width, both of which the
			// pointer's time already came from. Using the whole run's extent
			// makes the tolerance grow as the user zooms in — at full zoom it
			// exceeds the visible span, so every hover matches a detection that
			// is nowhere near the pointer.
			const plotW = Math.max(1, size.width - PAD.l - PAD.r);
			const tol = ((vt1 - vt0) / plotW) * HIT_PX;

			// One pass: the index is what the cursor carries, so recovering it
			// afterwards with `indexOf` is both a second scan and wrong if two
			// detections ever compare equal.
			let best = -1;
			let bestD = tol;
			for (let i = 0; i < result.geoNew.length; i++) {
				const d = result.geoNew[i]!;
				if (d.ci !== ci) continue;
				const dd = Math.abs(d.t - t);
				if (dd <= bestD) {
					bestD = dd;
					best = i;
				}
			}
			return {
				det: best,
				target: best >= 0 ? result.geoNew[best]!.targetId : -1,
			};
		},
		[result, run, size.height, size.width, vt0, vt1],
	);

	/**
	 * Clicking a peak picks that detection, and only that detection.
	 *
	 * The mark under the pointer, not the chain it belongs to. Picking is a
	 * manual tool — the operator is choosing what goes in the file — and a click
	 * that quietly adds three more marks elsewhere in the stack is the tool
	 * deciding instead. A whole finding is one click per coil, or one click on
	 * its barycentre on the map, which exports as the averaged position it is.
	 */
	const onPick = useCallback(
		(det: number) => {
			const d = result?.geoNew[det];
			if (d) toggleEmiSelection([detectionKey(d)]);
		},
		[result],
	);

	const gestures = useTimeGestures({
		host,
		fullRange: extent,
		enabled: Boolean(run && run.n > 0),
		resolve,
		onPick,
	});

	// One effect for both layers, because they share a layout: the panels are
	// redrawn only when one of their inputs changed, while the overlay follows
	// the pointer. Splitting this into two effects would need the layout in
	// state, and setting state from an effect at pointer rate is the loop this
	// avoids.
	useEffect(() => {
		if (!run || !result || run.n === 0 || size.width < 80) return;
		const opts = {
			run,
			result,
			params,
			theme,
			display,
			view: [vt0, vt1] as [number, number],
			height: size.height,
			width: size.width,
		};

		const deps: unknown[] = [
			run,
			result,
			params,
			theme,
			display,
			vt0,
			vt1,
			size.width,
			size.height,
			snapshot.rev,
		];
		const changed =
			deps.length !== panelDepsRef.current.length ||
			deps.some((d, i) => d !== panelDepsRef.current[i]);

		if (changed) {
			panelDepsRef.current = deps;
			layoutRef.current = drawSignalStack(canvasRefs.current, opts);
		}

		const layout = layoutRef.current;
		const overlay = overlayRef.current;
		if (layout && overlay) {
			drawStackOverlay(overlay, {
				...opts,
				layout,
				cursorT: cursor?.t ?? null,
				picked: selection,
			});
		}
	}, [
		run,
		result,
		params,
		theme,
		display,
		vt0,
		vt1,
		size.width,
		size.height,
		cursor,
		selection,
		snapshot.rev,
	]);

	const heights = panelHeights(size.height, Math.max(1, ncoil));

	return (
		<EmiPanelFrame
			title={props.title}
			snapshot={snapshot}
			stale={stale}
			toolbar={
				<div className="flex flex-wrap gap-1">
					{TOGGLES.map((t) => (
						<Button
							key={t.key}
							size="sm"
							variant={display[t.key] ? "secondary" : "ghost"}
							title={t.hint}
							className="h-6 px-2 text-[11px]"
							onClick={() =>
								setDisplay({
									...display,
									[t.key]: !display[t.key],
								})
							}
						>
							{t.label}
						</Button>
					))}
					<EmiTimeTransport
						controls={gestures.controls}
						full={gestures.full}
					/>
				</div>
			}
		>
			<div
				ref={hostRef}
				className="relative h-full w-full cursor-crosshair touch-none select-none"
				{...gestures.handlers}
			>
				{Array.from({ length: ncoil }, (_, c) => (
					<canvas
						key={c}
						ref={(el) => {
							canvasRefs.current[c] = el;
						}}
						style={{
							display: "block",
							height:
								c === ncoil - 1
									? heights.coilLast
									: heights.coil,
						}}
					/>
				))}
				{/* Above the panels and inert, so the gestures below still see
				    every event. */}
				<canvas
					ref={overlayRef}
					className="pointer-events-none absolute inset-0"
				/>
			</div>
		</EmiPanelFrame>
	);
};

/**
 * Widget definition for the signal stack.
 *
 * @returns The definition.
 */
export function EmiCoilSignalStackDefinition(): WidgetDefinition<SignalStackSettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-coil-signal-stack",
		name: "EMI coil signals",
		description:
			"One panel per coil on a shared scale, with thresholds and detections.",
		titleProp: "title",
		icon: <ActivityIcon />,
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
			},
		},
		uischema: layout,
		data: { title: "EMI coil signals" },
		// Module-level reference (pattern 10): the dashboard re-invokes this
		// factory on every render, and an inline arrow here would remount the
		// widget each time — losing the view, the layout and the canvases.
		Component: CoilSignalStack,
	};
}
