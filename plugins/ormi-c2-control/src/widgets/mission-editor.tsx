"use client";

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { JsonForms } from "@jsonforms/react";
import { shadcnRenderer, shadcnCells } from "@workspace/ormi-jsonforms";
import {
	RemoteCallDefinition,
	useAvailableRemoteCalls,
	useRemoteCall,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Separator } from "@workspace/ui/components/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { ChevronDown, MapPin, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { C2Call } from "../datasource/remote-calls";
import { C2Vehicle, MissionBehavior, MissionConfig } from "../types/c2-types";
import {
	MissionConfigIssue,
	isMissionConfigSubmittable,
	validateMissionConfig,
} from "../types/mission-config-validation";
import {
	MissionAdvancedData,
	missionAdvancedSchema,
	missionAdvancedUiSchema,
} from "../types/mission-config-schema";
import {
	useSelectedMission,
	setSelectedMission,
} from "../state/selection-store";
import { useC2MapEditing } from "../state/map-editing-store";
import { publishMissionNames, useFeatureName } from "../state/c2-catalog-store";
import { useAgentName } from "../state/c2-agents-store";
import {
	MissionDraft,
	buildMissionDraft,
	cleanMissionConfig,
	hydrateMissionDraft,
	patchDraft,
	pushFeatureRef,
	pushInlineGeometry,
	removeGeometryAt,
	toggleVehicle,
} from "./mission-editor-helpers";
import { MissionIssueList } from "./mission-issues";
import { normalizeMissions } from "./mission-list";

/**
 * F5 — Mission editor widget.
 *
 * Hybrid form: bespoke React for name / behavior / vehicle allocation /
 * objective-geometries list, plus embedded JSON-Forms for the deep OPTIONAL
 * blocks (arrival_time / transit / start) via {@link missionAdvancedSchema}.
 *
 * The draft is owned here via `useState` (one-way). Geometry hand-off from the
 * map (F6) is consumed via `useC2MapEditing` — explicit "Add picked feature" and
 * "Add drawn geometry" actions COPY into the draft. Live validation runs on every
 * change; error-severity issues disable Save. Save persists via
 * `c2.missions.save`, then sets the active mission so F8 drives it. "Load active
 * mission" hydrates from `c2.missions.list` for the selected mission (D9: the
 * plan stays read-only — this authors the config only).
 *
 * Command widget — gated on a C2 datasource via `WIDGET_LIST_WITH_DATASOURCE`.
 */

/** Props for the MissionEditor widget. */
interface MissionEditorProps extends Record<string, unknown> {
	title: string;
	/** Pin to a specific C2 datasource id; empty → first available. */
	datasource_id?: string;
}

/** Behavior options for the enum select. */
const BEHAVIOR_OPTIONS: [MissionBehavior, string][] = [
	[MissionBehavior.NAVIGATE, "0 — NAVIGATE"],
	[MissionBehavior.COVERAGE, "1 — COVERAGE"],
	[MissionBehavior.NAVIGATE_NO_PLANNING, "2 — NAVIGATE_NO_PLANNING"],
];

/** Resolve a C2 call definition by name. */
function findCall(
	calls: RemoteCallDefinition[],
	name: string,
): RemoteCallDefinition | undefined {
	return calls.find((call) => call.name === name);
}

/** Read an agent id off a roster vehicle, tolerating field-name variants. */
function vehicleId(vehicle: C2Vehicle): string | undefined {
	const id =
		vehicle.agent_id ??
		(vehicle as Record<string, unknown>).agentId ??
		(vehicle as Record<string, unknown>).id;
	return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * One row in the objective-geometries list.
 *
 * A hoisted (module-level) component so it can call {@link useFeatureName} for a
 * feature-reference geometry — hooks can't run inside the `.map` of the parent.
 * Its identity is stable across renders, so rows don't remount.
 */
function GeometryRow(props: {
	feature_id?: string;
	geometry_type?: string;
	onRemove: () => void;
}) {
	const featureName = useFeatureName(props.feature_id);
	return (
		<div className="border rounded-md p-2 text-xs flex items-center gap-2">
			<span className="flex-1 truncate" title={props.feature_id}>
				{props.feature_id
					? `feature: ${featureName}`
					: `inline: ${props.geometry_type ?? "geometry"}`}
			</span>
			<Button
				size="sm"
				variant="ghost"
				className="h-6 w-6 p-0 text-destructive"
				onClick={props.onRemove}
			>
				<Trash2 className="w-3.5 h-3.5" />
			</Button>
		</div>
	);
}

/**
 * One vehicle-allocation checkbox row.
 *
 * A hoisted (module-level) component so it can call {@link useAgentName} for the
 * agent's namespace name — hooks can't run inside the `.map` of the parent. Its
 * identity is stable across renders, so rows don't remount.
 *
 * ⚠ Only the LABEL shows the namespace name; the value stored in
 * `draft.vehicles[]` remains the `agent_id` (the caller toggles by `id`). The
 * full `id` stays in the `title` tooltip.
 */
function VehicleAllocationRow(props: {
	id: string;
	checked: boolean;
	onToggle: () => void;
}) {
	const name = useAgentName(props.id);
	return (
		<label className="flex items-center gap-2 text-xs cursor-pointer">
			<Checkbox
				checked={props.checked}
				onCheckedChange={props.onToggle}
			/>
			<span className="truncate" title={props.id}>
				{name}
			</span>
		</label>
	);
}

/** Extract the advanced (deep-optional) slice fed to JSON-Forms. */
function advancedSlice(draft: MissionDraft): MissionAdvancedData {
	return {
		arrival_time: draft.objective.arrival_time,
		transit: draft.transit,
		start: draft.start,
	};
}

/** Inner body once the save call definition is resolved. */
function MissionEditorBody(props: {
	saveDef: RemoteCallDefinition;
	listDef?: RemoteCallDefinition;
	vehiclesDef?: RemoteCallDefinition;
}) {
	const save = useRemoteCall<{ mission: unknown }, unknown>(props.saveDef);
	const list = useRemoteCall<Record<string, never>, unknown>(
		props.listDef ?? props.saveDef,
	);
	const vehicles = useRemoteCall<Record<string, never>, unknown>(
		props.vehiclesDef ?? props.saveDef,
	);

	const active = useSelectedMission();
	const { pickedFeatureId, draftGeometry } = useC2MapEditing();

	const [draft, setDraft] = useState<MissionDraft>(() => buildMissionDraft());
	const [roster, setRoster] = useState<C2Vehicle[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	// Advanced block is collapsed by default so it doesn't compete with the
	// required fields above it.
	const [advancedOpen, setAdvancedOpen] = useState(false);

	const { execute: executeVehicles } = vehicles;

	// Fetch the vehicle roster on mount for the allocation picker.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const result = await executeVehicles({});
			if (cancelled || !result.success) return;
			const data = result.data as unknown;
			const arr = Array.isArray(data)
				? data
				: Array.isArray((data as { vehicles?: unknown })?.vehicles)
					? (data as { vehicles: unknown[] }).vehicles
					: [];
			setRoster(arr as C2Vehicle[]);
		})();
		return () => {
			cancelled = true;
		};
	}, [executeVehicles]);

	// Validate/save a cleaned copy: empty optional blocks (transit/start/
	// arrival_time) are pruned so a half-formed block the operator never filled
	// doesn't trip C2's all-or-nothing rules. The form keeps the raw `draft`.
	const cleaned = useMemo(() => cleanMissionConfig(draft), [draft]);

	// Live validation (recomputed on every draft change).
	const issues: MissionConfigIssue[] = useMemo(
		() => validateMissionConfig(cleaned),
		[cleaned],
	);
	const submittable = useMemo(
		() => isMissionConfigSubmittable(cleaned),
		[cleaned],
	);

	/** Add the currently picked MapDB feature (F6 hand-off) by reference. */
	const addPickedFeature = useCallback(() => {
		if (!pickedFeatureId) return;
		setDraft((current) => pushFeatureRef(current, pickedFeatureId));
	}, [pickedFeatureId]);

	/** Add the currently drawn geometry (F6 hand-off) inline. */
	const addDrawnGeometry = useCallback(() => {
		if (!draftGeometry) return;
		setDraft((current) => pushInlineGeometry(current, draftGeometry));
	}, [draftGeometry]);

	/** Load the active mission for edit (hydrate from c2.missions.list). */
	const loadActive = useCallback(async () => {
		if (!active) {
			setError("No active mission selected to load.");
			return;
		}
		setBusy(true);
		const result = await list.execute({});
		setBusy(false);
		if (!result.success) {
			setError(result.error ?? "Failed to load missions");
			return;
		}
		const rows = normalizeMissions(result.data);
		publishMissionNames(rows);
		const match = rows.find((row) => row.mission_id === active);
		if (!match) {
			setError(`Active mission ${active} not found in store.`);
			return;
		}
		setError(null);
		setDraft(hydrateMissionDraft(match.raw));
	}, [active, list]);

	/** Save the draft, then make it the active mission (so F8 drives it). */
	const handleSave = useCallback(async () => {
		if (!submittable) return;
		setBusy(true);
		const result = await save.execute({ mission: cleaned });
		setBusy(false);
		if (!result.success) {
			setError(result.error ?? "Failed to save mission");
			return;
		}
		setError(null);
		setSelectedMission(cleaned.mission_id);
	}, [submittable, save, cleaned]);

	const allocated = useMemo(() => new Set(draft.vehicles), [draft.vehicles]);

	return (
		<div className="h-full flex flex-col gap-2 p-3 text-sm">
			{/* Toolbar */}
			<div className="flex items-center gap-2 shrink-0 flex-wrap">
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs"
					onClick={() => setDraft(buildMissionDraft())}
					disabled={busy}
				>
					<Plus className="w-3.5 h-3.5 mr-1" />
					New
				</Button>
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs"
					onClick={() => void loadActive()}
					disabled={busy || !active}
					title="Load the active mission for editing"
				>
					<Pencil className="w-3.5 h-3.5 mr-1" />
					Load active
				</Button>
				<div className="flex-1" />
				<Button
					size="sm"
					className="h-7 text-xs"
					onClick={() => void handleSave()}
					disabled={busy || !submittable}
					title={
						submittable
							? "Save mission"
							: "Resolve the errors below before saving"
					}
				>
					<Save className="w-3.5 h-3.5 mr-1" />
					Save
				</Button>
			</div>

			{error && (
				<div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md shrink-0">
					{error}
				</div>
			)}

			<MissionIssueList issues={issues} title="Mission config issues:" />

			<ScrollArea className="flex-1 min-h-0">
				<div className="flex flex-col gap-3 pr-2">
					{/* Name */}
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Name</Label>
						<Input
							value={draft.name}
							onChange={(e) =>
								setDraft((c) =>
									patchDraft(c, { name: e.target.value }),
								)
							}
							className="h-7 text-xs"
						/>
					</div>

					{/* Behavior */}
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Behavior</Label>
						<Select
							value={String(draft.behavior)}
							onValueChange={(value) =>
								setDraft((c) =>
									patchDraft(c, {
										behavior: Number(
											value,
										) as MissionBehavior,
									}),
								)
							}
						>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{BEHAVIOR_OPTIONS.map(([value, label]) => (
									<SelectItem
										key={value}
										value={String(value)}
									>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<Separator />

					{/* Vehicle allocation */}
					<div className="flex flex-col gap-1">
						<Label className="text-xs">
							Vehicles ({draft.vehicles.length} allocated)
						</Label>
						{roster.length === 0 ? (
							<div className="text-xs text-muted-foreground">
								No vehicles in the roster.
							</div>
						) : (
							<div className="flex flex-col gap-1">
								{roster.map((vehicle) => {
									const id = vehicleId(vehicle);
									if (!id) return null;
									return (
										<VehicleAllocationRow
											key={id}
											id={id}
											checked={allocated.has(id)}
											onToggle={() =>
												setDraft((c) =>
													toggleVehicle(c, id),
												)
											}
										/>
									);
								})}
							</div>
						)}
					</div>

					<Separator />

					{/* Objective geometries */}
					<div className="flex flex-col gap-1">
						<Label className="text-xs">
							Objective geometries (
							{draft.objective.geometries.length})
						</Label>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								disabled={!pickedFeatureId}
								onClick={addPickedFeature}
								title="Add the feature picked on the map by reference"
							>
								<MapPin className="w-3.5 h-3.5 mr-1" />
								Add picked feature
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								disabled={!draftGeometry}
								onClick={addDrawnGeometry}
								title="Add the geometry drawn on the map inline"
							>
								<Plus className="w-3.5 h-3.5 mr-1" />
								Add drawn geometry
							</Button>
						</div>
						<div className="flex flex-col gap-1 mt-1">
							{draft.objective.geometries.length === 0 && (
								<div className="text-xs text-muted-foreground">
									No geometries — pick a feature or draw one
									on the map.
								</div>
							)}
							{draft.objective.geometries.map((geom, index) => (
								<GeometryRow
									key={index}
									feature_id={geom.feature_id}
									geometry_type={geom.geometry?.geometry_type}
									onRemove={() =>
										setDraft((c) =>
											removeGeometryAt(c, index),
										)
									}
								/>
							))}
						</div>
					</div>

					<Separator />

					{/* Advanced (deep optional) — collapsed by default, embedded JSON-Forms */}
					<Collapsible
						open={advancedOpen}
						onOpenChange={setAdvancedOpen}
						className="flex flex-col gap-1"
					>
						<CollapsibleTrigger className="flex w-full items-center justify-between rounded-md py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
							<span>Advanced (optional)</span>
							<ChevronDown
								className={`h-4 w-4 transition-transform ${
									advancedOpen ? "rotate-180" : ""
								}`}
							/>
						</CollapsibleTrigger>
						<CollapsibleContent className="border rounded-md p-2">
							<JsonForms
								schema={missionAdvancedSchema}
								uischema={missionAdvancedUiSchema}
								data={advancedSlice(draft)}
								renderers={shadcnRenderer}
								cells={shadcnCells}
								onChange={({ data }) => {
									const next =
										(data as MissionAdvancedData) ?? {};
									setDraft((c) =>
										patchDraft(
											{
												...c,
												objective: {
													...c.objective,
													arrival_time:
														next.arrival_time as
															| MissionConfig["objective"]["arrival_time"]
															| undefined,
												},
											},
											{
												transit: next.transit as
													| MissionConfig["transit"]
													| undefined,
												start: next.start as
													| MissionConfig["start"]
													| undefined,
											},
										),
									);
								}}
							/>
						</CollapsibleContent>
					</Collapsible>

					<div className="text-[11px] text-muted-foreground">
						<Badge variant="outline" title={draft.mission_id}>
							{draft.name || "Unnamed mission"}
						</Badge>
					</div>
				</div>
			</ScrollArea>
		</div>
	);
}

/**
 * Host: resolves `c2.missions.save` (+ list / vehicles) from the available
 * remote calls. Renders a placeholder until the save call exists.
 */
const MissionEditorWidget: React.FC<MissionEditorProps> = (props) => {
	const { calls } = useAvailableRemoteCalls(
		props.datasource_id?.trim()
			? { datasource_id: props.datasource_id.trim() }
			: undefined,
	);

	const saveDef = useMemo(
		() => findCall(calls, C2Call.MissionsSave),
		[calls],
	);
	const listDef = useMemo(
		() => findCall(calls, C2Call.MissionsList),
		[calls],
	);
	const vehiclesDef = useMemo(
		() => findCall(calls, C2Call.VehiclesList),
		[calls],
	);

	if (!saveDef) {
		return (
			<div className="h-full flex items-center justify-center p-3 text-sm text-muted-foreground text-center">
				No C2 datasource available. Add a C2 Control datasource to
				author missions.
			</div>
		);
	}

	return (
		<MissionEditorBody
			saveDef={saveDef}
			listDef={listDef}
			vehiclesDef={vehiclesDef}
		/>
	);
};

/**
 * Widget definition for the mission editor widget (F5).
 * @returns Widget definition.
 */
export function MissionEditorDefinition(): WidgetDefinition<MissionEditorProps> {
	return {
		id: "c2-mission-editor-widget",
		name: "C2 Mission Editor",
		description:
			"Author a mission config (name, behavior, vehicles, objective geometries, transit/start) and save via c2.missions.save",
		titleProp: "title",
		icon: <Pencil />,

		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				datasource_id: {
					type: "string",
					title: "C2 datasource id (optional)",
				},
			},
			required: ["title"],
		},

		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/datasource_id",
				} as ControlElement,
			],
		} as VerticalLayout,

		data: {
			title: "Mission Editor",
		},
		Component: MissionEditorWidget,
	} as WidgetDefinition<MissionEditorProps>;
}
