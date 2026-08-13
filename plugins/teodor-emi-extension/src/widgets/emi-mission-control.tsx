"use client";

/**
 * W12 — start a survey, stop it, and open one back up.
 *
 * The ingest has been filling a run since the first panel mounted; what this
 * adds is the boundary and the durability. Recording begins on a deliberate
 * press, the samples are written down as they accumulate, and a mission opened
 * from the list is the *same run object* the panels were drawing while it was
 * recorded — so "reopen it offline and get identical numbers" is a property of
 * the storage format rather than a claim to be verified.
 *
 * Two things are surfaced rather than hidden, because both change what the
 * operator should do:
 *
 * - **Where it is being written.** A browser that refuses IndexedDB still
 *   records perfectly well, in memory, and loses the survey when the tab
 *   closes. That is a fine trade if it is known in advance and a disaster if it
 *   is discovered afterwards.
 * - **A mission that was never stopped.** It comes back marked as interrupted
 *   with the samples that survived, and is not quietly cleaned up: an
 *   interrupted survey is still most of a survey.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
	CircleIcon,
	FolderOpenIcon,
	SquareIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { cn } from "@workspace/ui/lib/utils";
import { useEmiRun } from "../state/use-emi-run";
import {
	acquireMissionStore,
	closeMission,
	deleteMission,
	discardMission,
	getMissionServerSnapshot,
	getMissionSnapshot,
	openMission,
	startMission,
	stopMission,
	subscribeMissionStore,
	type StoredMission,
} from "../mission/mission-store";
import { EmiPanelFrame } from "./emi-panel-frame";

/** Settings for the mission controls. */
interface MissionControlSettings extends Record<string, unknown> {
	title: string;
}

/** How long an armed delete stays armed, milliseconds. */
const DISARM_MS = 5000;

/** `mm:ss`, or `h:mm:ss` past an hour. */
function duration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "—";
	const s = Math.floor(seconds % 60);
	const m = Math.floor((seconds / 60) % 60);
	const h = Math.floor(seconds / 3600);
	const mm = String(m).padStart(2, "0");
	const ss = String(s).padStart(2, "0");
	return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Bytes at human scale. */
function bytes(v: number): string {
	if (!Number.isFinite(v) || v <= 0) return "0 B";
	const units = ["B", "kB", "MB", "GB"];
	let i = 0;
	let n = v;
	while (n >= 1024 && i < units.length - 1) {
		n /= 1024;
		i += 1;
	}
	return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/** Date and time, short. */
const when = (ms: number): string =>
	ms > 0
		? new Date(ms).toLocaleString(undefined, {
				dateStyle: "short",
				timeStyle: "short",
			})
		: "—";

/**
 * The mission controls.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const EmiMissionControl = (props: MissionControlSettings) => {
	const snapshot = useEmiRun();
	const mission = useSyncExternalStore(
		subscribeMissionStore,
		getMissionSnapshot,
		getMissionServerSnapshot,
	);
	const [name, setName] = useState("");
	const [confirming, setConfirming] = useState<string | null>(null);

	useEffect(() => acquireMissionStore(), []);

	// An armed delete disarms itself. Left armed, a row primed minutes ago
	// deletes a survey on what its owner reads as a first press.
	useEffect(() => {
		if (!confirming) return;
		const timer = setTimeout(() => setConfirming(null), DISARM_MS);
		return () => clearTimeout(timer);
	}, [confirming]);

	const run = snapshot.run;
	const surveyed = run && run.n > 0 ? run.t[run.n - 1]! - run.t[0]! : 0;
	const recording = mission.phase === "recording";
	// A mission cannot start against nothing, and the reason a source is missing
	// is already stated by every other panel on the page.
	const canRecord = !!run && !recording && !mission.busy;
	const pending = recording ? mission.samples - mission.spilled : 0;

	return (
		<EmiPanelFrame title={props.title} snapshot={snapshot} health="online">
			<div className="flex h-full w-full flex-col gap-2 p-2 text-[12px]">
				{/* ── The transport ───────────────────────────────────────── */}
				<div className="flex items-center gap-2">
					{recording ? (
						<Button
							size="sm"
							variant="destructive"
							className="h-7 gap-1.5"
							disabled={mission.busy}
							onClick={() => void stopMission()}
						>
							<SquareIcon className="size-3 fill-current" />
							Stop
						</Button>
					) : (
						<Button
							size="sm"
							className="h-7 gap-1.5"
							disabled={!canRecord}
							// The name is only cleared once it has been taken. A
							// press that could not start anything must not also
							// throw away what the operator typed.
							onClick={() => {
								if (startMission(name)) setName("");
							}}
						>
							<CircleIcon className="size-3 fill-red-500 text-red-500" />
							Record
						</Button>
					)}

					{recording ? (
						<span className="truncate font-medium">
							{mission.name}
						</span>
					) : (
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Mission name (optional)"
							className="h-7 flex-1 text-[12px]"
							disabled={!canRecord}
						/>
					)}

					{mission.phase === "stopped" && (
						<Button
							size="sm"
							variant="ghost"
							className="h-7 text-muted-foreground"
							disabled={mission.busy}
							onClick={() => void discardMission()}
						>
							Discard
						</Button>
					)}
				</div>

				{/* ── What is happening right now ─────────────────────────── */}
				<div className="grid grid-cols-3 gap-2 rounded border border-border/60 p-2">
					<Stat label="samples" value={run ? String(run.n) : "—"} />
					<Stat label="surveyed" value={duration(surveyed)} />
					<Stat
						label={recording ? "unwritten" : "source"}
						value={
							recording
								? `${pending} sample${pending === 1 ? "" : "s"}`
								: (snapshot.bundle?.datasourceTitle ?? "—")
						}
					/>
				</div>

				{/* ── Where it goes, and what went wrong ──────────────────── */}
				{mission.persistence === "memory" && (
					<p className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
						This browser is not allowing a database. Missions are
						held in memory and are lost when the tab closes — export
						before leaving.
					</p>
				)}
				{/* A state, not an event. Once a write fails no further spill is
				    attempted, so this has to keep saying so for as long as it is
				    true — an error line that clears on the next successful action
				    would tell the operator the survey is safe when it is not. */}
				{mission.writeFailed && (
					<p className="rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
						This mission is <strong>not</strong> being written to
						disk. Whatever is on screen is complete, but a reload
						will lose it — export before leaving.
					</p>
				)}
				{mission.error && (
					<p className="rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
						{mission.error}
					</p>
				)}
				{snapshot.adopted && (
					<div className="flex items-center justify-between rounded bg-primary/10 px-2 py-1 text-[11px]">
						<span className="truncate">
							Reviewing a stored mission — the live source is not
							being read.
						</span>
						<Button
							size="sm"
							variant="ghost"
							className="h-6 gap-1 text-[11px]"
							onClick={closeMission}
						>
							<XIcon className="size-3" />
							Back to live
						</Button>
					</div>
				)}

				{/* ── The library ─────────────────────────────────────────── */}
				<div className="min-h-0 flex-1">
					<ScrollArea className="h-full">
						<table className="w-full border-collapse text-[11px]">
							<tbody>
								{mission.missions.map((m) => (
									<MissionRow
										key={m.id}
										mission={m}
										open={mission.openId === m.id}
										busy={mission.busy}
										confirming={confirming === m.id}
										onConfirm={() =>
											setConfirming(
												confirming === m.id
													? null
													: m.id,
											)
										}
										onDelete={() => {
											setConfirming(null);
											void deleteMission(m.id);
										}}
									/>
								))}
								{mission.missions.length === 0 && (
									<tr>
										<td className="p-2 text-muted-foreground">
											No stored missions yet. Press record
											to begin one.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</ScrollArea>
				</div>
			</div>
		</EmiPanelFrame>
	);
};

/** One number with its label. */
function Stat(props: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
				{props.label}
			</div>
			<div className="truncate tabular-nums">{props.value}</div>
		</div>
	);
}

/** One stored mission. */
function MissionRow(props: {
	mission: StoredMission;
	open: boolean;
	busy: boolean;
	confirming: boolean;
	onConfirm: () => void;
	onDelete: () => void;
}) {
	const m = props.mission;
	const interrupted = m.endedAt === null;
	return (
		<tr
			className={cn(
				"border-b border-border/40",
				props.open && "bg-primary/10",
			)}
		>
			<td className="max-w-0 p-1">
				<div className="truncate font-medium">{m.name}</div>
				<div className="truncate text-[10px] text-muted-foreground">
					{when(m.startedAt)} · {m.n} samples ·{" "}
					{/* Measured when the mission was stopped; only an interrupted
					    one has to be inferred from its sample count, which reads
					    short by exactly the samples that were dropped. */}
					{duration(
						m.endedAt !== null
							? (m.endedAt - m.startedAt) / 1000
							: m.n / (m.sampleRateHz || 32),
					)}{" "}
					· {bytes(m.bytes)}
					{interrupted && (
						<span className="ml-1 text-amber-600 dark:text-amber-400">
							· interrupted
						</span>
					)}
				</div>
			</td>
			<td className="w-px whitespace-nowrap p-1 text-right">
				<Button
					size="sm"
					variant="ghost"
					className="h-6 gap-1 px-1.5 text-[11px]"
					disabled={props.busy}
					onClick={() =>
						props.open ? closeMission() : void openMission(m.id)
					}
				>
					{props.open ? (
						<XIcon className="size-3" />
					) : (
						<FolderOpenIcon className="size-3" />
					)}
					{props.open ? "Close" : "Open"}
				</Button>
				{/* Two presses, not a dialog: the second press is the confirmation,
				    and it labels itself. A survey is not recoverable once its
				    chunks are gone. */}
				<Button
					size="sm"
					variant="ghost"
					className={cn(
						"h-6 gap-1 px-1.5 text-[11px]",
						props.confirming && "text-destructive",
					)}
					disabled={props.busy}
					// The only irreversible action in the cockpit, and unarmed it
					// is an icon with no text — so it carries its name for hover
					// and for a screen reader rather than relying on the second
					// press to explain itself.
					title={
						props.confirming
							? `Delete "${m.name}" permanently`
							: `Delete "${m.name}"`
					}
					aria-label={
						props.confirming
							? `Confirm deleting ${m.name}`
							: `Delete ${m.name}`
					}
					onClick={() =>
						props.confirming ? props.onDelete() : props.onConfirm()
					}
				>
					<Trash2Icon className="size-3" />
					{props.confirming ? "Delete?" : ""}
				</Button>
			</td>
		</tr>
	);
}

/**
 * Widget definition for the mission controls.
 *
 * @returns The definition.
 */
export function EmiMissionControlDefinition(): WidgetDefinition<MissionControlSettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-mission-control",
		name: "EMI mission",
		description: "Record a live survey, and reopen a stored one.",
		titleProp: "title",
		icon: <CircleIcon />,
		schema: {
			type: "object",
			properties: { title: { type: "string", title: "Title" } },
		},
		uischema: layout,
		data: { title: "EMI mission" },
		Component: EmiMissionControl,
	};
}
