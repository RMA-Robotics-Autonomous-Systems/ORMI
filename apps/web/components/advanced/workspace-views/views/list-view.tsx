"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { DASHBOARD_TYPES } from "@workspace/ormi-core/dashboard";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

import { WorkspaceOperations } from "@/components/advanced/misc/workspace-operations";
import type { WorkspaceWithCategory } from "@/components/advanced/misc/kanban/types";
import type { WorkspaceViewProps } from "../types";
import { getCategoryColor, isUncategorized } from "./category-color";

/** Columns that support client-side sorting. */
type SortKey = "name" | "category";
type SortDirection = "asc" | "desc";

/**
 * Active sort state. `null` means "no header clicked yet" — the view falls back
 * to the composite Category → Type → Name default comparator until the user
 * picks a single column.
 */
type SortState = { key: SortKey; direction: SortDirection } | null;

/** Sentinel value used by the inline category Select for "Uncategorized". */
const UNCATEGORIZED_VALUE = "uncategorized";

/** Resolve the dashboard layout type metadata for a workspace, with a fallback. */
function resolveDashboardType(dashboardType: string) {
	return (
		DASHBOARD_TYPES.find((type) => type.id === dashboardType) ??
		DASHBOARD_TYPES[0]
	);
}

/**
 * Extract the display names of the datasources persisted in a workspace's
 * `content`. The dashboard persists datasources as a record keyed by id, each
 * entry being `{ datasource_id, settings: { title, ... } }` — the same shape
 * core's status badges read (`ds.settings.title`). Returns an empty array when
 * `content` is missing or malformed; this view never throws on bad data.
 */
function getDatasourceNames(content: unknown): string[] {
	if (!content || typeof content !== "object") return [];
	const datasources = (content as { datasources?: unknown }).datasources;
	if (!datasources || typeof datasources !== "object") return [];

	const names: string[] = [];
	for (const entry of Object.values(datasources as Record<string, unknown>)) {
		if (!entry || typeof entry !== "object") continue;
		const settings = (entry as { settings?: unknown }).settings;
		const title =
			settings && typeof settings === "object"
				? (settings as { title?: unknown }).title
				: undefined;
		const datasourceId = (entry as { datasource_id?: unknown })
			.datasource_id;
		if (typeof title === "string" && title.trim()) {
			names.push(title);
		} else if (typeof datasourceId === "string") {
			names.push(datasourceId);
		}
	}
	return names;
}

/**
 * Header cell that toggles sorting for its column. Clicking cycles the active
 * column to ascending, then descending; clicking another column activates it
 * ascending.
 */
function SortableHeader({
	label,
	sortKey,
	sort,
	onSort,
	className,
}: {
	label: string;
	sortKey: SortKey;
	sort: SortState;
	onSort: (key: SortKey) => void;
	className?: string;
}) {
	const active = sort?.key === sortKey;
	const Icon = !active
		? ChevronsUpDown
		: sort.direction === "asc"
			? ArrowUp
			: ArrowDown;

	return (
		<TableHead className={className}>
			<button
				type="button"
				onClick={() => onSort(sortKey)}
				className={cn(
					"-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-left font-medium transition-colors hover:text-foreground",
					active ? "text-foreground" : "text-muted-foreground",
				)}
				aria-label={`Sort by ${label}`}
			>
				<span>{label}</span>
				<Icon className="size-3.5 opacity-70" />
			</button>
		</TableHead>
	);
}

/**
 * List/Table workspace browser view. Receives data via props and renders one
 * dense row per workspace. The Name cell is prefixed with the dashboard type
 * icon (GRID/FLEX); a Category cell offers inline reassignment; a Datasources
 * cell shows one badge per configured datasource. Clicking a row opens the
 * workspace; the actions cell and the Category Select (a tight wrapper around
 * the control only) stop event propagation so they do not trigger row
 * navigation — clicking anywhere else in the Category cell still opens it.
 *
 * Each row carries a deterministic per-category accent (a colored left strip on
 * the Name cell plus a matching dot before the category Select). The color is
 * derived from the category id via {@link getCategoryColor}, so a category keeps
 * the same color across renders/sessions without any schema change.
 * "Uncategorized" rows get a neutral hollow treatment (no strip, outlined dot).
 *
 * Sorting is local UI state with two modes:
 * - **Default (no header clicked):** a stable composite comparator orders rows
 *   by Category → Type (GRID/FLEX) → Name, all ascending, with "Uncategorized"
 *   sorted last.
 * - **Single-column (after a header click):** clicking a sortable header (Name
 *   or Category) toggles asc/desc on that one column.
 *
 * The Category cell reassigns a workspace's `categoryId` optimistically (via
 * `setWorkspaces`) and persists through `onWorkspaceUpdate` — the same API path
 * the board uses for drag-and-drop recategorization. On failure
 * `onWorkspaceUpdate` refetches, restoring state.
 */
const ListView: React.FC<WorkspaceViewProps> = ({
	workspaces,
	categories,
	setWorkspaces,
	onWorkspaceDeleted,
	onWorkspaceUpdate,
}) => {
	const router = useRouter();
	const [sort, setSort] = useState<SortState>(null);

	const categoryNameById = useMemo(() => {
		const map = new Map<number, string>();
		for (const category of categories) map.set(category.id, category.name);
		return map;
	}, [categories]);

	const sortedWorkspaces = useMemo(() => {
		const categoryName = (ws: WorkspaceWithCategory) =>
			ws.categoryId != null
				? (categoryNameById.get(ws.categoryId) ?? "")
				: "";

		/**
		 * Compare two workspaces by category name, sorting uncategorized
		 * (empty name) last.
		 */
		const compareCategory = (
			a: WorkspaceWithCategory,
			b: WorkspaceWithCategory,
		): number => {
			const an = categoryName(a);
			const bn = categoryName(b);
			if (an === "" && bn !== "") return 1;
			if (an !== "" && bn === "") return -1;
			return an.localeCompare(bn, undefined, { sensitivity: "base" });
		};

		const compareType = (
			a: WorkspaceWithCategory,
			b: WorkspaceWithCategory,
		): number =>
			resolveDashboardType(a.dashboardType).name.localeCompare(
				resolveDashboardType(b.dashboardType).name,
				undefined,
				{ sensitivity: "base" },
			);

		const compareName = (
			a: WorkspaceWithCategory,
			b: WorkspaceWithCategory,
		): number =>
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

		/**
		 * Default composite comparator: Category → Type → Name, all ascending.
		 * Used until the user clicks a column header.
		 */
		const compositeCompare = (
			a: WorkspaceWithCategory,
			b: WorkspaceWithCategory,
		): number =>
			compareCategory(a, b) || compareType(a, b) || compareName(a, b);

		if (sort === null) {
			return [...workspaces].sort(compositeCompare);
		}

		const compare = (
			a: WorkspaceWithCategory,
			b: WorkspaceWithCategory,
		): number => {
			switch (sort.key) {
				case "name":
					return compareName(a, b);
				case "category":
					return categoryName(a).localeCompare(categoryName(b));
				default:
					return 0;
			}
		};

		const next = [...workspaces].sort(compare);
		if (sort.direction === "desc") next.reverse();
		return next;
	}, [workspaces, sort, categoryNameById]);

	const handleSort = (key: SortKey) => {
		setSort((prev) =>
			prev?.key === key
				? {
						key,
						direction: prev.direction === "asc" ? "desc" : "asc",
					}
				: { key, direction: "asc" },
		);
	};

	/**
	 * Reassign a workspace's category. Optimistically updates local state, then
	 * persists via the shared workspace-update path (same as the board). The
	 * page-level handler refetches on failure, reverting the optimistic change.
	 */
	const handleCategoryChange = (
		workspace: WorkspaceWithCategory,
		value: string,
	) => {
		const nextCategoryId =
			value === UNCATEGORIZED_VALUE ? null : Number(value);
		if (nextCategoryId === workspace.categoryId) return;

		setWorkspaces((prev) =>
			prev.map((w) =>
				w.id === workspace.id
					? { ...w, categoryId: nextCategoryId }
					: w,
			),
		);

		void onWorkspaceUpdate([
			{
				id: workspace.id,
				order: workspace.order ?? 0,
				categoryId: nextCategoryId,
			},
		]);
	};

	if (workspaces.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No workspaces yet. Create one to get started.
			</p>
		);
	}

	return (
		<div className="rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/50 hover:bg-muted/50">
						<SortableHeader
							label="Name"
							sortKey="name"
							sort={sort}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Category"
							sortKey="category"
							sort={sort}
							onSort={handleSort}
						/>
						<TableHead>Datasources</TableHead>
						<TableHead className="w-12 text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sortedWorkspaces.map((workspace, index) => {
						const dashboardType = resolveDashboardType(
							workspace.dashboardType,
						);
						const DashboardTypeIcon = dashboardType.icon;
						const categoryValue =
							workspace.categoryId != null
								? String(workspace.categoryId)
								: UNCATEGORIZED_VALUE;
						const datasourceNames = getDatasourceNames(
							workspace.content,
						);
						const accentColor = getCategoryColor(
							workspace.categoryId,
						);
						const uncategorized = isUncategorized(
							workspace.categoryId,
						);
						// First row of a new category group (default composite
						// order only — single-column sorts aren't grouped): add a
						// subtle top divider so contiguous same-category rows
						// "breathe" without full group-header rows.
						const startsNewGroup =
							sort === null &&
							index > 0 &&
							sortedWorkspaces[index - 1]?.categoryId !==
								workspace.categoryId;

						return (
							<TableRow
								key={workspace.id}
								role="link"
								tabIndex={0}
								onClick={() =>
									router.push(`/dashboard/ws/${workspace.id}`)
								}
								onKeyDown={(event) => {
									if (
										event.key === "Enter" ||
										event.key === " "
									) {
										event.preventDefault();
										router.push(
											`/dashboard/ws/${workspace.id}`,
										);
									}
								}}
								className={cn(
									"cursor-pointer",
									startsNewGroup &&
										"border-t-4 border-t-muted/60",
								)}
							>
								<TableCell
									className="font-medium"
									style={
										uncategorized
											? undefined
											: {
													boxShadow: `inset 3px 0 0 0 ${accentColor}`,
												}
									}
								>
									<span
										className="inline-flex items-center gap-2"
										title={dashboardType.name}
									>
										<DashboardTypeIcon className="size-4 shrink-0 text-muted-foreground" />
										<span>{workspace.name}</span>
									</span>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
										<span
											aria-hidden
											className={cn(
												"size-2 shrink-0 rounded-full",
												uncategorized &&
													"border border-muted-foreground",
											)}
											style={
												uncategorized
													? undefined
													: {
															backgroundColor:
																accentColor,
														}
											}
										/>
										{/* Only the Select control stops row
											navigation; the surrounding cell area
											(padding, dot) opens the workspace. */}
										<div
											onClick={(event) =>
												event.stopPropagation()
											}
											onKeyDown={(event) =>
												event.stopPropagation()
											}
										>
											<Select
												value={categoryValue}
												onValueChange={(value) =>
													handleCategoryChange(
														workspace,
														value,
													)
												}
											>
												<SelectTrigger className="h-8 w-[180px] text-muted-foreground">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem
														value={
															UNCATEGORIZED_VALUE
														}
													>
														Uncategorized
													</SelectItem>
													{categories.map(
														(category) => (
															<SelectItem
																key={
																	category.id
																}
																value={String(
																	category.id,
																)}
															>
																{category.name}
															</SelectItem>
														),
													)}
												</SelectContent>
											</Select>
										</div>
									</div>
								</TableCell>
								<TableCell>
									{datasourceNames.length > 0 ? (
										<div className="flex flex-wrap gap-1">
											{datasourceNames.map(
												(name, index) => (
													<Badge
														key={`${name}-${index}`}
														variant="secondary"
													>
														{name}
													</Badge>
												),
											)}
										</div>
									) : (
										<span className="text-sm text-muted-foreground">
											None
										</span>
									)}
								</TableCell>
								<TableCell
									className="text-right"
									onClick={(event) => event.stopPropagation()}
									onKeyDown={(event) =>
										event.stopPropagation()
									}
								>
									<div className="flex justify-end">
										<WorkspaceOperations
											workspace={{
												id: workspace.id,
												name: workspace.name,
												categoryId:
													workspace.categoryId,
												dashboardType:
													workspace.dashboardType,
												order: workspace.order,
											}}
											categories={categories}
											onWorkspacePatch={(id, patch) =>
												setWorkspaces((prev) =>
													prev.map((w) =>
														w.id === id
															? { ...w, ...patch }
															: w,
													),
												)
											}
											onWorkspaceReorder={
												onWorkspaceUpdate
											}
											onWorkspaceDeleted={
												onWorkspaceDeleted
											}
										/>
									</div>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
};

/**
 * Loading skeleton matching the List view's table layout: a header row plus a
 * handful of placeholder rows mirroring the Name / Category / Datasources /
 * Actions columns. Stable module-level reference (Pattern 10).
 */
const ListViewSkeleton: React.FC = () => {
	return (
		<div className="rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/50 hover:bg-muted/50">
						<TableHead>Name</TableHead>
						<TableHead>Category</TableHead>
						<TableHead>Datasources</TableHead>
						<TableHead className="w-12 text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{Array.from({ length: 6 }).map((_, i) => (
						<TableRow key={i}>
							<TableCell>
								<div className="flex items-center gap-2">
									<Skeleton className="size-4" />
									<Skeleton className="h-4 w-32" />
								</div>
							</TableCell>
							<TableCell>
								<Skeleton className="h-8 w-[180px]" />
							</TableCell>
							<TableCell>
								<div className="flex gap-1">
									<Skeleton className="h-5 w-16" />
									<Skeleton className="h-5 w-16" />
								</div>
							</TableCell>
							<TableCell className="text-right">
								<div className="flex justify-end">
									<Skeleton className="size-8" />
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
};

export { ListViewSkeleton };
export default ListView;
