"use client";

/**
 * The chrome every EMI panel shares.
 *
 * Three jobs, all of which would otherwise be repeated in ten widgets:
 *
 * - **Gating.** An EMI panel with no source is not an empty chart, it is a
 *   panel that has nothing to say — and an empty chart reads as "no detections",
 *   which is a different and much worse claim. The standard `DatasourceGate`
 *   affordance is reused rather than reinvented, with the two states mapped
 *   honestly: nothing wired is `offline`, wired but not yet sampled is
 *   `connecting`.
 * - **Staleness.** The tuning parameters are read through `useDeferredValue`,
 *   so while a slider is moving the picture is one step behind the rail. Saying
 *   so is the difference between "the chart is thinking" and "the chart is
 *   wrong".
 * - **Measuring the box.** Canvas panels need their size in CSS pixels, and
 *   the dashboard resizes them.
 */

import { useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { DatasourceGate } from "@workspace/ui/components/datasource-gate";
import { cn } from "@workspace/ui/lib/utils";
import type { EmiSnapshot } from "../state/emi-store";
import { useReplayProblems } from "../datasource/replay-status";

/** Size of a measured element, CSS pixels. */
export interface ElementSize {
	width: number;
	height: number;
}

/**
 * A host element: the ref callback to attach, and the element once it mounted.
 *
 * A tuple rather than an object with a `ref` field — the lint rules read any
 * such object as a ref container and flag every read of it during render.
 */
export type HostElement<T extends HTMLElement> = readonly [
	(el: T | null) => void,
	T | null,
];

/**
 * Track a host element by callback ref rather than by `useRef` alone.
 *
 * The distinction is load-bearing. A panel's body is rendered inside
 * {@link EmiPanelFrame}'s gate, so on a cold load the element does not exist —
 * the datasource is not online yet. An effect keyed on a `useRef` object never
 * re-runs when that element finally mounts, because the ref's identity never
 * changes: the observer is never attached, the measured size stays `{0, 0}`,
 * and every canvas in the cockpit renders blank while the data plainly arrives.
 *
 * A callback ref turns the element's arrival into a state change, which is what
 * both the size observer and the palette resolution need.
 *
 * @returns `[ref, element]` — the callback to attach, and the element.
 */
export function useHostElement<
	T extends HTMLElement = HTMLDivElement,
>(): HostElement<T> {
	const [element, setElement] = useState<T | null>(null);
	const ref = useCallback((el: T | null) => setElement(el), []);
	return [ref, element] as const;
}

/**
 * Track an element's content box.
 *
 * `useLayoutEffect` so the first paint has a real size rather than drawing at
 * the fallback and then again a frame later.
 *
 * @param element - The element to measure; null until it mounts.
 * @returns Its current size, `{0, 0}` until it is measured.
 */
export function useElementSize(element: HTMLElement | null): ElementSize {
	const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

	useLayoutEffect(() => {
		if (!element || typeof ResizeObserver === "undefined") return;

		const apply = () => {
			const next = {
				width: Math.round(element.clientWidth),
				height: Math.round(element.clientHeight),
			};
			setSize((prev) =>
				prev.width === next.width && prev.height === next.height
					? prev
					: next,
			);
		};
		apply();

		const ro = new ResizeObserver(apply);
		ro.observe(element);
		return () => ro.disconnect();
	}, [element]);

	return size;
}

/**
 * Health of the EMI source, in the terms the shared gate understands.
 *
 * A mission opened from storage has no datasource behind it and never will, so
 * gating it on the bundle would show "offline" over a complete survey. That is
 * the *only* exemption: a live source that goes away must still gate, or every
 * panel keeps showing the last run as though the robot were still talking —
 * which is exactly what the widget-gating rule in `AGENTS.md` exists to prevent.
 *
 * @param snapshot - The current run snapshot.
 * @returns `offline` with nothing wired, `connecting` before the first sample.
 */
export function emiHealth(
	snapshot: EmiSnapshot,
): "offline" | "connecting" | "online" {
	if (snapshot.adopted && snapshot.run && snapshot.n > 0) return "online";
	if (!snapshot.bundle) return "offline";
	if (!snapshot.run || snapshot.n === 0) return "connecting";
	return "online";
}

/** Props for {@link EmiPanelFrame}. */
export interface EmiPanelFrameProps {
	/** Widget title, used in the offline affordance. */
	title: string;
	/** Current run snapshot. */
	snapshot: EmiSnapshot;
	/** True while the drawing is behind the parameter rail. */
	stale?: boolean;
	/** Controls rendered above the body. */
	toolbar?: ReactNode;
	/**
	 * Override the gate.
	 *
	 * For the one panel whose subject is not the live source: the repeatability
	 * overlay draws the archived library, so gating it on the *current* run
	 * would blank a comparison at exactly the moment it became possible.
	 */
	health?: "offline" | "connecting" | "online";
	/** The panel itself. */
	children: ReactNode;
}

/**
 * Frame an EMI panel: gate it, label it, and give the body the rest of the box.
 *
 * @param props - Component props.
 * @returns React element.
 */
export function EmiPanelFrame(props: EmiPanelFrameProps) {
	const { title, snapshot, stale, toolbar, children } = props;
	const health = props.health ?? emiHealth(snapshot);
	const problems = useReplayProblems();

	// Name the *source*, never the widget. Falling back to the widget's own
	// title produced "Datasource 'EMI parameters' offline" — naming a panel as
	// though it were a datasource, on precisely the screen where the operator
	// is trying to work out which datasource is missing.
	const sourceTitle = snapshot.bundle?.datasourceTitle ?? "EMI";

	// A recording that refused to open is a *reason*, and it beats the generic
	// offline card. With no bundle wired there is at most one of these that
	// could apply, so the first is the one to show.
	const problem = health === "online" ? undefined : problems[0];

	return (
		// The widget's own name, as the region's accessible name. It is no
		// longer used for the offline card — naming a panel as a datasource is
		// what made that card misleading — but ten canvas panels are otherwise
		// indistinguishable to anything that cannot see them.
		<section
			aria-label={title}
			className="flex h-full w-full flex-col overflow-hidden"
		>
			{toolbar && (
				<div className="flex shrink-0 items-center gap-2 px-2 py-1">
					{toolbar}
				</div>
			)}
			<div className="relative min-h-0 flex-1">
				{problem ? (
					<EmiSourceProblem
						title={problem.title}
						message={problem.message}
						advice={problem.advice}
					/>
				) : (
					<DatasourceGate health={health} title={sourceTitle}>
						{children}
					</DatasourceGate>
				)}
				{/* A brief flash of "thinking" on every keystroke is noise; a
				    deferred recompute that is genuinely taking a moment is
				    worth saying. The delay is on the transition rather than on
				    a timer, so the distinction costs no state and no effect —
				    and the hint floats over the body rather than reserving a
				    row on panels that have no toolbar. */}
				<span
					aria-hidden={!stale}
					className={cn(
						"pointer-events-none absolute right-2 top-1 rounded bg-card/80 px-1 text-[11px] text-muted-foreground transition-opacity",
						stale ? "opacity-100 delay-150" : "opacity-0 delay-0",
					)}
				>
					recomputing…
				</span>
			</div>
		</section>
	);
}

/**
 * A recording that will not play, said in the panel.
 *
 * The standard offline card is the right affordance for "no source is wired".
 * It is the wrong one for "the source is wired and refused", which is a
 * different situation with a different next step — and the difference is
 * exactly what an operator staring at ten identical offline cards cannot work
 * out for themselves.
 *
 * @param props - The datasource title, what happened, and what to do.
 * @returns React element.
 */
function EmiSourceProblem(props: {
	title: string;
	message: string;
	advice: string;
}) {
	return (
		<div
			role="alert"
			className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-auto p-4 text-center"
		>
			<AlertTriangleIcon className="size-5 text-destructive" />
			<p className="text-xs font-medium">{props.title}</p>
			<p className="max-w-prose text-xs text-muted-foreground">
				{props.message}
			</p>
			{props.advice && (
				<p className="max-w-prose text-[11px] text-muted-foreground/80">
					{props.advice}
				</p>
			)}
		</div>
	);
}
