"use client";

/**
 * W10 — repeatability.
 *
 * Every run this session has opened, replayed at the current parameters and
 * clustered, so a detection can be asked whether it comes back.
 *
 * **The library is in memory and this session only.** Switching the replay
 * datasource to another recording archives the one it replaces, so the way to
 * build a comparison is to open the recordings one after another. Nothing is
 * persisted — a reload starts empty. Persisting it is what a mission store would
 * add, and this panel will read that without changing.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { LayersIcon } from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Button } from "@workspace/ui/components/button";
import { Slider } from "@workspace/ui/components/slider";
import { buildOverlay, drawOverlay } from "../charts/run-overlay";
import { useEmiTheme } from "../charts/emi-theme";
import { clearEmiLibrary } from "../state/emi-store";
import { useEmiReplay } from "../state/use-emi-run";
import {
	EmiPanelFrame,
	useElementSize,
	useHostElement,
} from "./emi-panel-frame";
import type { EmiRun } from "../detector/run-types";

/** Settings for the overlay. */
interface OverlaySettings extends Record<string, unknown> {
	title: string;
}

/** Default agreement radius, metres. */
const DEFAULT_RADIUS = 0.6;

/**
 * Samples of growth that force the comparison to be rebuilt.
 *
 * Replaying several whole recordings is far more expensive than the single
 * replay the rest of the cockpit shares, so a live mission folds into it at
 * intervals rather than on every commit.
 */
const REBUILD_SAMPLES = 2048;

/**
 * The overlay.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const RunOverlay = (props: OverlaySettings) => {
	const { params, stale, snapshot } = useEmiReplay();
	const [radius, setRadius] = useState(DEFAULT_RADIUS);
	const hasLibrary = snapshot.library.length > 0;

	const [hostRef, host] = useHostElement<HTMLDivElement>();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const theme = useEmiTheme(host);
	const size = useElementSize(host);

	// The current run plus everything archived, oldest last. Included even while
	// it is still growing: a mission in progress is a run like any other.
	//
	// Which runs are in the set changes only when one appears or is archived, and
	// both of those change an identity here — so this memo is correctly keyed on
	// identities alone. What it must NOT be keyed on is a counter it does not
	// read: the compiler infers dependencies from the body and drops the dead
	// read, and the memo below would then freeze on its first result.
	const runs = useMemo<EmiRun[]>(() => {
		const out: EmiRun[] = [];
		const current = snapshot.run;
		if (current && current.n > 0) out.push(current);
		for (const r of snapshot.library) if (r.n > 0) out.push(r);
		return out;
	}, [snapshot.run, snapshot.library]);

	// The growth signal, as a value the body of the memo below genuinely reads.
	// The builder hands back the *same run object* on every commit, so nothing
	// about `runs` changes as a mission records — without this the overlay would
	// be built once, over the two or three samples the first commit carried, and
	// never again. Coarsened because re-replaying every archived recording ten
	// times a second is not a budget anyone has.
	const growth = Math.floor(snapshot.n / REBUILD_SAMPLES);

	// Replaying several whole recordings is far more expensive than the single
	// replay the rest of the cockpit shares, so it is keyed on the run set, the
	// parameters and the radius — and deliberately not on the sample count, so
	// a live mission does not re-cluster every commit.
	// The radius only changes the clustering, but it is a dependency of the
	// whole rebuild — and dragging it across its range is dozens of steps. It is
	// deferred so a drag coalesces instead of re-replaying every archived run
	// per step.
	const deferredRadius = useDeferredValue(radius);
	const overlay = useMemo(() => {
		// `growth` is read here, in the body, and folded into the result. That is
		// what makes it a dependency the compiler cannot decide is dead — a
		// counter that appears only in the array below would be dropped, and this
		// memo would hold its first answer for the whole survey.
		const at = growth;
		const built = buildOverlay(
			runs,
			params,
			snapshot.leverArm,
			deferredRadius,
		);
		return built ? { ...built, at } : null;
	}, [runs, params, snapshot.leverArm, deferredRadius, growth]);

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv || size.width < 80 || size.height < 80) return;
		if (!overlay) {
			// Cleared rather than left painted: with the library emptied the
			// caption says there is nothing to compare, and a picture that
			// contradicts its own caption is worse than a blank one.
			const ctx = cv.getContext("2d");
			ctx?.clearRect(0, 0, cv.width, cv.height);
			return;
		}
		drawOverlay(cv, {
			overlay,
			theme,
			width: size.width,
			height: size.height,
		});
	}, [overlay, theme, size.width, size.height]);

	const summary = overlay
		? (() => {
				// "Every run that covered them", which is what the sentence
				// says — not "every run in the library". On partial overlap the
				// two differ, and that is the case the coverage test exists for.
				const unanimous = overlay.clusters.filter(
					(c) => c.runs.size === c.covered.size,
				).length;
				const disputed = overlay.clusters.filter(
					(c) => c.disputed,
				).length;
				return (
					`${overlay.runs.length} run${overlay.runs.length > 1 ? "s" : ""}, ` +
					`${overlay.detections} detections in ${overlay.clusters.length} places. ` +
					`${unanimous} seen by every run that covered them, ${disputed} disputed ` +
					`— a run drove over those and saw nothing.`
				);
			})()
		: "Open a recording to start the comparison; switch to another and this panel compares them.";

	return (
		<EmiPanelFrame
			title={props.title}
			snapshot={snapshot}
			// The subject is the library, not the live source: gating on the
			// current run would blank a freshly-archived comparison at exactly
			// the moment it became possible, because the newly-selected
			// recording has no samples yet.
			health={hasLibrary ? "online" : undefined}
			stale={stale}
			toolbar={
				<div className="flex flex-1 items-center gap-2">
					<span className="text-[11px] text-muted-foreground">
						agreement {radius.toFixed(2)} m
					</span>
					<Slider
						className="max-w-40"
						value={[radius]}
						min={0.1}
						max={3}
						step={0.05}
						onValueChange={([v]) => setRadius(v ?? DEFAULT_RADIUS)}
					/>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 px-2 text-[11px]"
						title="Forget the archived runs"
						disabled={snapshot.library.length === 0}
						onClick={() => clearEmiLibrary()}
					>
						clear library
					</Button>
				</div>
			}
		>
			<div className="flex h-full w-full flex-col">
				<div ref={hostRef} className="min-h-0 flex-1">
					<canvas ref={canvasRef} style={{ display: "block" }} />
				</div>
				<p className="shrink-0 px-2 pb-1 text-[11px] leading-tight text-muted-foreground">
					{summary}
				</p>
			</div>
		</EmiPanelFrame>
	);
};

/**
 * Widget definition for the run overlay.
 *
 * @returns The definition.
 */
export function EmiRunOverlayDefinition(): WidgetDefinition<OverlaySettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-run-overlay",
		name: "EMI repeatability",
		description: "Whether runs of the same ground agree with each other.",
		titleProp: "title",
		icon: <LayersIcon />,
		schema: {
			type: "object",
			properties: { title: { type: "string", title: "Title" } },
		},
		uischema: layout,
		data: { title: "EMI repeatability" },
		Component: RunOverlay,
	};
}
