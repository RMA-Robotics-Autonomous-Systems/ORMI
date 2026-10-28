import type { Prisma } from "@prisma/client";

import { db } from "@/server/db";

/**
 * Sole Prisma caller for the `Workspace` table from the workspace routes.
 *
 * Reads and bulk writes are scoped to `createdById: userId`, where the user id
 * is always the caller's session id. `updateWorkspace*` and `deleteWorkspace`
 * take a bare id: call them only after `findWorkspaceOwner` has answered with
 * the caller.
 */

/**
 * List a user's workspaces with their category.
 *
 * @param userId - The owner.
 * @returns Workspaces by ascending `order`, then most recently updated.
 */
export function listWorkspaces(userId: string) {
	return db.workspace.findMany({
		where: { createdById: userId },
		select: {
			id: true,
			name: true,
			createdAT: true,
			updatedAT: true,
			dashboardType: true,
			content: true,
			categoryId: true,
			order: true,
			category: {
				select: { id: true, name: true, order: true },
			},
		},
		orderBy: [{ order: "asc" }, { updatedAT: "desc" }],
	});
}

/**
 * Set order (and optionally category) of several workspaces in one
 * transaction. An id the user does not own matches nothing and is skipped.
 *
 * @param userId - The owner.
 * @param updates - Validated reorder entries.
 */
export async function reorderWorkspaces(
	userId: string,
	updates: { id: number; order: number; categoryId?: number | null }[],
): Promise<void> {
	await db.$transaction(
		updates.map(({ id, order, categoryId }) => {
			const data: { order: number; categoryId?: number | null } = {
				order,
			};
			if (categoryId !== undefined) {
				data.categoryId = categoryId;
			}
			return db.workspace.updateMany({
				where: { id, createdById: userId },
				data,
			});
		}),
	);
}

/**
 * Create an empty workspace.
 *
 * @param input - Name, owner and resolved layout engine.
 * @returns The created row.
 */
export function createWorkspace(input: {
	name: string;
	createdById: string;
	dashboardType: string;
}) {
	return db.workspace.create({
		data: {
			name: input.name,
			createdById: input.createdById,
			createdAT: new Date(),
			updatedAT: new Date(),
			dashboardType: input.dashboardType,
		},
	});
}

/**
 * Read one of a user's workspaces for the dashboard.
 *
 * @param id - Workspace id.
 * @param userId - The owner.
 * @returns The workspace, or `null` when it does not exist or belongs to
 * someone else.
 */
export function findOwnedWorkspace(id: number, userId: string) {
	return db.workspace.findUnique({
		where: { id, createdById: userId },
		select: {
			id: true,
			name: true,
			content: true,
			dashboardType: true,
		},
	});
}

/**
 * Read who owns a workspace.
 *
 * @param id - Workspace id.
 * @returns `{ createdById }`, or `null` when it does not exist.
 */
export function findWorkspaceOwner(id: number) {
	return db.workspace.findUnique({
		where: { id },
		select: { createdById: true },
	});
}

/** Fields a workspace update may carry; `undefined` leaves a column alone. */
interface WorkspaceUpdateFields {
	name?: string;
	content?: unknown;
	dashboardType?: string;
	categoryId?: number | null;
}

/**
 * Build the Prisma update from the provided fields only.
 *
 * @param fields - Validated update fields.
 * @returns The update data.
 */
function toUpdateData(fields: WorkspaceUpdateFields) {
	const data: {
		name?: string;
		content?: Prisma.InputJsonValue;
		dashboardType?: string;
		category?: { connect: { id: number } } | { disconnect: true };
	} = {};
	if (fields.name !== undefined) data.name = fields.name;
	if (fields.content !== undefined) {
		data.content = fields.content as Prisma.InputJsonValue;
	}
	if (fields.dashboardType !== undefined) {
		data.dashboardType = fields.dashboardType;
	}
	if (fields.categoryId !== undefined) {
		data.category =
			fields.categoryId === null
				? { disconnect: true }
				: { connect: { id: fields.categoryId } };
	}
	return data;
}

/**
 * Update a workspace's content and/or category (`PATCH`). Ownership is the
 * caller's check.
 *
 * @param id - Workspace id.
 * @param fields - Validated `content` / `categoryId`.
 * @returns `{ id, name, categoryId }`.
 */
export function updateWorkspaceContent(
	id: number,
	fields: Pick<WorkspaceUpdateFields, "content" | "categoryId">,
) {
	return db.workspace.update({
		where: { id },
		data: toUpdateData({
			content: fields.content,
			categoryId: fields.categoryId,
		}),
		select: { id: true, name: true, categoryId: true },
	});
}

/**
 * Update any of a workspace's fields (`PUT`). Ownership is the caller's
 * check.
 *
 * @param id - Workspace id.
 * @param fields - Validated update fields.
 * @returns `{ id, name, categoryId, dashboardType }`.
 */
export function updateWorkspace(id: number, fields: WorkspaceUpdateFields) {
	return db.workspace.update({
		where: { id },
		data: toUpdateData(fields),
		select: {
			id: true,
			name: true,
			categoryId: true,
			dashboardType: true,
		},
	});
}

/**
 * Delete a workspace. Ownership is the caller's check.
 *
 * @param id - Workspace id.
 */
export async function deleteWorkspace(id: number): Promise<void> {
	await db.workspace.delete({ where: { id } });
}
