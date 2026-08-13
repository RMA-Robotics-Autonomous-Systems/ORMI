"use client";

/**
 * W11 — the numbers, in three tables.
 *
 * **Per coil** — what the day recorded, what the shipped detector reproduces,
 * and what the current one finds. Reading these three columns across one row is
 * the whole per-coil argument.
 *
 * **Targets** — the objects, strongest first.
 *
 * **Trust** — the replay held against the recording, plus how the run itself was
 * assembled. Cheap to compute and the thing that makes every other panel
 * believable.
 */

import { useMemo } from "react";
import { TableIcon } from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/tabs";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { useEmiReplay } from "../state/use-emi-run";
import { verifyReplay } from "../state/verification";
import { EmiPanelFrame } from "./emi-panel-frame";

/** Settings for the tables. */
interface TablesSettings extends Record<string, unknown> {
	title: string;
}

/** Targets shown before the list is truncated. */
const MAX_TARGET_ROWS = 40;

/** A number, or an em dash. */
const num = (v: number, digits = 0): string =>
	Number.isFinite(v) ? v.toFixed(digits) : "—";

/**
 * The tables.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const EmiTables = (props: TablesSettings) => {
	const { run, result, params, stale, snapshot } = useEmiReplay();

	// Keyed on the snapshot, not on the run. The builder hands back the **same
	// run object** on every commit and reassigns `recorded.alerts` onto it, so
	// the run's identity never changes while the recording lands — a memo that
	// keys on it reads whatever the array held the last time something else in
	// its dependencies moved, and then reports that for the whole survey. On a
	// bag whose alerts are concentrated at the start (130 of 144 in the first
	// hundred seconds, on `track2_5000_threshold`) the detector columns settle
	// early and stop changing, so this column is the only one that reveals the
	// staleness: it read 66 of 144 while the coil panels beside it, which draw
	// from the live object, read all five coils correctly.
	//
	// `snapshot` is the store's identity-stable, change-fresh handle and is the
	// only safe dependency for anything reading a mutable run field — the same
	// fix the map's recorded layer and the threshold sweep already carry.
	const perCoil = useMemo(() => {
		const run = snapshot.run;
		if (!run || !result) return [];
		const nc = run.ncoil;
		const rec = new Array<number>(nc).fill(0);
		const old = new Array<number>(nc).fill(0);
		const now = new Array<number>(nc).fill(0);
		const led = new Array<number>(nc).fill(0);
		const idIndex = new Map<number, number>();
		for (let c = 0; c < nc; c++) idIndex.set(run.coilIds[c]!, c);

		for (const a of run.recorded.alerts) {
			const ci = idIndex.get(a.coil);
			if (ci !== undefined) rec[ci]!++;
		}
		for (const d of result.detsOld) old[d.ci]!++;
		for (const d of result.detsNew) now[d.ci]!++;
		for (const t of result.targets) {
			const ci = idIndex.get(t.bestCoil);
			if (ci !== undefined) led[ci]!++;
		}
		return Array.from({ length: nc }, (_, c) => ({
			id: run.coilIds[c]!,
			rec: rec[c]!,
			old: old[c]!,
			now: now[c]!,
			led: led[c]!,
		}));
	}, [snapshot, result]);

	const targets = useMemo(
		() =>
			result
				? [...result.targets].sort((a, b) => b.bestAmp - a.bestAmp)
				: [],
		[result],
	);

	// Same reason: `verifyReplay` compares the replay against
	// `run.recorded.alerts`, so a memo that cannot see that array change reports
	// the recording as unreproduced for the rest of the session.
	const verification = useMemo(
		() =>
			snapshot.run && result ? verifyReplay(snapshot.run, result) : null,
		[snapshot, result],
	);

	const chain = params.assoc === "chain";
	const totals = perCoil.reduce(
		(acc, r) => ({
			rec: acc.rec + r.rec,
			old: acc.old + r.old,
			now: acc.now + r.now,
			led: acc.led + r.led,
		}),
		{ rec: 0, old: 0, now: 0, led: 0 },
	);

	return (
		<EmiPanelFrame title={props.title} snapshot={snapshot} stale={stale}>
			<Tabs defaultValue="coils" className="flex h-full w-full flex-col">
				<TabsList className="mx-2 mt-1 h-7 shrink-0">
					<TabsTrigger value="coils" className="h-6 text-[11px]">
						Per coil
					</TabsTrigger>
					<TabsTrigger value="targets" className="h-6 text-[11px]">
						Targets
					</TabsTrigger>
					<TabsTrigger value="trust" className="h-6 text-[11px]">
						Trust
					</TabsTrigger>
				</TabsList>

				<TabsContent value="coils" className="min-h-0 flex-1">
					<ScrollArea className="h-full w-full">
						<table className="w-full text-[11px] tabular-nums">
							<thead className="text-muted-foreground">
								<tr className="border-b border-border">
									<th className="p-1 text-left font-medium">
										coil
									</th>
									<th className="p-1 text-right font-medium">
										recorded on the day
									</th>
									<th className="p-1 text-right font-medium">
										single-threshold, replayed
									</th>
									<th className="p-1 text-right font-medium">
										current detector
									</th>
									<th className="p-1 text-right font-medium">
										targets led
									</th>
								</tr>
							</thead>
							<tbody>
								{perCoil.map((r) => (
									<tr
										key={r.id}
										className="border-b border-border/40"
									>
										<td className="p-1">coil {r.id}</td>
										<td className="p-1 text-right text-muted-foreground">
											{r.rec}
										</td>
										<td className="p-1 text-right">
											{r.old}
										</td>
										<td className="p-1 text-right font-medium">
											{r.now}
										</td>
										<td className="p-1 text-right">
											{r.led}
										</td>
									</tr>
								))}
								<tr className="font-medium">
									<td className="p-1">total</td>
									<td className="p-1 text-right text-muted-foreground">
										{totals.rec}
									</td>
									<td className="p-1 text-right">
										{totals.old}
									</td>
									<td className="p-1 text-right">
										{totals.now}
									</td>
									<td className="p-1 text-right">
										{totals.led}
									</td>
								</tr>
							</tbody>
						</table>
					</ScrollArea>
				</TabsContent>

				<TabsContent value="targets" className="min-h-0 flex-1">
					<ScrollArea className="h-full w-full">
						<table className="w-full text-[11px] tabular-nums">
							<thead className="text-muted-foreground">
								<tr className="border-b border-border">
									<th className="p-1 text-left font-medium">
										id
									</th>
									<th className="p-1 text-right font-medium">
										dets
									</th>
									<th className="p-1 text-left font-medium">
										coils
									</th>
									<th className="p-1 text-right font-medium">
										peak
									</th>
									<th className="p-1 text-right font-medium">
										spread
									</th>
									<th className="p-1 text-right font-medium">
										σ
									</th>
									<th className="p-1 text-left font-medium">
										{chain ? "cross-coil" : "gate"}
									</th>
									<th className="p-1 text-right font-medium">
										first
									</th>
									<th className="p-1 text-left font-medium">
										fix
									</th>
								</tr>
							</thead>
							<tbody>
								{targets.slice(0, MAX_TARGET_ROWS).map((t) => (
									<tr
										key={t.id}
										className="border-b border-border/40"
									>
										<td className="p-1">#{t.id}</td>
										<td className="p-1 text-right">
											{t.members.length}
										</td>
										<td className="p-1">
											{[...t.coils]
												.sort((a, b) => a - b)
												.join(", ")}
										</td>
										<td className="p-1 text-right">
											{Math.round(t.bestAmp)}
										</td>
										<td className="p-1 text-right">
											{num(t.spread, 2)}
										</td>
										<td className="p-1 text-right">
											{num(t.sigma, 2)}
										</td>
										<td className="p-1">
											{chain
												? t.confirmed
													? "confirmed"
													: "one coil"
												: t.gateUsed
													? num(t.gateUsed, 2)
													: "—"}
										</td>
										<td className="p-1 text-right">
											{num(t.firstSeen, 1)}
										</td>
										<td className="p-1">
											{t.degraded
												? chain
													? "uncertain"
													: "degraded"
												: "ok"}
										</td>
									</tr>
								))}
							</tbody>
							{targets.length > MAX_TARGET_ROWS && (
								<tfoot>
									<tr>
										<td
											colSpan={9}
											className="p-1 text-muted-foreground"
										>
											showing the {MAX_TARGET_ROWS}{" "}
											strongest of {targets.length}{" "}
											targets
										</td>
									</tr>
								</tfoot>
							)}
						</table>
					</ScrollArea>
				</TabsContent>

				<TabsContent value="trust" className="min-h-0 flex-1">
					<ScrollArea className="h-full w-full">
						<div className="space-y-2 p-2 text-[11px]">
							{verification ? (
								<>
									<table className="w-full tabular-nums">
										<tbody>
											<Row
												label="recorded alerts"
												value={String(
													verification.recorded,
												)}
											/>
											<Row
												label="replayed (single threshold)"
												value={
													verification.unplaceable
														? `${verification.replayed} placed, ${verification.unplaceable} without a heading`
														: String(
																verification.replayed,
															)
												}
											/>
											<Row
												label="matched"
												value={`${verification.matched} within ±0.35 s`}
											/>
											<Row
												label="missing / extra"
												value={`${verification.onlyRecorded} / ${verification.onlyReplayed}`}
											/>
											<Row
												label="peak amplitude (raw vs filtered)"
												value={
													verification.matched
														? `${verification.ampExact} of ${verification.matched} identical, worst error ${verification.ampMaxError}`
														: "—"
												}
											/>
											<Row
												label="position vs recorded"
												value={
													verification.posCompared
														? `median ${num(verification.posMedianError, 2)} m, max ${num(verification.posMaxError, 2)} m over ${verification.posCompared}`
														: "—"
												}
											/>
										</tbody>
									</table>

									{!verification.singleThreshold &&
										verification.thresholds.length > 1 && (
											<p className="rounded border border-border p-2 text-muted-foreground">
												<b>
													The threshold changed during
													this run
												</b>{" "}
												(
												{verification.thresholds.join(
													" then ",
												)}
												). The recorded count is the sum
												of two different detectors, so
												only the replayed columns are a
												like-for-like comparison.
											</p>
										)}

									<p className="text-muted-foreground">
										Amplitudes are not the same measurement
										on both sides — the recording carries
										the unfiltered peak, the replay the
										filtered one — so that row is a
										magnitude check, not an equality check.
									</p>
									<p className="text-muted-foreground">
										The replay is compared against the
										shipped single-threshold detector, never
										the current one: the recording was
										produced by that detector, and holding a
										proposal to a recording it did not make
										would report a disagreement that is the
										point of the proposal.
									</p>
								</>
							) : (
								<p className="text-muted-foreground">
									Nothing recorded yet.
								</p>
							)}

							<div className="pt-2">
								<div className="mb-1 font-medium">
									How this run was assembled
								</div>
								<table className="w-full tabular-nums">
									<tbody>
										<Row
											label="source"
											value={
												snapshot.bundle
													?.datasourceTitle ?? "none"
											}
										/>
										<Row
											label="samples"
											value={String(snapshot.n)}
										/>
										<Row
											label="coil geometry"
											value={
												snapshot.status?.geometry.fromTf
													? "from /tf_static"
													: `assumed (params.yaml fallback${
															snapshot.status
																? `, ${snapshot.status.geometry.resolvedFromTf} coil frames resolved`
																: ""
														})`
											}
										/>
										<Row
											label="robot fix"
											value={
												snapshot.status
													?.fixReconstructed
													? "reconstructed from coil 1 — no antenna topic seen"
													: "from the antenna topic"
											}
										/>
										<Row
											label="pre-removal signal"
											value={
												run?.hasPre
													? "present (/emi/raw)"
													: "not on this source"
											}
										/>
										<Row
											label="dropped"
											value={`${snapshot.status?.droppedOutOfOrder ?? 0} out of order, ${snapshot.status?.droppedCoilMismatch ?? 0} coil mismatch`}
										/>
										<Row
											label="replay seeks"
											value={String(
												snapshot.status?.seeks ?? 0,
											)}
										/>
									</tbody>
								</table>
							</div>
						</div>
					</ScrollArea>
				</TabsContent>
			</Tabs>
		</EmiPanelFrame>
	);
};

/** One label/value row. */
function Row(props: { label: string; value: string }) {
	return (
		<tr className="border-b border-border/40">
			<td className="p-1 text-muted-foreground">{props.label}</td>
			<td className="p-1 text-right">{props.value}</td>
		</tr>
	);
}

/**
 * Widget definition for the tables.
 *
 * @returns The definition.
 */
export function EmiTablesDefinition(): WidgetDefinition<TablesSettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-tables",
		name: "EMI tables",
		description:
			"Per-coil counts, the target list, and the replay held against the recording.",
		titleProp: "title",
		icon: <TableIcon />,
		schema: {
			type: "object",
			properties: { title: { type: "string", title: "Title" } },
		},
		uischema: layout,
		data: { title: "EMI tables" },
		Component: EmiTables,
	};
}
