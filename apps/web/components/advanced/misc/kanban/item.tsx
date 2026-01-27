"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WorkspaceItem } from "../workspace-item";
import { WorkspaceWithCategory } from "./types";

interface SortableWorkspaceItemProps {
  workspace: WorkspaceWithCategory;
  onWorkspaceDeleted: () => void;
}

export function SortableWorkspaceItem({
  workspace,
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
        onWorkspaceDeleted={onWorkspaceDeleted}
      />
    </div>
  );
}
