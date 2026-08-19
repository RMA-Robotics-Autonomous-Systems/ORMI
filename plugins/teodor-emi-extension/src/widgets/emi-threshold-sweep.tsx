"use client";

/**
 * W6 — the threshold sweep.
 *
 * How many detections the run yields as the deciding parameter moves, for both
 * detectors at once. The argument the source report makes is a distance between
 * two curves; this is that distance.
 */

import { useEffect, useMemo, useRef } from "react";
import { TrendingUpIcon } from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { drawSweep } from "../charts/sweep-chart";
import { useEmiTheme } from "../charts/emi-theme";
import { useEmiReplay } from "../state/use-emi-run";
import { useSweep } from "../state/use-sweep";
import {
	EmiPanelFrame,
	useElementSize,
	useHostElement,
} from "./emi-panel-frame";
import type { EmiRun } from "../detector/run-types";

/** Settings for the sweep. */
interface SweepSettings extends Record<string, unknown> {
	title: string;
}

/**
 * The single ATR threshold a recording ran under, or 0 when it changed.
 *
 * Zero rather than a majority vote: the reference dot claims "this is the point
 * the recording occupies on this curve", and that claim is only true if there
 * was one threshold for the whole run.
 *
 * @param run - The run.
 * @param n - Committed sample count.
 * @returns The single threshold, or 0 when it varied or nothing was recorded.
 */
function singleRecordedThreshold(run: EmiRun, n: number): number {
	if (n === 0) return 0;
	let seen = 0;
	for (let i = 0; i < n; i++) {
		const v = run.recorded.atrThreshold[i]!;
		if (v <= 0) continue;
		if (seen === 0) seen = v;
		else if (seen !== v) return 0;
	}
	return seen;
}

/** Percentage change, in words. */
function pctChange(a: number, b: number): string {
	if (a === 0) return b === 0 ? "no change" : `${b} more`;
	const d = ((b - a) / a) * 100;
	if (Math.abs(d) < 0.05) return "no change";
	return `${d > 0 ? "+" : ""}${d.toFixed(0)}%`;
}

/**
 * The sweep panel.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const ThresholdSweep = (props: SweepSettings) => {
	const { run, result, params, stale, snapshot } = useEmiReplay();
	const sweep = useSweep(run, result, params, snapshot.n);

	const [hostRef, host] = useHostElement<HTMLDivElement>();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const theme = useEmiTheme(host);
	const size = useElementSize(host);

	// Keyed on the snapshot revision, never on `run` alone: the builder returns
	// the same run object on every commit, so a memo keyed on its identity would
	// evaluate once — over the two or three samples the first commit carried —
	// and then claim for the rest of the recording that the threshold never
	// changed. That claim is exactly what the reference dot rests on.
	const recordedThreshold = useMemo(
		() => (run ? singleRecordedThreshold(run, snapshot.n) : 0),
		[run, snapshot.n],
	);
	const recordedCount = run?.recorded.alerts.length ?? 0;

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv || !sweep || size.width < 80 || size.height < 80) return;
		drawSweep(cv, {
			sweep,
			params,
			theme,
			recordedCount,
			recordedThreshold,
			width: size.width,
			height: size.height,
		});
	}, [
		sweep,
		params,
		theme,
		recordedCount,
		recordedThreshold,
		size.width,
		size.height,
	]);

	const note = result
		? sweep?.mode === "mad"
			? `At factor ${params.madFactor}×: ${result.detsNew.length} MAD detections against ` +
				`${result.detsOld.length} from the shipped single threshold at ${params.threshold} — ` +
				`${pctChange(result.detsOld.length, result.detsNew.length)}.`
			: `At the current threshold: ${result.detsOld.length} single-threshold, ` +
				`${result.detsNew.length} with hysteresis at ${params.releaseRatio.toFixed(2)}` +
				(params.rearmDwellS > 0
					? ` and a ${params.rearmDwellS.toFixed(1)} s dwell`
					: "") +
				` — ${pctChange(result.detsOld.length, result.detsNew.length)}.`
		: "";

	return (
		<EmiPanelFrame title={props.title} snapshot={snapshot} stale={stale}>
			<div className="flex h-full w-full flex-col">
				<div ref={hostRef} className="min-h-0 flex-1">
					<canvas ref={canvasRef} style={{ display: "block" }} />
				</div>
				<p className="shrink-0 px-2 pb-1 text-[11px] leading-tight text-muted-foreground">
					{note}
				</p>
			</div>
		</EmiPanelFrame>
	);
};

/**
 * Widget definition for the threshold sweep.
 *
 * @returns The definition.
 */
export function EmiThresholdSweepDefinition(): WidgetDefinition<SweepSettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-threshold-sweep",
		name: "EMI threshold sweep",
		description:
			"How the detection count moves with the deciding parameter.",
		titleProp: "title",
		icon: <TrendingUpIcon />,
		schema: {
			type: "object",
			properties: { title: { type: "string", title: "Title" } },
		},
		uischema: layout,
		data: { title: "EMI threshold sweep" },
		Component: ThresholdSweep,
	};
}
