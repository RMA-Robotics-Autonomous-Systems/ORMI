"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Workspace, Category } from "@prisma/client";
import { WorkspaceItem } from "../workspace-item";
import { WorkspaceWithCategory } from "./types";

interface SortableWorkspaceItemProps {
	workspace: WorkspaceWithCategory;
	categories?: Category[];
	onWorkspacePatch?: (
		id: number,
		patch: Partial<
			Pick<Workspace, "name" | "categoryId" | "dashboardType">
		>,
	) => void;
	onWorkspaceReorder?: (
		updates: { id: number; order: number; categoryId?: number | null }[],
	) => Promise<void>;
	onWorkspaceDeleted: () => void;
}

export function SortableWorkspaceItem({
	workspace,
	categories,
	onWorkspacePatch,
	onWorkspaceReorder,
	onWorkspaceDeleted,
}: SortableWorkspaceItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: `workspace-${workspace.id}` });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<WorkspaceItem
				workspace={workspace}
				categories={categories}
				onWorkspacePatch={onWorkspacePatch}
				onWorkspaceReorder={onWorkspaceReorder}
				onWorkspaceDeleted={onWorkspaceDeleted}
			/>
		</div>
	);
}
