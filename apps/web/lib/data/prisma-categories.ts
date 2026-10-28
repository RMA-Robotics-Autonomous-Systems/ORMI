import { db } from "@/server/db";

/**
 * Sole Prisma caller for the `Category` table.
 *
 * Every read and bulk write is scoped to `createdById: userId`, where the user
 * id is always the caller's session id. `updateCategory` and `deleteCategory`
 * take a bare id: call them only after `findOwnedCategory` has answered.
 */

/** Every category read carries its workspace count. */
const WITH_WORKSPACE_COUNT = {
	_count: { select: { workspaces: true } },
} as const;

/**
 * List a user's categories in display order.
 *
 * @param userId - The owner.
 * @returns Categories with their workspace count, ascending `order`.
 */
export function listCategories(userId: string) {
	return db.category.findMany({
		where: { createdById: userId },
		orderBy: { order: "asc" },
		include: WITH_WORKSPACE_COUNT,
	});
}

/**
 * Create a category after the user's last one.
 *
 * Throws Prisma's unique-constraint error on a duplicate name; the route maps
 * it to 409.
 *
 * @param userId - The owner.
 * @param name - The validated name.
 * @returns The new category with its workspace count.
 */
export async function createCategory(userId: string, name: string) {
	const maxOrder = await db.category.findFirst({
		where: { createdById: userId },
		orderBy: { order: "desc" },
		select: { order: true },
	});

	return db.category.create({
		data: {
			name,
			order: (maxOrder?.order ?? -1) + 1,
			createdById: userId,
		},
		include: WITH_WORKSPACE_COUNT,
	});
}

/**
 * Set the order of several categories in one transaction. An id the user
 * does not own matches nothing and is skipped.
 *
 * @param userId - The owner.
 * @param updates - Validated `{ id, order }` pairs.
 */
export async function reorderCategories(
	userId: string,
	updates: { id: number; order: number }[],
): Promise<void> {
	await db.$transaction(
		updates.map(({ id, order }) =>
			db.category.updateMany({
				where: { id, createdById: userId },
				data: { order },
			}),
		),
	);
}

/**
 * Read one of a user's categories.
 *
 * @param id - Category id.
 * @param userId - The owner.
 * @returns The category with its workspace count, or `null` when it does not
 * exist or belongs to someone else.
 */
export function findOwnedCategory(id: number, userId: string) {
	return db.category.findFirst({
		where: { id, createdById: userId },
		include: WITH_WORKSPACE_COUNT,
	});
}

/**
 * Update a category. Ownership is the caller's check.
 *
 * @param id - Category id.
 * @param data - Validated fields to change.
 * @returns The category with its workspace count.
 */
export function updateCategory(
	id: number,
	data: { name?: string; order?: number },
) {
	return db.category.update({
		where: { id },
		data,
		include: WITH_WORKSPACE_COUNT,
	});
}

/**
 * Delete a category. Ownership is the caller's check.
 *
 * @param id - Category id.
 */
export async function deleteCategory(id: number): Promise<void> {
	await db.category.delete({ where: { id } });
}
