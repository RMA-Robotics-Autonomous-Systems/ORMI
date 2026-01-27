"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu";
import { MoreHorizontal, Pencil, Trash } from "lucide-react";
import { SortableWorkspaceItem } from "./item";
import { WorkspaceWithCategory } from "./types";

interface KanbanColumnProps {
  id: string;
  title: string;
  items: WorkspaceWithCategory[];
  onWorkspaceDeleted: () => void;
  categoryId?: number;
  onEdit?: (category: { id: number; name: string }) => void;
  onDelete?: (id: number) => void;
}

export function KanbanColumn({
  id,
  title,
  items,
  onWorkspaceDeleted,
  categoryId,
  onEdit,
  onDelete,
}: KanbanColumnProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: {
      type: "Column",
      category: { id: categoryId, name: title },
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex h-full w-[350px] min-w-[350px] flex-col rounded-lg border bg-muted/50"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-between p-4 font-semibold cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          {title}
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </div>
        {categoryId && categoryId !== -1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onEdit?.({ id: categoryId, name: title })}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete?.(categoryId)}
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <ScrollArea className="flex-1 p-4">
        <SortableContext
          id={id}
          items={items.map((w) => `workspace-${w.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-3">
            {items.map((workspace) => (
              <SortableWorkspaceItem
                key={workspace.id}
                workspace={workspace}
                onWorkspaceDeleted={onWorkspaceDeleted}
              />
            ))}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}
