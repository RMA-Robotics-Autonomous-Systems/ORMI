import { z } from "zod";

export const categoryCreateSchema = z.object({
	name: z.string().min(1).max(50),
});

export const categoryReorderSchema = z.object({
	updates: z.array(
		z.object({
			id: z.number(),
			order: z.number(),
		}),
	),
});

export const categoryUpdateSchema = z.object({
	name: z.string().min(1).max(50).optional(),
	order: z.number().optional(),
});

export const categoryIdSchema = z.object({
	id: z.coerce.number().int().positive(),
});

export const emptyBodySchema = z.object({}).catchall(z.unknown());
