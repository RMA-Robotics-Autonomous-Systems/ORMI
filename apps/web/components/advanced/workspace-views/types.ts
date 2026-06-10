import type React from "react";
import type { LucideIcon } from "lucide-react";
import type { Category } from "@prisma/client";

import type {
	WorkspaceWithCategory,
	WorkspaceUpdate,
} from "@/components/advanced/misc/kanban/types";

/**
 * Identifier for a workspace browser view.
 *
 * NOTE: this is the *workspace browser* axis (how `/dashboard` lists
 * workspaces), not the in-workspace layout engine (`DASHBOARD_TYPES` in
 * `ormi-core`, which controls how widgets lay out inside an open workspace).
 *
 * LIST is the default. (The earlier GRID view was removed as redundant with
 * BOARD.)
 */
export type WorkspaceViewId = "LIST" | "BOARD";

/**
 * Props every workspace browser view receives. Data is fetched once by the
 * dashboard page and passed down, so switching views never refetches.
 *
 * `setWorkspaces` / `setCategories` are provided so presentational views (such
 * as the board) can apply optimistic local updates during drag-and-drop while
 * the page remains the single owner of the fetched state.
 */
export interface WorkspaceViewProps {
	/** All workspaces for the current user, ordered. */
	workspaces: WorkspaceWithCategory[];
	/** All categories for the current user, ordered. */
	categories: Category[];
	/** Apply an optimistic local update to the workspace list. */
	setWorkspaces: React.Dispatch<
		React.SetStateAction<WorkspaceWithCategory[]>
	>;
	/** Apply an optimistic local update to the category list. */
	setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
	/** Called after a workspace is deleted so the page can refetch. */
	onWorkspaceDeleted: () => void;
	/** Persist a reorder/recategorize of workspaces. */
	onWorkspaceUpdate: (updates: WorkspaceUpdate[]) => Promise<void>;
}

/**
 * A registered workspace browser view. `Component` (and the optional
 * `Skeleton`) MUST be stable, module-level references (Pattern 10) — never an
 * inline arrow — so switching views does not remount the view tree on every
 * render.
 */
export interface WorkspaceViewDefinition {
	id: WorkspaceViewId;
	name: string;
	icon: LucideIcon;
	description?: string;
	Component: React.FC<WorkspaceViewProps>;
	/**
	 * Optional loading skeleton matching this view's layout, rendered by the
	 * dashboard page while data is fetching. If omitted, the page falls back to
	 * the generic card-grid skeleton.
	 */
	Skeleton?: React.FC;
}
