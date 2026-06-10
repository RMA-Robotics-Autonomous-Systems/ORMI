"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Category } from "@prisma/client";

import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";

import { DashboardHeader } from "@/components/advanced/misc/dashboard-header";
import { CreateWSButton } from "@/components/advanced/misc/workspace-button";
import { DashboardShell } from "@/components/advanced/misc/dashboard-shell";
import { WorkspaceItem } from "@/components/advanced/misc/workspace-item";
import { WORKSPACE_VIEWS } from "@/components/advanced/workspace-views/registry";
import type { WorkspaceViewId } from "@/components/advanced/workspace-views/types";
import type { WorkspaceWithCategory } from "@/components/advanced/misc/kanban/types";
import { workspaceApi } from "@/lib/api/workspace-api";
import { categoriesApi } from "@/lib/api/categories-api";

const VIEW_STORAGE_KEY = "ormi.workspaceView";
const DEFAULT_VIEW: WorkspaceViewId = "LIST";

/** Read the persisted view preference, guarding against SSR. */
function readStoredView(): WorkspaceViewId {
	if (typeof window === "undefined") return DEFAULT_VIEW;
	const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
	if (stored && WORKSPACE_VIEWS.some((v) => v.id === stored)) {
		return stored as WorkspaceViewId;
	}
	return DEFAULT_VIEW;
}

export default function DashboardPage() {
	const { data: session, status } = useSession();
	const router = useRouter();

	const [workspaces, setWorkspaces] = useState<WorkspaceWithCategory[]>([]);
	const [categories, setCategories] = useState<Category[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [view, setView] = useState<WorkspaceViewId>(DEFAULT_VIEW);

	// Category creation (LIST + BOARD toolbar action)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [newCategoryName, setNewCategoryName] = useState("");

	// Restore persisted view preference on mount (client only).
	useEffect(() => {
		setView(readStoredView());
	}, []);

	useEffect(() => {
		if (status === "loading") return;

		if (!session?.user) {
			router.push("/signin");
			return;
		}
	}, [session, status, router]);

	const fetchData = useCallback(async () => {
		try {
			const [wsResult, catResult] = await Promise.all([
				workspaceApi.getAll(),
				categoriesApi.getAll(),
			]);

			if (wsResult.ok) {
				setWorkspaces(wsResult.data as WorkspaceWithCategory[]);
			} else {
				console.error("Failed to fetch workspaces", wsResult.error);
				setWorkspaces([]);
			}

			if (catResult.ok) {
				setCategories(catResult.data as Category[]);
			} else {
				toast.error(
					"Failed to fetch categories, rendering uncategorized workspaces only",
				);
				setCategories([]);
			}
		} catch (error) {
			console.error("Failed to fetch data", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (status !== "authenticated") return;
		fetchData();
	}, [status, fetchData]);

	const handleViewChange = useCallback((next: string) => {
		// ToggleGroup emits "" when the active item is re-clicked; ignore it.
		if (!next) return;
		const id = next as WorkspaceViewId;
		setView(id);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(VIEW_STORAGE_KEY, id);
		}
	}, []);

	const handleWorkspaceUpdate = useCallback(
		async (
			updates: {
				id: number;
				order: number;
				categoryId?: number | null;
			}[],
		) => {
			try {
				const result = await workspaceApi.reorder(updates);

				if (!result.ok) throw new Error(result.error);

				toast("Workspaces updated");
			} catch (error) {
				console.error("Error updating workspaces:", error);
				toast("Failed to update workspaces");
				// Refresh to restore the correct state
				fetchData();
			}
		},
		[fetchData],
	);

	const handleWorkspaceDeleted = useCallback(() => {
		fetchData();
	}, [fetchData]);

	const handleWorkspaceCreated = useCallback(() => {
		fetchData();
	}, [fetchData]);

	const handleCreateCategory = useCallback(async () => {
		if (!newCategoryName.trim()) return;

		try {
			const result = await categoriesApi.create(newCategoryName);

			if (!result.ok) throw new Error(result.error);

			setCategories((prev) => [...prev, result.data as Category]);
			setNewCategoryName("");
			setIsCreateDialogOpen(false);
			toast("Category created");
		} catch (error) {
			console.error(error);
			toast("Failed to create category");
		}
	}, [newCategoryName]);

	if (status === "loading") {
		return (
			<DashboardShell className="container mx-auto mt-8">
				<DashboardHeader
					heading="Workspaces"
					text="Organize your projects"
				/>
			</DashboardShell>
		);
	}

	if (!session?.user) {
		return null;
	}

	const activeView =
		WORKSPACE_VIEWS.find((v) => v.id === view) ?? WORKSPACE_VIEWS[0];
	const ActiveViewComponent = activeView?.Component;
	const ActiveViewSkeleton = activeView?.Skeleton;

	return (
		<DashboardShell className="container mx-auto mt-8">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
				<DashboardHeader
					heading="Workspaces"
					text="Organize your projects"
				/>
				<div className="flex items-center gap-2">
					<ToggleGroup
						type="single"
						variant="outline"
						value={view}
						onValueChange={handleViewChange}
						aria-label="Workspace view"
					>
						{WORKSPACE_VIEWS.map((definition) => {
							const Icon = definition.icon;
							return (
								<ToggleGroupItem
									key={definition.id}
									value={definition.id}
									aria-label={definition.name}
									title={
										definition.description ??
										definition.name
									}
								>
									<Icon className="size-4" />
									<span className="hidden sm:inline">
										{definition.name}
									</span>
								</ToggleGroupItem>
							);
						})}
					</ToggleGroup>

					{(view === "BOARD" || view === "LIST") && (
						<Button
							variant="outline"
							onClick={() => setIsCreateDialogOpen(true)}
						>
							<Plus className="mr-2 size-4" />
							New Category
						</Button>
					)}

					<CreateWSButton
						onWorkspaceCreated={handleWorkspaceCreated}
					/>
				</div>
			</div>

			{isLoading || !ActiveViewComponent ? (
				ActiveViewSkeleton ? (
					<ActiveViewSkeleton />
				) : (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
						{Array.from({ length: 6 }).map((_, i) => (
							<WorkspaceItem.Skeleton key={i} />
						))}
					</div>
				)
			) : (
				<ActiveViewComponent
					workspaces={workspaces}
					categories={categories}
					setWorkspaces={setWorkspaces}
					setCategories={setCategories}
					onWorkspaceDeleted={handleWorkspaceDeleted}
					onWorkspaceUpdate={handleWorkspaceUpdate}
				/>
			)}

			<Dialog
				open={isCreateDialogOpen}
				onOpenChange={setIsCreateDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create Category</DialogTitle>
						<DialogDescription>
							Add a new category to organize your workspaces.
						</DialogDescription>
					</DialogHeader>
					<div className="py-4">
						<Input
							placeholder="Category name"
							value={newCategoryName}
							onChange={(e) => setNewCategoryName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateCategory();
							}}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsCreateDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button onClick={handleCreateCategory}>Create</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</DashboardShell>
	);
}
