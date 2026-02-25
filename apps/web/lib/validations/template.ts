import { z } from "zod";

const templateTypeSchema = z.enum([
	"widget",
	"datasource",
	"WIDGET",
	"DATASOURCE",
]);

const templateContentSchema = z
	.object({
		name: z.string().min(1),
		type: templateTypeSchema,
		public: z.boolean().optional(),
		tags: z.array(z.string()).optional(),
		widget: z.any().optional(),
		datasource: z.any().optional(),
	})
	.catchall(z.unknown());

export const templateCreateSchema = z.object({
	content: templateContentSchema,
});

export const templateUpdateSchema = z
	.object({
		name: z.string().min(1).optional(),
		public: z.boolean().optional(),
		tags: z.array(z.string()).optional(),
		widget: z.any().optional(),
		datasource: z.any().optional(),
		type: templateTypeSchema.optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "No update fields provided",
	});

export const templateIdSchema = z.object({
	templateId: z.coerce.number().int().positive(),
});

export const emptyBodySchema = z.object({}).catchall(z.unknown());
