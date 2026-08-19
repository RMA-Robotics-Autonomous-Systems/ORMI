"use client";

/**
 * W5 — the parameter rail.
 *
 * Every number that changes what the detector decides, in one column, with the
 * result of changing it beside it.
 *
 * **Deviation from the plan, recorded here rather than discovered later.** The
 * plan expected this to be a JSON Forms rendering of the `EmiParams` schema, and
 * it is not. JSON Forms produces a *form*: labelled inputs, validated, submitted.
 * The rail is not a form — its whole value is that a parameter can be dragged
 * and the five panels answer while the finger is still down, with the live value
 * and the parameter's meaning under the thumb. The widget's own settings schema
 * is still JSON Forms, like every other widget; only the body is purpose-built.
 *
 * The three presets are the argument the source report makes, in one click each:
 * what the robot runs today, what this recording actually ran under, and the two
 * proposals.
 */

import { useMemo } from "react";
import { SlidersHorizontalIcon } from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Slider } from "@workspace/ui/components/slider";
import { Switch } from "@workspace/ui/components/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	matchRecordingParams,
	PROPOSED_PARAMS,
	SHIPPED_PARAMS,
	type EmiParams,
} from "../detector/params";
import { useEmiParamsState } from "../state/atoms";
import { useEmiReplay } from "../state/use-emi-run";
import { EmiPanelFrame } from "./emi-panel-frame";
import type { EmiRun } from "../detector/run-types";

/** Settings for the rail. */
interface ParamsRailSettings extends Record<string, unknown> {
	title: string;
}

/** Range of the arm-threshold slider, counts. */
const THRESHOLD_MIN = 100;
const THRESHOLD_MAX = 40000;

/** A numeric parameter and how to drag it. */
interface NumericParam {
	key: keyof EmiParams;
	label: string;
	min: number;
	max: number;
	step: number;
	decimals: number;
	unit?: string;
	hint: string;
	/** Only shown when this returns true. */
	when?: (p: EmiParams) => boolean;
}

/** Parameters grouped as the source rail groups them. */
const GROUPS: Array<{ title: string; params: NumericParam[] }> = [
	{
		title: "Detection",
		params: [
			{
				key: "threshold",
				label: "Arm threshold",
				min: THRESHOLD_MIN,
				max: THRESHOLD_MAX,
				step: 50,
				decimals: 0,
				unit: "counts",
				hint: "One number shared by all five coils — the objection the MAD detector answers. Always shown: under MAD it still sets the shipped baseline every comparison on this page is measured against.",
			},
			{
				key: "releaseRatio",
				label: "Release ratio",
				min: 0.3,
				max: 1,
				step: 0.01,
				decimals: 2,
				hint: "Release at this fraction of the arm threshold. 1.00 is no hysteresis, which is what the recordings ran.",
				when: (p) => p.detector === "fixed",
			},
			{
				key: "madFactor",
				label: "MAD factor",
				min: 2,
				max: 60,
				step: 0.5,
				decimals: 1,
				unit: "× MAD",
				hint: "Multiples of a coil's own median absolute deviation above its own rolling median. The cheap slider: the medians do not depend on it.",
				when: (p) => p.detector === "mad",
			},
			{
				key: "madRearmRatio",
				label: "MAD release ratio",
				min: 0.3,
				max: 1,
				step: 0.01,
				decimals: 2,
				hint: "Release threshold as a fraction of the arm threshold.",
				when: (p) => p.detector === "mad",
			},
			{
				key: "madBaseS",
				label: "Baseline window",
				min: 2,
				max: 60,
				step: 1,
				decimals: 0,
				unit: "s",
				hint: "How much history the rolling median sees. Changing it recomputes the whole baseline.",
				when: (p) => p.detector === "mad",
			},
			{
				key: "madDetS",
				label: "Detection window",
				min: 0.1,
				max: 3,
				step: 0.1,
				decimals: 1,
				unit: "s",
				hint: "The short window the current level is taken over.",
				when: (p) => p.detector === "mad",
			},
			{
				key: "alpha",
				label: "EMA α",
				min: 0.05,
				max: 1,
				step: 0.01,
				decimals: 2,
				hint: "The filter the C++ node applies. Also recomputes the MAD baseline.",
			},
			{
				key: "rearmDwellS",
				label: "Re-arm dwell",
				min: 0,
				max: 5,
				step: 0.1,
				decimals: 1,
				unit: "s",
				hint: "Lockout after publishing. 0 disables it, which is what the robot runs.",
			},
		],
	},
	{
		title: "Association",
		params: [
			{
				key: "gateBaseM",
				label: "Gate radius",
				min: 0.1,
				max: 2,
				step: 0.05,
				decimals: 2,
				unit: "m",
				hint: "A new detection joins the nearest target within this distance.",
				when: (p) => p.assoc === "gate",
			},
			{
				key: "gateSigmaMaxM",
				label: "Gate σ cutoff",
				min: 0,
				max: 2,
				step: 0.05,
				decimals: 2,
				unit: "m",
				hint: "Above this fix uncertainty the gate closes entirely. 0 disables the cutoff.",
				when: (p) => p.assoc === "gate",
			},
			{
				key: "linkAlongM",
				label: "Along-track window",
				min: 0.05,
				max: 1.5,
				step: 0.05,
				decimals: 2,
				unit: "m",
				hint: "How far along the heading two coils may disagree. Always shown: it sets the cross-coil links on the signal stack and the lag scatter whichever associator is running.",
			},
			{
				key: "linkCrossM",
				label: "Across-track window",
				min: 0.05,
				max: 1.5,
				step: 0.05,
				decimals: 2,
				unit: "m",
				hint: "Shared footprint across the track. Always shown, for the same reason: it is what decides which coils could have seen one object.",
			},
		],
	},
];

/** Choice controls, which are not sliders. */
const CHOICES: Array<{
	key: keyof EmiParams;
	label: string;
	options: Array<{ value: string; label: string }>;
	hint: string;
}> = [
	{
		key: "detector",
		label: "Detector",
		options: [
			{ value: "fixed", label: "Fixed threshold (shipped)" },
			{ value: "mad", label: "Per-coil MAD (proposed)" },
		],
		hint: "One threshold for every coil, or one per coil derived from its own noise.",
	},
	{
		key: "assoc",
		label: "Association",
		options: [
			{ value: "gate", label: "Distance gate (shipped)" },
			{ value: "chain", label: "Geometry chain (proposed)" },
		],
		hint: "Fold a detection into the nearest target within a radius, or into one the array's geometry says it must belong to.",
	},
	{
		key: "gnssFrame",
		label: "Georeference from",
		options: [
			{ value: "xsens_link", label: "Antenna (xsens_link)" },
			{ value: "base_link", label: "Body (base_link)" },
		],
		hint: "The difference between the two is the lever arm — about 22 cm.",
	},
	{
		key: "yawAt",
		label: "Heading taken at",
		options: [
			{ value: "peak", label: "Peak" },
			{ value: "release", label: "Release" },
		],
		hint: "Which sample's orientation rotates the coil offset.",
	},
];

/** The ATR threshold a recording most often ran under. */
function recordedThreshold(run: EmiRun | null): number {
	if (!run || run.n === 0) return SHIPPED_PARAMS.threshold;
	const counts = new Map<number, number>();
	for (let i = 0; i < run.n; i++) {
		const v = run.recorded.atrThreshold[i]!;
		if (v <= 0) continue;
		counts.set(v, (counts.get(v) ?? 0) + 1);
	}
	let best = SHIPPED_PARAMS.threshold;
	let bestN = 0;
	for (const [v, n] of counts) {
		if (n > bestN) {
			bestN = n;
			best = v;
		}
	}
	return best;
}

/** One result tile. */
function Tile(props: { label: string; value: string; hint?: string }) {
	return (
		<div
			className="rounded-md border border-border px-2 py-1"
			title={props.hint}
		>
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground">
				{props.label}
			</div>
			<div className="text-sm font-medium tabular-nums">
				{props.value}
			</div>
		</div>
	);
}

/**
 * The rail.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const ParamsRail = (props: ParamsRailSettings) => {
	const [params, setParams] = useEmiParamsState();
	const { run, result, stale, snapshot } = useEmiReplay();

	// Functional, so two patches batched into one render cannot lose the first.
	const patch = (next: Partial<EmiParams>) =>
		setParams((prev) => ({ ...prev, ...next }));

	/** Write one slider value, refusing an empty change rather than NaN. */
	const patchNumber = (key: keyof EmiParams, value: number | undefined) => {
		// `noUncheckedIndexedAccess` types the destructured slider value as
		// possibly undefined, and an undefined threshold reaches `p.threshold | 0`
		// as 0 — which arms every coil on every sample and degenerates the page.
		if (value === undefined || !Number.isFinite(value)) return;
		patch({ [key]: value } as Partial<EmiParams>);
	};

	const confirmed = useMemo(
		() => result?.targets.filter((t) => t.confirmed).length ?? 0,
		[result],
	);

	const tiles = [
		{
			label: "detections",
			value: String(result?.detsNew.length ?? 0),
			hint: "Under the current parameters.",
		},
		{
			label: "recorded",
			value: String(run?.recorded.alerts.length ?? 0),
			hint: "What the robot published on the day.",
		},
		{
			label: "targets",
			value: String(result?.targets.length ?? 0),
			hint: "Objects after association.",
		},
		{
			label: "confirmed",
			value: String(confirmed),
			hint: "Targets more than one coil contributed to.",
		},
		{
			label: "links",
			value: String(result?.pairs.length ?? 0),
			hint: "Cross-coil pairs the geometry accepts.",
		},
		{
			label: "replay",
			value: result ? `${result.ms.toFixed(1)} ms` : "—",
			hint: "Wall time of the last full pass over the run.",
		},
	];

	return (
		<EmiPanelFrame title={props.title} snapshot={snapshot} stale={stale}>
			<ScrollArea className="h-full w-full">
				<div className="space-y-4 p-2">
					<div className="grid grid-cols-3 gap-1">
						{tiles.map((t) => (
							<Tile key={t.label} {...t} />
						))}
					</div>

					<div className="flex flex-wrap gap-1">
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-[11px]"
							title="One fixed threshold and the covariance gate — what the robot runs today."
							onClick={() => setParams(SHIPPED_PARAMS)}
						>
							shipped
						</Button>
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-[11px]"
							title="Reproduce the configuration this recording was made under."
							disabled={!run}
							onClick={() =>
								setParams(
									matchRecordingParams(
										// Clamped into the slider's range, so the
										// preset does not leave the thumb pinned
										// at a rail and silently snap on first
										// touch.
										Math.min(
											THRESHOLD_MAX,
											Math.max(
												THRESHOLD_MIN,
												recordedThreshold(run),
											),
										),
									),
								)
							}
						>
							match recording
						</Button>
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-[11px]"
							title="Per-coil MAD and chain association — the two proposals."
							onClick={() => setParams(PROPOSED_PARAMS)}
						>
							proposed
						</Button>
					</div>

					<div className="space-y-3">
						{CHOICES.map((c) => (
							<div key={c.key} className="space-y-1">
								<Label className="text-xs">{c.label}</Label>
								<Select
									value={String(params[c.key])}
									onValueChange={(v) =>
										patch({
											[c.key]: v,
										} as Partial<EmiParams>)
									}
								>
									<SelectTrigger className="h-8 text-xs">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{c.options.map((o) => (
											<SelectItem
												key={o.value}
												value={o.value}
												className="text-xs"
											>
												{o.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-[10px] leading-tight text-muted-foreground">
									{c.hint}
								</p>
							</div>
						))}
					</div>

					{GROUPS.map((group) => {
						const visible = group.params.filter(
							(p) => !p.when || p.when(params),
						);
						if (visible.length === 0) return null;
						return (
							<div key={group.title} className="space-y-3">
								<div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
									{group.title}
								</div>
								{visible.map((p) => {
									const value = Number(params[p.key]);
									return (
										<div key={p.key} className="space-y-1">
											<div className="flex items-baseline justify-between gap-2">
												<Label className="text-xs">
													{p.label}
												</Label>
												<span className="text-xs tabular-nums text-muted-foreground">
													{value.toFixed(p.decimals)}
													{p.unit ? ` ${p.unit}` : ""}
												</span>
											</div>
											<Slider
												value={[value]}
												min={p.min}
												max={p.max}
												step={p.step}
												onValueChange={(vals) =>
													patchNumber(p.key, vals[0])
												}
											/>
											<p className="text-[10px] leading-tight text-muted-foreground">
												{p.hint}
											</p>
										</div>
									);
								})}
							</div>
						);
					})}

					{params.detector === "mad" && (
						<div className="flex items-center justify-between gap-2">
							<div>
								<Label className="text-xs">
									Freeze baseline
								</Label>
								<p className="text-[10px] leading-tight text-muted-foreground">
									Hold the statistics captured at arm time
									while a coil is latched, so a long event
									does not raise its own threshold.
								</p>
							</div>
							<Switch
								checked={params.madFreeze}
								onCheckedChange={(v) => patch({ madFreeze: v })}
							/>
						</div>
					)}
				</div>
			</ScrollArea>
		</EmiPanelFrame>
	);
};

/**
 * Widget definition for the parameter rail.
 *
 * @returns The definition.
 */
export function EmiParamsRailDefinition(): WidgetDefinition<ParamsRailSettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-params-rail",
		name: "EMI parameters",
		description: "Every parameter that changes what the detector decides.",
		titleProp: "title",
		icon: <SlidersHorizontalIcon />,
		schema: {
			type: "object",
			properties: { title: { type: "string", title: "Title" } },
		},
		uischema: layout,
		data: { title: "EMI parameters" },
		Component: ParamsRail,
	};
}
