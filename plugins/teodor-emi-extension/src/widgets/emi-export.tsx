"use client";

/**
 * W13 — the survey, on its way out of the browser.
 *
 * The export is built from whatever run is on show — a live mission, a stored
 * one reopened, or a `.db3` being replayed — at whatever parameters the rail is
 * currently set to. That is deliberate: an export is a *reading* of a survey,
 * and the reading is the tuning. The parameters travel inside the file so the
 * reading can be reproduced, and the layers are separated by `source` so the
 * robot's own targets and the replay's are never silently merged.
 *
 * The file is assembled and downloaded entirely in the page. Nothing is
 * uploaded: the tool has to work on a laptop in a field, and a survey is the
 * operator's data to move, not ours to route through a server.
 */

import { useState, useSyncExternalStore } from "react";
import { DownloadIcon } from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Label } from "@workspace/ui/components/label";
import { useEmiReplay } from "../state/use-emi-run";
import { clearEmiSelection, useEmiSelection } from "../state/atoms";
import {
	DEFAULT_LAYERS,
	buildEmiGeoJson,
	countLayers,
	geoJsonFilename,
	type GeoJsonLayers,
} from "../mission/geojson";
import {
	getMissionServerSnapshot,
	getMissionSnapshot,
	subscribeMissionStore,
} from "../mission/mission-store";
import { EmiPanelFrame } from "./emi-panel-frame";

/** Settings for the exporter. */
interface ExportSettings extends Record<string, unknown> {
	title: string;
}

/** The layers, in the order they are offered, with what each one is. */
const LAYERS: Array<{
	key: keyof GeoJsonLayers;
	label: string;
	hint: string;
}> = [
	{
		key: "targets",
		label: "Targets (replay)",
		hint: "what the current parameters find",
	},
	{
		key: "recordedTargets",
		label: "Targets (robot)",
		hint: "what the trackers published on the day",
	},
	{
		key: "detections",
		label: "Detections",
		hint: "one point per coil crossing, before association",
	},
	{ key: "track", label: "Robot track", hint: "the path driven" },
	{
		key: "coilTracks",
		label: "Coil tracks",
		hint: "one line per coil — what was actually swept",
	},
];

/**
 * The exporter.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const EmiExport = (props: ExportSettings) => {
	const { run, result, params, stale, snapshot } = useEmiReplay();
	const mission = useSyncExternalStore(
		subscribeMissionStore,
		getMissionSnapshot,
		getMissionServerSnapshot,
	);
	const [layers, setLayers] = useState<GeoJsonLayers>(DEFAULT_LAYERS);
	/** Hand-picked detections, shared with every panel that can pick one. */
	const selection = useEmiSelection();
	/** Off until something is picked; the operator opts in to the subset. */
	const [pickedOnly, setPickedOnly] = useState(true);
	const usingSelection = pickedOnly && selection.size > 0;
	const [wrote, setWrote] = useState<string | null>(null);
	const [failed, setFailed] = useState<string | null>(null);
	const [building, setBuilding] = useState(false);

	// Which survey this is, when it is one. A live run's `id` is the datasource
	// instance and its `label` the datasource title — neither says anything about
	// the mission, so without this an exported file cannot be tied back to the
	// recording it came from.
	const source =
		mission.missions.find((m) => m.id === (mission.openId ?? mission.id)) ??
		null;

	// Deliberately not memoised. `countLayers` reads five array lengths, and a
	// memo keyed on `[run]` would be *wrong*: a growing mission hands back the
	// same run object on every commit, so the counts would freeze on whatever
	// the first few samples contained while the survey ran on.
	const counts = run ? countLayers(run, result) : null;

	const selected = LAYERS.filter((l) => layers[l.key]);
	const total = counts
		? selected.reduce((sum, l) => sum + counts[l.key], 0)
		: 0;

	const download = () => {
		if (!run || building) return;
		setBuilding(true);
		setFailed(null);
		try {
			const doc = buildEmiGeoJson({
				run,
				result,
				params,
				layers,
				selection: usingSelection ? selection : null,
				startedAt: source?.startedAt,
				missionId: source?.id ?? null,
				missionName: source?.name ?? null,
			});
			const name = geoJsonFilename(run);
			const blob = new Blob([JSON.stringify(doc)], {
				type: "application/geo+json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = name;
			// Attached before the click: a detached anchor's download is ignored
			// in Firefox, which fails as "the button does nothing".
			document.body.append(a);
			a.click();
			a.remove();
			// The object URL pins the whole document in memory until it is
			// revoked, and a survey's worth of geometry is not small — but
			// revoking in the same task can cancel the download just started.
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
			setWrote(name);
		} catch (err) {
			// Building and stringifying a long survey can exceed the engine's
			// string limit. Silently doing nothing is the worst outcome: the
			// operator presses the button, no file appears, and nothing says why.
			setFailed(
				err instanceof Error
					? err.message
					: "The export could not be built.",
			);
			setWrote(null);
		} finally {
			setBuilding(false);
		}
	};

	return (
		<EmiPanelFrame title={props.title} snapshot={snapshot} stale={stale}>
			<div className="flex h-full w-full flex-col gap-2 p-2 text-[12px]">
				<div className="flex flex-col gap-1.5">
					{LAYERS.map((l) => (
						<div key={l.key} className="flex items-start gap-2">
							<Checkbox
								id={`emi-export-${l.key}`}
								checked={layers[l.key]}
								onCheckedChange={(v) =>
									setLayers({
										...layers,
										[l.key]: v === true,
									})
								}
								className="mt-0.5"
							/>
							<Label
								htmlFor={`emi-export-${l.key}`}
								className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0 font-normal"
							>
								<span className="flex items-baseline gap-1.5">
									<span className="truncate">{l.label}</span>
									<span className="tabular-nums text-muted-foreground">
										{counts ? counts[l.key] : "—"}
									</span>
								</span>
								<span className="truncate text-[10px] text-muted-foreground">
									{l.hint}
								</span>
							</Label>
						</div>
					))}
				</div>

				{/*
				  The hand-picked subset. Shown only once something is picked:
				  an empty checkbox reading "selected only (0)" invites exactly
				  the mistake it would cause — an export with no features in it.
				*/}
				{selection.size > 0 && (
					<div className="flex items-center gap-2 rounded-sm border border-dashed px-2 py-1.5">
						<Checkbox
							id="emi-export-picked"
							checked={pickedOnly}
							onCheckedChange={(v) => setPickedOnly(v === true)}
						/>
						<Label
							htmlFor="emi-export-picked"
							className="flex-1 cursor-pointer text-[11px] font-normal"
						>
							Only the{" "}
							<span className="tabular-nums font-medium">
								{selection.size}
							</span>{" "}
							picked
							{selection.size === 1 ? " mark" : " marks"}
						</Label>
						<Button
							size="sm"
							variant="ghost"
							className="h-6 px-2 text-[11px]"
							onClick={clearEmiSelection}
						>
							clear
						</Button>
					</div>
				)}

				<div className="mt-auto flex flex-col gap-1.5">
					<p className="text-[10px] text-muted-foreground">
						{selection.size === 0
							? "Click a mark to pick it out — a peak on the coil signals, or a detection or barycentre on the map. Each click picks that one mark and nothing else."
							: null}
					</p>
					<p className="text-[10px] text-muted-foreground">
						The file carries the full parameter set it was exported
						at, so the reading can be reproduced. Targets keep their{" "}
						<code className="text-[10px]">source</code> —{" "}
						<code className="text-[10px]">replay</code>,{" "}
						<code className="text-[10px]">fixed+gate</code> or{" "}
						<code className="text-[10px]">fixed+chain</code> — so
						they can be styled apart.
					</p>
					<Button
						size="sm"
						className="h-7 gap-1.5"
						disabled={!run || total === 0 || building}
						onClick={download}
					>
						<DownloadIcon className="size-3.5" />
						{building
							? "Building…"
							: usingSelection
								? "Export picked"
								: "Export GeoJSON"}
						{!building && total > 0 && !usingSelection && (
							<span className="tabular-nums opacity-70">
								({total})
							</span>
						)}
					</Button>
					{failed && (
						<p className="text-[10px] text-destructive">{failed}</p>
					)}
					{!failed && wrote && (
						<p className="truncate text-[10px] text-muted-foreground">
							Saved {wrote}
						</p>
					)}
				</div>
			</div>
		</EmiPanelFrame>
	);
};

/**
 * Widget definition for the exporter.
 *
 * @returns The definition.
 */
export function EmiExportDefinition(): WidgetDefinition<ExportSettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-export",
		name: "EMI export",
		description: "Write the run out as GeoJSON.",
		titleProp: "title",
		icon: <DownloadIcon />,
		schema: {
			type: "object",
			properties: { title: { type: "string", title: "Title" } },
		},
		uischema: layout,
		data: { title: "EMI export" },
		Component: EmiExport,
	};
}
