import Link from "next/link";
import { Workspace, Category } from "@prisma/client";
import { createAvatarDataUri } from "@workspace/utils";

import { DASHBOARD_TYPES } from "@workspace/ormi-core/dashboard";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@workspace/ui/components/card";
import { WorkspaceOperations } from "@/components/advanced/misc/workspace-operations";

import moment from "moment";

interface WorkspaceItemProps {
	workspace: Pick<
		Workspace,
		"id" | "name" | "createdAT" | "dashboardType" | "categoryId"
	> & { order?: number | null };
	/** Categories for the operations menu's "Change category" submenu. */
	categories?: Category[];
	/** Apply an optimistic local patch (rename / category / type switch). */
	onWorkspacePatch?: (
		id: number,
		patch: Partial<
			Pick<Workspace, "name" | "categoryId" | "dashboardType">
		>,
	) => void;
	/** Persist a reorder/recategorize (shared with drag-and-drop). */
	onWorkspaceReorder?: (
		updates: { id: number; order: number; categoryId?: number | null }[],
	) => Promise<void>;
	onWorkspaceDeleted?: () => void;
}

export function WorkspaceItem({
	workspace,
	categories,
	onWorkspacePatch,
	onWorkspaceReorder,
	onWorkspaceDeleted,
}: WorkspaceItemProps) {
	const avatarUrl = createAvatarDataUri("identicon", workspace.name);
	const dashboardType =
		DASHBOARD_TYPES.find((type) => type.id === workspace.dashboardType) ??
		DASHBOARD_TYPES[0];
	const DashboardTypeIcon = dashboardType.icon;

	return (
		<Card>
			<CardHeader className="pb-2">
				<Link
					href={`/dashboard/ws/${workspace.id}`}
					className="font-semibold hover:underline"
				>
					<div className="w-full h-32 relative overflow-hidden rounded-t-lg">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={avatarUrl}
							alt={`${workspace.name} avatar`}
							className="absolute inset-0 h-full w-full"
							style={{ objectFit: "contain" }}
						/>
					</div>

					<div className="mt-3 flex items-center justify-between gap-3">
						<span className="truncate">{workspace.name}</span>
						<div
							className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground"
							title={dashboardType.name}
						>
							<DashboardTypeIcon className="size-4" />
						</div>
					</div>
				</Link>
			</CardHeader>
			<CardContent className="flex items-center justify-between gap-3 py-1">
				<p className="text-sm text-muted-foreground">
					{workspace.createdAT
						? moment(workspace.createdAT).format("MMMM D, YYYY")
						: "No date available"}
				</p>
			</CardContent>
			<CardFooter className="pt-1 flex justify-end">
				<WorkspaceOperations
					workspace={{
						id: workspace.id,
						name: workspace.name,
						categoryId: workspace.categoryId,
						dashboardType: workspace.dashboardType,
						order: workspace.order,
					}}
					categories={categories}
					onWorkspacePatch={onWorkspacePatch}
					onWorkspaceReorder={onWorkspaceReorder}
					onWorkspaceDeleted={onWorkspaceDeleted}
				/>
			</CardFooter>
		</Card>
	);
}

WorkspaceItem.Skeleton = function WorkspaceItemSkeleton() {
	return (
		<Card>
			<div className="w-full h-32 bg-muted rounded-t-lg" />
			<CardHeader className="pb-2">
				<Skeleton className="h-5 w-2/5" />
			</CardHeader>
			<CardContent className="py-1">
				<Skeleton className="h-4 w-4/5" />
			</CardContent>
		</Card>
	);
};
