import { db } from "@/server/db";

/**
 * Sole Prisma caller for the `User` table from the API routes.
 *
 * The user id is always the caller's own session id, never one from the
 * request.
 */

/**
 * Rename a user.
 *
 * @param userId - The session user's id.
 * @param name - The validated new name.
 */
export async function updateUserName(
	userId: string,
	name: string,
): Promise<void> {
	await db.user.update({
		where: { id: userId },
		data: { name },
	});
}
