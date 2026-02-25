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

export const emptyBodySchema = z.object({}).catchall(z.unknown());
