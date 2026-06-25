"use client";

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	RemoteCallDefinition,
	useAvailableRemoteCalls,
	useRemoteCall,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Copy, ListPlus, RefreshCw, Rocket, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { C2Call } from "../datasource/remote-calls";
import {
	MissionConfigIssue,
	validateMissionConfig,
} from "../types/mission-config-validation";
import {
	useSelectedMission,
	setSelectedMission,
} from "../state/selection-store";
import { publishMissionNames } from "../state/c2-catalog-store";
import {
	MissionRow,
	duplicateMission,
	newMissionStub,
	normalizeMissions,
} from "./mission-list";
import { MissionIssueList } from "./mission-issues";

/**
 * F4 — Mission browser widget.
 *
 * Lists stored mission definitions via `c2.missions.list` (fetch-on-mount), and
 * lets the operator select / create / duplicate / delete missions through the
 * C2 CRUD remote calls (`c2.missions.save` / `c2.missions.delete`).
 *
 * These are imperative one-shot calls (§4.1 F3) with no live list subscription,
 * so the list is **refetched after every write**.
 *
 * Selecting a row writes the C2 selection store (S3/D8) so the Phase-2 display
 * widgets (feedback/log/fleet) follow the active mission.
 *
 * This is a **command** widget — it gates on a C2 datasource via
 * `WIDGET_LIST_WITH_DATASOURCE` (§4.1) and surfaces remote-call errors inline
 * (it never blanks; per §13 command widgets do not gate on offline telemetry).
 */

/** Props for the MissionBrowser widget. */
interface MissionBrowserProps extends Record<string, unknown> {
	title: string;
	/** Pin to a specific C2 datasource id; empty → first available. */
	datasource_id?: string;
}

/** Resolve a C2 call definition by name from the available remote calls. */
function findCall(
	calls: RemoteCallDefinition[],
	name: string,
): RemoteCallDefinition | undefined {
	return calls.find((call) => call.name === name);
}

/** Inner body once the CRUD call definitions are resolved. */
function MissionBrowserBody(props: {
	listDef: RemoteCallDefinition;
	saveDef?: RemoteCallDefinition;
	deleteDef?: RemoteCallDefinition;
}) {
	const list = useRemoteCall<Record<string, never>, unknown>(props.listDef);
	const save = useRemoteCall<{ mission: unknown }, unknown>(
		props.saveDef ?? props.listDef,
	);
	const del = useRemoteCall<{ mission_id: string }, unknown>(
		props.deleteDef ?? props.listDef,
	);

	const active = useSelectedMission();
	const [rows, setRows] = useState<MissionRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [issues, setIssues] = useState<MissionConfigIssue[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [newName, setNewName] = useState("");

	const { execute: executeList } = list;

	/** Fetch (or refetch) the mission list. */
	const refetch = useCallback(async () => {
		setLoading(true);
		const result = await executeList({});
		setLoading(false);
		if (!result.success) {
			setError(result.error ?? "Failed to list missions");
			return;
		}
		setError(null);
		const nextRows = normalizeMissions(result.data);
		setRows(nextRows);
		publishMissionNames(nextRows);
	}, [executeList]);

	// Fetch-on-mount (and when the list call definition changes).
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const result = await executeList({});
			if (cancelled) return;
			setLoading(false);
			if (!result.success) {
				setError(result.error ?? "Failed to list missions");
				return;
			}
			setError(null);
			const nextRows = normalizeMissions(result.data);
			setRows(nextRows);
			publishMissionNames(nextRows);
		})();
		return () => {
			cancelled = true;
		};
	}, [executeList]);

	/** Save a mission object then refetch (write → refetch, §4.1 F3). */
	const saveAndRefetch = useCallback(
		async (mission: unknown, selectId?: string) => {
			if (!props.saveDef) {
				setError("c2.missions.save is unavailable");
				return;
			}
			// Draft-save: F4 has no UI to add vehicles/geometries yet (that's the
			// F5 editor, Phase 4), so a saved mission is a draft. We still validate
			// and surface the issues advisory-style so the operator sees what is
			// incomplete, but we do NOT block the save — the real planner-crash
			// gate stays HARD at F8 init (`c2.mission.init`).
			setIssues(validateMissionConfig(mission));
			setBusy(true);
			const result = await save.execute({ mission });
			setBusy(false);
			if (!result.success) {
				setError(result.error ?? "Failed to save mission");
				return;
			}
			setError(null);
			// Keep the advisory issues visible: the draft saved, but they tell the
			// operator what still needs filling in (in the F5 editor) before it can
			// be started.
			if (selectId) setSelectedMission(selectId);
			await refetch();
		},
		[props.saveDef, save, refetch],
	);

	/** Create a minimal new mission (stub — full authoring is F5/Phase 4). */
	const handleCreate = useCallback(async () => {
		const name = newName.trim() || "New mission";
		const stub = newMissionStub(name);
		setNewName("");
		await saveAndRefetch(stub, stub.mission_id);
	}, [newName, saveAndRefetch]);

	/** Duplicate an existing mission as a fresh copy. */
	const handleDuplicate = useCallback(
		async (row: MissionRow) => {
			const copy = duplicateMission(row.raw, `${row.name} (copy)`);
			await saveAndRefetch(copy, String(copy.mission_id));
		},
		[saveAndRefetch],
	);

	/** Delete a mission then refetch. */
	const handleDelete = useCallback(
		async (row: MissionRow) => {
			if (!props.deleteDef) {
				setError("c2.missions.delete is unavailable");
				return;
			}
			setBusy(true);
			const result = await del.execute({ mission_id: row.mission_id });
			setBusy(false);
			if (!result.success) {
				setError(result.error ?? "Failed to delete mission");
				return;
			}
			setError(null);
			if (active === row.mission_id) setSelectedMission(null);
			await refetch();
		},
		[props.deleteDef, del, refetch, active],
	);

	return (
		<div className="h-full flex flex-col gap-2 p-3 text-sm">
			{/* Toolbar */}
			<div className="flex items-center gap-2 shrink-0">
				<Badge variant="secondary">{rows.length} missions</Badge>
				<div className="flex-1" />
				<Input
					value={newName}
					onChange={(event) => setNewName(event.target.value)}
					placeholder="New mission name"
					className="h-7 w-40 text-xs"
					disabled={busy || !props.saveDef}
				/>
				<Button
					size="sm"
					variant="outline"
					className="h-7"
					onClick={handleCreate}
					disabled={busy || !props.saveDef}
					title="Create a minimal new mission (edit later in the mission editor)"
				>
					<ListPlus className="w-3.5 h-3.5 mr-1" />
					New
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="h-7 w-7 p-0"
					onClick={() => void refetch()}
					disabled={loading}
					title="Refresh"
				>
					<RefreshCw
						className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
					/>
				</Button>
			</div>

			{error && (
				<div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md shrink-0">
					{error}
				</div>
			)}
			<MissionIssueList
				issues={issues}
				title="This mission is not yet ready to start:"
			/>

			{/* Mission list */}
			<ScrollArea className="flex-1 min-h-0">
				<div className="flex flex-col gap-1 pr-2">
					{loading && rows.length === 0 && (
						<div className="text-muted-foreground text-xs">
							Loading missions…
						</div>
					)}
					{!loading && rows.length === 0 && (
						<div className="text-muted-foreground text-xs">
							No missions stored.
						</div>
					)}
					{rows.map((row) => {
						const selected = active === row.mission_id;
						return (
							<div
								key={row.mission_id}
								className={`border rounded-md p-2 flex items-center gap-2 cursor-pointer transition-colors ${
									selected
										? "border-primary bg-primary/5"
										: "hover:bg-muted/50"
								}`}
								onClick={() =>
									setSelectedMission(row.mission_id)
								}
							>
								{selected && (
									<Rocket className="w-3.5 h-3.5 text-primary shrink-0" />
								)}
								<div className="flex-1 min-w-0">
									<div
										className="font-medium truncate"
										title={row.name}
									>
										{row.name}
									</div>
									<div
										className="text-[11px] text-muted-foreground truncate"
										title={row.mission_id}
									>
										{row.mission_id}
									</div>
								</div>
								<Button
									size="sm"
									variant="ghost"
									className="h-7 w-7 p-0 shrink-0"
									disabled={busy || !props.saveDef}
									title="Duplicate"
									onClick={(event) => {
										event.stopPropagation();
										void handleDuplicate(row);
									}}
								>
									<Copy className="w-3.5 h-3.5" />
								</Button>
								<Button
									size="sm"
									variant="ghost"
									className="h-7 w-7 p-0 shrink-0 text-destructive"
									disabled={busy || !props.deleteDef}
									title="Delete"
									onClick={(event) => {
										event.stopPropagation();
										void handleDelete(row);
									}}
								>
									<Trash2 className="w-3.5 h-3.5" />
								</Button>
							</div>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}

/**
 * Host: resolves the `c2.missions.*` definitions from the available remote calls
 * (optionally pinned to a datasource). Renders a placeholder until a C2
 * datasource exposing the list call exists.
 */
const MissionBrowserWidget: React.FC<MissionBrowserProps> = (props) => {
	const { calls } = useAvailableRemoteCalls(
		props.datasource_id?.trim()
			? { datasource_id: props.datasource_id.trim() }
			: undefined,
	);

	const listDef = useMemo(
		() => findCall(calls, C2Call.MissionsList),
		[calls],
	);
	const saveDef = useMemo(
		() => findCall(calls, C2Call.MissionsSave),
		[calls],
	);
	const deleteDef = useMemo(
		() => findCall(calls, C2Call.MissionsDelete),
		[calls],
	);

	if (!listDef) {
		return (
			<div className="h-full flex items-center justify-center p-3 text-sm text-muted-foreground text-center">
				No C2 datasource available. Add a C2 Control datasource to
				browse missions.
			</div>
		);
	}

	return (
		<MissionBrowserBody
			listDef={listDef}
			saveDef={saveDef}
			deleteDef={deleteDef}
		/>
	);
};

/**
 * Widget definition for the mission browser widget (F4).
 * @returns Widget definition.
 */
export function MissionBrowserDefinition(): WidgetDefinition<MissionBrowserProps> {
	return {
		id: "c2-mission-browser-widget",
		name: "C2 Mission Browser",
		description:
			"List / select / create / duplicate / delete C2 missions (c2.missions.*); selecting drives the active mission",
		titleProp: "title",
		icon: <ListPlus />,

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
			title: "Missions",
		},
		Component: MissionBrowserWidget,
	} as WidgetDefinition<MissionBrowserProps>;
}
