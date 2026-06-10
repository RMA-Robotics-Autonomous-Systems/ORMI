import { z } from "zod";

export const createWorkspaceSchema = z.object({
	title: z.string().min(1),
	userId: z.string().min(1),
	dashboardType: z.string().optional(),
});

export const reorderWorkspacesSchema = z.object({
	updates: z.array(
		z.object({
			id: z.number(),
			order: z.number(),
			categoryId: z.number().nullable().optional(),
		}),
	),
});

export const workspaceIdSchema = z.object({
	wsId: z.coerce.number().int().positive(),
});

export const workspaceUpdateSchema = z
	.object({
		content: z.any().optional(),
		categoryId: z.number().nullable().optional(),
	})
	.refine(
		(data) => data.content !== undefined || data.categoryId !== undefined,
		{
			message: "No update fields provided",
		},
	);

/**
 * Body schema for the workspace `PUT` route. All fields are optional; the
 * handler persists only the ones provided. Powers Rename (`name`), layout
 * engine switching (`dashboardType`), and full-content/category saves.
 */
export const workspacePutSchema = z
	.object({
		name: z.string().min(1).max(255).optional(),
		content: z.any().optional(),
		categoryId: z.number().nullable().optional(),
		dashboardType: z.enum(["GRID", "FLEX"]).optional(),
	})
	.refine(
		(data) =>
			data.name !== undefined ||
			data.content !== undefined ||
			data.categoryId !== undefined ||
			data.dashboardType !== undefined,
		{
			message: "No update fields provided",
		},
	);

export const emptyBodySchema = z.object({}).catchall(z.unknown());
