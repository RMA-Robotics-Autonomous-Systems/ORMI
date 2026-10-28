import type { Prisma } from "@prisma/client";

import { db } from "@/server/db";

/**
 * Sole Prisma caller for the `Template` table from the template routes.
 *
 * `updateTemplate` and `deleteTemplate` take a bare id: call them only after
 * `findTemplateOwner` has answered with the caller.
 */

/** Stored template type. */
export type TemplateType = "WIDGET" | "DATASOURCE";

/**
 * List the templates a user can see: every public one and their own.
 *
 * @param userId - The session user.
 * @returns The rows, unordered.
 */
export function listVisibleTemplates(userId: string) {
	return db.template.findMany({
		where: {
			OR: [{ public: true }, { createdById: userId }],
		},
	});
}

/**
 * Create a template owned by a user.
 *
 * @param userId - The owner.
 * @param input - Name, type, visibility, tags and the full content payload.
 * @returns The created row.
 */
export function createTemplate(
	userId: string,
	input: {
		name: string;
		type: TemplateType;
		public?: boolean;
		tags?: string[];
		content: unknown;
	},
) {
	return db.template.create({
		data: {
			name: input.name,
			content: input.content as Prisma.InputJsonValue,
			type: input.type,
			public: input.public,
			tags: input.tags,
			createdById: userId,
			createdAT: new Date(),
			updatedAT: new Date(),
		},
	});
}

/**
 * Read who owns a template, and its type.
 *
 * @param id - Template id.
 * @returns `{ createdById, type }`, or `null` when it does not exist.
 */
export function findTemplateOwner(id: number) {
	return db.template.findUnique({
		where: { id },
		select: { createdById: true, type: true },
	});
}

/**
 * Replace a template's fields and content. Ownership is the caller's check.
 *
 * @param id - Template id.
 * @param input - New name, visibility, tags, type and content payload.
 * @returns The updated row.
 */
export function updateTemplate(
	id: number,
	input: {
		name?: string;
		public?: boolean;
		tags?: string[];
		type: TemplateType;
		content: unknown;
	},
) {
	return db.template.update({
		where: { id },
		data: {
			name: input.name,
			public: input.public,
			tags: input.tags,
			type: input.type,
			content: input.content as Prisma.InputJsonValue,
			updatedAT: new Date(),
		},
	});
}

/**
 * Delete a template. Ownership is the caller's check.
 *
 * @param id - Template id.
 */
export async function deleteTemplate(id: number): Promise<void> {
	await db.template.delete({ where: { id } });
}
