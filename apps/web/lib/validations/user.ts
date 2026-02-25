import * as z from "zod";

/**
 * User name validation schema.
 */
export const userNameSchema = z.object({
	name: z.string().min(3).max(32),
});

export const userIdParamSchema = z.object({
	userId: z.string().min(1),
});
