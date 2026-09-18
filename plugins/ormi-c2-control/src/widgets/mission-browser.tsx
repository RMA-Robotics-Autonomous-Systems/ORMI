"use client";

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	RemoteCallDefinition,
	useAvailableRemoteCalls,
	useRemoteCall,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Copy, ListPlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { c2DatasourceSelectHook } from "../datasource/datasource-select";
import { C2Call } from "../datasource/remote-calls";
import { C2ErrorCode, c2ResultCode } from "../datasource/response";
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
import { PanelEmptyState } from "./panel-empty-state";
import { useContainerSize } from "./responsive";
import { useAsyncAction } from "./use-async-action";

/**
 * Mission browser widget.
 *
 * Lists stored mission definitions via `c2.missions.list` (fetch-on-mount), and
 * lets the operator select / create / duplicate / delete missions through the
 * C2 CRUD remote calls (`c2.missions.save` / `c2.missions.delete`).
 *
 * These are imperative one-shot remote calls with no live list subscription, so
 * the list is **refetched after every write**.
 *
 * Selecting a row writes the C2 selection store so the display widgets
 * (feedback, log, fleet, map) follow the active mission.
 *
 * This is a **command** widget — it gates on a C2 datasource via
 * `WIDGET_LIST_WITH_DATASOURCE` and surfaces remote-call errors inline (it never
 * blanks: command widgets do not gate on offline telemetry).
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
	const [rootRef, { size }] = useContainerSize<HTMLDivElement>();
	const [rows, setRows] = useState<MissionRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [issues, setIssues] = useState<MissionConfigIssue[]>([]);
	const [loading, setLoading] = useState(true);
	// In-flight guard for the write actions (create / duplicate / delete). One
	// latch across all of them — a write is in progress, so every action button is
	// disabled and re-entrant clicks are dropped. `pending` carries the action key
	// (`"save"` for create/duplicate; `"delete:<id>"` per row) so the clicked row's
	// Delete shows its own spinner. `busy` is the any-action-pending mirror used to
	// disable the whole toolbar/list.
	const { pending, run } = useAsyncAction<string>();
	const busy = pending !== null;
	const [newName, setNewName] = useState("");
	/**
	 * Pending delete confirmation, driving the AlertDialog. `null` when idle.
	 *
	 * Delete used to fire on the click, from a 28px ghost button sitting beside
	 * Duplicate in a dense list — one mis-aim permanently removed a mission, and
	 * there is no undo anywhere in this plugin. The mission map already confirms
	 * its destructive actions this way; same component, same shape.
	 */
	const [confirmDelete, setConfirmDelete] = useState<MissionRow | null>(null);

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

	/** Save a mission object then refetch (write → refetch). */
	const saveAndRefetch = useCallback(
		(mission: unknown, selectId?: string) => {
			if (!props.saveDef) {
				setError("c2.missions.save is unavailable");
				return;
			}
			return run("save", async () => {
				// Draft-save: the browser has no UI to add vehicles/geometries
				// (that is the mission editor's job), so a saved mission is a
				// draft. We still validate and surface the issues advisory-style so
				// the operator sees what is incomplete, but we do NOT block the
				// save — the real planner-crash gate stays HARD at the control
				// panel's Submit (`c2.mission.init`).
				setIssues(validateMissionConfig(mission));
				const result = await save.execute({ mission });
				if (!result.success) {
					setError(result.error ?? "Failed to save mission");
					return;
				}
				setError(null);
				// Keep the advisory issues visible: the draft saved, but they tell
				// the operator what still needs filling in (in the editor) before
				// it can be started.
				if (selectId) setSelectedMission(selectId);
				await refetch();
			});
		},
		[props.saveDef, save, refetch, run],
	);

	/** Create a minimal new mission (a stub — authoring is the editor's job). */
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
		(row: MissionRow) => {
			if (!props.deleteDef) {
				setError("c2.missions.delete is unavailable");
				return;
			}
			return run(`delete:${row.mission_id}`, async () => {
				const result = await del.execute({
					mission_id: row.mission_id,
				});
				if (!result.success) {
					// CODE BRANCH — 404 MISSION_NOT_FOUND (was a false 200): the
					// mission is already gone, so the operator's intent holds.
					// Reconcile the list instead of reporting a failure against a
					// row that should simply disappear.
					if (c2ResultCode(result) === C2ErrorCode.MissionNotFound) {
						setError(
							`"${row.name}" was already deleted from the mission store.`,
						);
						if (active === row.mission_id) setSelectedMission(null);
						await refetch();
						return;
					}
					// Lead with what failed and on which mission; the
					// transport's detail follows, never first.
					setError(
						`Deleting "${row.name}" from the mission store failed — ${result.error ?? "the request failed"}`,
					);
					return;
				}
				setError(null);
				if (active === row.mission_id) setSelectedMission(null);
				await refetch();
			});
		},
		[props.deleteDef, del, refetch, active, run],
	);

	/** Ask before deleting; {@link handleDelete} runs only on confirmation. */
	const requestDelete = useCallback((row: MissionRow) => {
		setConfirmDelete(row);
	}, []);

	const narrow = size === "xs";
	return (
		<div
			ref={rootRef}
			className={`h-full min-w-0 flex flex-col gap-2 text-sm ${narrow ? "p-2" : "p-3"}`}
		>
			{/* Header: count on the left, refresh pinned right. */}
			<div className="flex items-center gap-2 shrink-0 min-w-0">
				<Badge variant="secondary">{rows.length} missions</Badge>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					<Button
						size="icon-sm"
						variant="ghost"
						onClick={() => void refetch()}
						disabled={loading}
						title="Refresh"
						aria-label="Refresh the mission list"
					>
						<RefreshCw className={loading ? "animate-spin" : ""} />
					</Button>
				</div>
			</div>

			{/* Create: its own row, so the name field keeps a usable width
			    instead of being squeezed beside the header at narrow widths. */}
			<form
				className="flex items-center gap-2 shrink-0 min-w-0"
				onSubmit={(event) => {
					event.preventDefault();
					void handleCreate();
				}}
			>
				<Input
					value={newName}
					onChange={(event) => setNewName(event.target.value)}
					placeholder="New mission name"
					aria-label="New mission name"
					className="h-8 min-w-0 flex-1 text-xs"
					disabled={busy || !props.saveDef}
				/>
				<Button
					type="submit"
					size="sm"
					variant="outline"
					className="shrink-0"
					disabled={busy || !props.saveDef}
					title="Create a minimal new mission (edit later in the mission editor)"
					aria-label="Create mission"
				>
					{pending === "save" ? (
						<Loader2 className="animate-spin" />
					) : (
						<ListPlus />
					)}
					{narrow ? null : "New"}
				</Button>
			</form>

			{error && (
				<div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md shrink-0">
					{error}
				</div>
			)}
			<MissionIssueList
				issues={issues}
				title="This mission is not yet ready to start:"
			/>

			{/* Mission list. Radix wraps the content in a `display: table`
			    div that grows to its widest row, so `truncate` never engaged
			    and the per-row actions were pushed out of the panel; forcing it
			    to block keeps every row at the viewport's width. */}
			{rows.length === 0 ? (
				<PanelEmptyState>
					{loading ? "Loading missions…" : "No missions stored."}
				</PanelEmptyState>
			) : (
				<ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-viewport]>div]:!block">
					<ul
						className="flex flex-col gap-1 pr-2"
						aria-label="Missions"
					>
						{rows.map((row) => {
							const selected = active === row.mission_id;
							// Selection is carried by the border and background
							// alone, so selecting a row never shifts its content.
							return (
								<li
									key={row.mission_id}
									className={`border rounded-md pr-2 flex items-center gap-1 min-w-0 transition-colors ${
										selected
											? "border-primary bg-primary/5"
											: "hover:bg-muted/50"
									}`}
								>
									<button
										type="button"
										aria-pressed={selected}
										className="flex-1 min-w-0 self-stretch p-2 text-left rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
										onClick={() =>
											setSelectedMission(row.mission_id)
										}
									>
										<span
											className="block font-medium truncate"
											title={row.name}
										>
											{row.name}
										</span>
										{!narrow && (
											<span
												className="block text-[11px] text-muted-foreground truncate"
												title={row.mission_id}
											>
												{row.mission_id}
											</span>
										)}
									</button>
									<Button
										size="icon-sm"
										variant="ghost"
										disabled={busy || !props.saveDef}
										title="Duplicate"
										aria-label={`Duplicate "${row.name}"`}
										onClick={() => {
											void handleDuplicate(row);
										}}
									>
										<Copy />
									</Button>
									<Button
										size="icon-sm"
										variant="ghost"
										className="text-destructive hover:text-destructive"
										disabled={busy || !props.deleteDef}
										title="Delete"
										aria-label={`Delete "${row.name}"`}
										onClick={() => {
											requestDelete(row);
										}}
									>
										{pending ===
										`delete:${row.mission_id}` ? (
											<Loader2 className="animate-spin" />
										) : (
											<Trash2 />
										)}
									</Button>
								</li>
							);
						})}
					</ul>
				</ScrollArea>
			)}

			{/* Destructive-action confirmation — same pattern as the mission map. */}
			<AlertDialog
				open={confirmDelete != null}
				onOpenChange={(open) => {
					if (!open) setConfirmDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete mission?</AlertDialogTitle>
						<AlertDialogDescription>
							Permanently delete &quot;{confirmDelete?.name}&quot;
							from the mission store. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({
								variant: "destructive",
							})}
							onClick={() => {
								const row = confirmDelete;
								setConfirmDelete(null);
								if (row) void handleDelete(row);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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
			<PanelEmptyState>
				No C2 datasource available. Add a C2 Control datasource to
				browse missions.
			</PanelEmptyState>
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
 * Widget definition for the mission browser widget.
 * @returns Widget definition.
 */
export function MissionBrowserDefinition(): WidgetDefinition<MissionBrowserProps> {
	return {
		id: "c2-mission-browser-widget",
		name: "C2 Mission Browser",
		description: "Browse and manage C2 missions",
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
		extensibilityHook: c2DatasourceSelectHook,
	} as WidgetDefinition<MissionBrowserProps>;
}
