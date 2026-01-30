import { Workspace, Category } from "@prisma/client";

export type WorkspaceWithCategory = Workspace & { categoryId: number | null };

export interface WorkspaceUpdate {
	id: number;
	order: number;
	categoryId?: number | null;
}
