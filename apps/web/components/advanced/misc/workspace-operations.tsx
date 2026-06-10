/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Workspace, Category } from "@prisma/client";

import { DASHBOARD_TYPES } from "@workspace/ormi-core/dashboard";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";

import { toast } from "sonner";

import { MoreVertical, Loader2, Trash, AlertTriangle } from "lucide-react";
import WorkspaceImport from "./workspace-import";

import { handleDelete } from "@/lib/data/prisma-workspaces";
import { workspaceApi } from "@/lib/api/workspace-api";

/** Sentinel value used by the category Select for the "Uncategorized" (null) option. */
const UNCATEGORIZED_VALUE = "uncategorized";

/** A persistable dashboard type id (the schema only accepts these two). */
type DashboardTypeId = "GRID" | "FLEX";

async function deleteWorkspace(wsId: number) {
	return await handleDelete(wsId);
}

async function exportWorkspace(wsId: number) {
	// download the workspace as a json file
	const result = await workspaceApi.getById(wsId);

	if (!result.ok) {
		toast("Your workspace was not exported. Please try again.");
		return false;
	}

	const workspace = result.data as any;
	if (!workspace) {
		toast("Failed to export workspace. Please try again.");
		return false;
	}

	const workspaceTitle = workspace.name || "workspace";

	// get the blob from the response
	const blob = new Blob([JSON.stringify(workspace)], {
		type: "application/json",
	});
	// create a link element
	const link = document.createElement("a");
	// create a url for the blob
	const url = URL.createObjectURL(blob);
	link.href = url;
	link.download = `${workspaceTitle}.json`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	// revoke the object url
	URL.revokeObjectURL(url);
	toast("Your workspace was exported successfully.");
	return true;
}

/** The subset of workspace fields the operations menu reads/mutates. */
type OperableWorkspace = Pick<
	Workspace,
	"id" | "name" | "categoryId" | "dashboardType"
> & {
	/** Sort order, threaded so category reassignment can reuse the reorder path. */
	order?: number | null;
};

interface WorkspaceOperationsProps {
	workspace: OperableWorkspace;
	/** Categories available for the Edit dialog's category Select. */
	categories?: Category[];
	/**
	 * Apply an optimistic local patch to the workspace (e.g. after rename,
	 * recategorize, or type switch). The owning view persists the canonical state.
	 */
	onWorkspacePatch?: (
		id: number,
		patch: Partial<
			Pick<Workspace, "name" | "categoryId" | "dashboardType">
		>,
	) => void;
	/**
	 * Persist a reorder/recategorize. Reuses the same path the board's
	 * drag-and-drop and the list's inline Select use for category changes.
	 */
	onWorkspaceReorder?: (
		updates: { id: number; order: number; categoryId?: number | null }[],
	) => Promise<void>;
	onWorkspaceDeleted?: () => void;
}

/**
 * Per-workspace actions menu. The "Edit" item opens a single consolidated
 * **Edit workspace** dialog that renames, recategorizes, and migrates the
 * dashboard layout type in one place — clicking the row/card title already
 * opens the workspace, so there is no separate "Open" item. Export / Import /
 * Delete are unchanged.
 *
 * Each field persists only when it actually changed:
 * - name and dashboardType go through `workspaceApi.update` (PUT), combined into
 *   a single call when both changed;
 * - categoryId reuses the shared `onWorkspaceReorder` path (the same one the
 *   board's drag-and-drop and the list's inline Select use).
 *
 * Changing the dashboard type surfaces an inline reset-layout warning, because
 * the new engine starts from its default arrangement (widgets and datasources
 * are preserved; only the layout positions reset).
 */
export function WorkspaceOperations({
	workspace,
	categories = [],
	onWorkspacePatch,
	onWorkspaceReorder,
	onWorkspaceDeleted,
}: WorkspaceOperationsProps) {
	const router = useRouter();
	const [showDeleteAlert, setShowDeleteAlert] =
		React.useState<boolean>(false);
	const [isDeleteLoading, setIsDeleteLoading] =
		React.useState<boolean>(false);

	// Edit dialog state.
	const [showEdit, setShowEdit] = React.useState<boolean>(false);
	const [isSaving, setIsSaving] = React.useState<boolean>(false);

	// Draft field values, seeded from the workspace when the dialog opens.
	const [nameDraft, setNameDraft] = React.useState<string>(workspace.name);
	const [categoryDraft, setCategoryDraft] = React.useState<string>(
		workspace.categoryId != null
			? String(workspace.categoryId)
			: UNCATEGORIZED_VALUE,
	);
	const [typeDraft, setTypeDraft] = React.useState<DashboardTypeId>(
		(DASHBOARD_TYPES.find((type) => type.id === workspace.dashboardType)
			?.id as DashboardTypeId) ??
			(DASHBOARD_TYPES[0].id as DashboardTypeId),
	);

	const currentCategoryValue =
		workspace.categoryId != null
			? String(workspace.categoryId)
			: UNCATEGORIZED_VALUE;
	const currentTypeId =
		(DASHBOARD_TYPES.find((type) => type.id === workspace.dashboardType)
			?.id as DashboardTypeId) ??
		(DASHBOARD_TYPES[0].id as DashboardTypeId);

	/** Reset all drafts to the workspace's current values. */
	const seedDrafts = React.useCallback(() => {
		setNameDraft(workspace.name);
		setCategoryDraft(currentCategoryValue);
		setTypeDraft(currentTypeId);
	}, [workspace.name, currentCategoryValue, currentTypeId]);

	const trimmedName = nameDraft.trim();
	const nameChanged =
		trimmedName.length > 0 && trimmedName !== workspace.name;
	const categoryChanged = categoryDraft !== currentCategoryValue;
	const typeChanged = typeDraft !== currentTypeId;
	const nameInvalid = trimmedName.length === 0;
	const hasChanges = nameChanged || categoryChanged || typeChanged;
	const saveDisabled = isSaving || nameInvalid || !hasChanges;

	const nextCategoryId =
		categoryDraft === UNCATEGORIZED_VALUE ? null : Number(categoryDraft);

	const handleSave = async () => {
		if (saveDisabled) return;
		setIsSaving(true);

		// 1. Persist name and/or dashboardType through a single PUT, when changed.
		if (nameChanged || typeChanged) {
			const result = await workspaceApi.update(workspace.id, {
				...(nameChanged ? { name: trimmedName } : {}),
				...(typeChanged ? { dashboardType: typeDraft } : {}),
			});

			if (!result.ok) {
				setIsSaving(false);
				toast("Failed to save workspace changes. Please try again.");
				return;
			}

			onWorkspacePatch?.(workspace.id, {
				...(nameChanged ? { name: trimmedName } : {}),
				...(typeChanged ? { dashboardType: typeDraft } : {}),
			});
		}

		// 2. Persist category through the shared reorder path, when changed.
		if (categoryChanged) {
			onWorkspacePatch?.(workspace.id, { categoryId: nextCategoryId });
			try {
				await onWorkspaceReorder?.([
					{
						id: workspace.id,
						order: workspace.order ?? 0,
						categoryId: nextCategoryId,
					},
				]);
			} catch {
				setIsSaving(false);
				toast("Failed to update category. Please try again.");
				return;
			}
		}

		setIsSaving(false);
		setShowEdit(false);
		toast("Workspace updated.");
		router.refresh();
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted">
					<MoreVertical className="h-4 w-4" />
					<span className="sr-only">Open</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onSelect={(e) => {
							// Keep the dropdown from unmounting the dialog as it closes.
							e.preventDefault();
							seedDrafts();
							setShowEdit(true);
						}}
					>
						Edit
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={() => exportWorkspace(workspace.id)}
					>
						Export
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={(e) => {
							// Prevent the dropdown from closing when selecting import
							e.preventDefault();
						}}
					>
						<WorkspaceImport wsId={workspace.id.toString()} />
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="flex cursor-pointer items-center text-destructive focus:text-destructive"
						onSelect={() => setShowDeleteAlert(true)}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={showEdit} onOpenChange={setShowEdit}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit workspace</DialogTitle>
						<DialogDescription>
							Rename this workspace, move it to another category,
							or change its dashboard layout type.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="workspace-name">Name</Label>
							<Input
								id="workspace-name"
								placeholder="Workspace name"
								value={nameDraft}
								onChange={(e) => setNameDraft(e.target.value)}
								autoFocus
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="workspace-category">Category</Label>
							<Select
								value={categoryDraft}
								onValueChange={setCategoryDraft}
							>
								<SelectTrigger id="workspace-category">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNCATEGORIZED_VALUE}>
										Uncategorized
									</SelectItem>
									{categories.map((category) => (
										<SelectItem
											key={category.id}
											value={String(category.id)}
										>
											{category.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-2">
							<Label>Dashboard type</Label>
							<div className="grid grid-cols-2 gap-2">
								{DASHBOARD_TYPES.map((type) => {
									const TypeIcon = type.icon;
									const selected = typeDraft === type.id;
									return (
										<button
											key={type.id}
											type="button"
											onClick={() =>
												setTypeDraft(
													type.id as DashboardTypeId,
												)
											}
											aria-pressed={selected}
											className={cn(
												"flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
												selected
													? "border-primary bg-primary/5"
													: "hover:bg-muted",
											)}
										>
											<TypeIcon className="size-4 shrink-0" />
											<span className="truncate">
												{type.name}
											</span>
										</button>
									);
								})}
							</div>
						</div>

						{typeChanged && (
							<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<p>
									Your widgets and datasources are kept, but
									the current layout arrangement will reset to
									the new engine&apos;s default.
								</p>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowEdit(false)}
							disabled={isSaving}
						>
							Cancel
						</Button>
						<Button
							onClick={() => void handleSave()}
							disabled={saveDisabled}
						>
							{isSaving && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={showDeleteAlert}
				onOpenChange={setShowDeleteAlert}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Are you sure you want to delete this workspace?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={async (event) => {
								event.preventDefault();
								setIsDeleteLoading(true);

								const deleted = await deleteWorkspace(
									workspace.id,
								);

								if (deleted) {
									setIsDeleteLoading(false);
									setShowDeleteAlert(false);
									if (onWorkspaceDeleted) {
										onWorkspaceDeleted();
									}
									router.refresh();
								}
							}}
							className="bg-destructive focus:ring-destructive"
						>
							{isDeleteLoading ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Trash className="mr-2 h-4 w-4" />
							)}
							<span>Delete</span>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
