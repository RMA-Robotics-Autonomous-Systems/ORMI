import { List, Columns3 } from "lucide-react";

import { KanbanViewSkeleton } from "@/components/advanced/misc/kanban";
import KanbanView from "@/components/advanced/misc/kanban";
import ListView, { ListViewSkeleton } from "./views/list-view";
import type { WorkspaceViewDefinition } from "./types";

/**
 * Registry of available workspace browser views. Each entry's `Component` is a
 * stable module-level reference (Pattern 10).
 *
 * LIST is the default and is listed first; BOARD adds category grouping and
 * drag-and-drop. (The earlier GRID view was removed — it was redundant with
 * BOARD's card layout.)
 */
export const WORKSPACE_VIEWS: WorkspaceViewDefinition[] = [
	{
		id: "LIST",
		name: "List",
		icon: List,
		description: "Dense, sortable table of all workspaces.",
		Component: ListView,
		Skeleton: ListViewSkeleton,
	},
	{
		id: "BOARD",
		name: "Board",
		icon: Columns3,
		description: "Kanban board grouped by category with drag-and-drop.",
		Component: KanbanView,
		Skeleton: KanbanViewSkeleton,
	},
];
